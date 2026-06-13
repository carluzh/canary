// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title CanaryMarket
/// @notice A binary parametric insurance market on a machine-verifiable trigger:
///         "feed price < threshold, sustained for `breachWindow` seconds, before `expiry`".
///
/// Mechanics (Polymarket-style complete sets, fully collateralized):
///   - mintSets(n): deposit n collateral, receive n YES + n NO.
///   - burnSets(n): the reverse, any time before resolution.
///   - An embedded limit order book trades YES/NO against collateral. The price
///     of YES (in [0,1) collateral per token) IS the market-implied depeg
///     probability — the risk-curve data point.
///   - settleDepeg(startRoundId): permissionless. Walks the feed's on-chain round
///     history to prove the price stayed below threshold for the full window.
///     If proven, YES redeems 1:1, NO is worthless.
///   - settleExpiry(): permissionless, after expiry + a grace period (the grace
///     leaves time to prove a late breach). NO redeems 1:1, YES is worthless.
///
/// Insurance mapping: coverage buyer = YES buyer (premium = YES price);
/// underwriter = mints a set, sells YES, keeps NO (collateral earns nothing in
/// v1 — yield routing is a later layer).
///
/// Assumptions (documented, enforced where possible):
///   - Collateral is USDC-like: returns true, no fees on transfer, no rebasing.
///   - The feed has monotonically increasing, gapless round ids (true for a
///     single aggregator phase and for our mock). Chainlink *proxy* feeds change
///     phase rarely; a breach window spanning a phase boundary would need the
///     proxy-aware variant — out of scope for the hackathon, flagged in README.
contract CanaryMarket {
    // ---------------------------------------------------------------- types

    enum State {
        Open, // trading live, not resolved
        TriggeredYes, // depeg proven: YES pays 1, NO pays 0
        ExpiredNo // expired without proven depeg: NO pays 1, YES pays 0
    }

    struct Order {
        address maker;
        bool isYes; // which outcome token the order trades
        bool isBuy; // true: maker pays collateral for tokens; false: maker sells tokens
        uint64 price; // collateral per token, scaled by PRICE_SCALE, in (0, PRICE_SCALE)
        uint128 remaining; // outcome tokens left to trade
        uint128 collateralEscrow; // for buy orders: collateral still locked
    }

    // ---------------------------------------------------------------- errors

    error InvalidParams();
    error MarketNotOpen();
    error TradingClosed();
    error ZeroAmount();
    error InvalidPrice();
    error InsufficientBalance();
    error NotMaker();
    error OrderInactive();
    error FillTooLarge();
    error TransferFailed();
    error InvalidRound();
    error RoundBeforeCreation();
    error PriceNotBelowThreshold();
    error BreachWindowExceedsExpiry();
    error BreachInterrupted(uint80 roundId);
    error BreachWindowNotElapsed();
    error NotYetExpired();
    error NotResolved();
    error NothingToRedeem();
    error Reentrancy();

    // ---------------------------------------------------------------- events

    event SetsMinted(address indexed account, uint256 amount);
    event SetsBurned(address indexed account, uint256 amount);
    event OrderPlaced(
        uint256 indexed orderId, address indexed maker, bool isYes, bool isBuy, uint64 price, uint128 amount
    );
    event OrderFilled(
        uint256 indexed orderId, address indexed taker, uint128 amount, uint256 collateralPaid, uint64 price
    );
    event OrderCancelled(uint256 indexed orderId);
    event MarketTriggered(uint80 startRoundId, uint256 breachStart);
    event MarketExpired();
    event Redeemed(address indexed account, uint256 payout);

    // ---------------------------------------------------------------- config

    /// @notice Price scale: an order price of 950_000 means 0.95 collateral per
    /// token, i.e. an implied probability of 95%.
    uint256 public constant PRICE_SCALE = 1e6;

    IERC20 public immutable collateral;
    AggregatorV3Interface public immutable priceFeed;
    /// @notice Trigger threshold in feed decimals (e.g. 0.95e8 for a USD feed).
    int256 public immutable depegThreshold;
    /// @notice Seconds the price must stay below threshold to trigger.
    uint64 public immutable breachWindow;
    /// @notice Trading stops and triggers must have completed by this timestamp.
    uint64 public immutable expiry;
    /// @notice After expiry, settleExpiry() must wait this long so a breach that
    /// completed just before expiry can still be proven via settleDepeg().
    uint64 public immutable settlementGrace;
    /// @notice Market creation time; feed rounds before this cannot trigger.
    uint64 public immutable createdAt;

    /// @notice Human-readable trigger description, e.g. "USDe < $0.95 for 1h".
    string public description;

    // ---------------------------------------------------------------- state

    State public state;
    /// @notice Feed timestamp at which the proven breach window started (0 until triggered).
    uint256 public breachStart;

    mapping(address => uint256) public yesBalance;
    mapping(address => uint256) public noBalance;
    uint256 public yesSupply;
    uint256 public noSupply;

    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;
    /// @notice Total collateral locked in open buy orders (solvency accounting).
    uint256 public totalBuyEscrow;

    uint256 private _reentrancyLock = 1;

    modifier nonReentrant() {
        if (_reentrancyLock != 1) revert Reentrancy();
        _reentrancyLock = 2;
        _;
        _reentrancyLock = 1;
    }

    // ---------------------------------------------------------------- setup

    constructor(
        IERC20 collateral_,
        AggregatorV3Interface priceFeed_,
        int256 depegThreshold_,
        uint64 breachWindow_,
        uint64 expiry_,
        uint64 settlementGrace_,
        string memory description_
    ) {
        if (address(collateral_) == address(0) || address(priceFeed_) == address(0)) revert InvalidParams();
        if (depegThreshold_ <= 0) revert InvalidParams();
        if (breachWindow_ == 0) revert InvalidParams();
        // A breach must be able to complete before expiry, else YES can never win.
        if (expiry_ <= block.timestamp + breachWindow_) revert InvalidParams();

        collateral = collateral_;
        priceFeed = priceFeed_;
        depegThreshold = depegThreshold_;
        breachWindow = breachWindow_;
        expiry = expiry_;
        settlementGrace = settlementGrace_;
        createdAt = uint64(block.timestamp);
        description = description_;
    }

    // ------------------------------------------------------- complete sets

    /// @notice Deposit `amount` collateral, receive `amount` YES and `amount` NO.
    function mintSets(uint256 amount) external nonReentrant {
        _checkTradingOpen();
        if (amount == 0) revert ZeroAmount();

        yesBalance[msg.sender] += amount;
        noBalance[msg.sender] += amount;
        yesSupply += amount;
        noSupply += amount;

        _pullCollateral(msg.sender, amount);
        emit SetsMinted(msg.sender, amount);
    }

    /// @notice Burn `amount` YES + `amount` NO, receive `amount` collateral back.
    /// Allowed any time before resolution (a complete set is always worth 1).
    function burnSets(uint256 amount) external nonReentrant {
        if (state != State.Open) revert MarketNotOpen();
        if (amount == 0) revert ZeroAmount();
        if (yesBalance[msg.sender] < amount || noBalance[msg.sender] < amount) revert InsufficientBalance();

        yesBalance[msg.sender] -= amount;
        noBalance[msg.sender] -= amount;
        yesSupply -= amount;
        noSupply -= amount;

        _pushCollateral(msg.sender, amount);
        emit SetsBurned(msg.sender, amount);
    }

    // ---------------------------------------------------------- order book

    /// @notice Place a limit order. Buy orders escrow collateral (rounded up);
    /// sell orders escrow the outcome tokens.
    function placeOrder(bool isYes, bool isBuy, uint64 price, uint128 amount)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        _checkTradingOpen();
        if (amount == 0) revert ZeroAmount();
        if (price == 0 || price >= PRICE_SCALE) revert InvalidPrice();

        uint128 escrow = 0;
        if (isBuy) {
            // Round up so the escrow always covers floor-rounded partial payouts.
            escrow = uint128((uint256(amount) * price + PRICE_SCALE - 1) / PRICE_SCALE);
            totalBuyEscrow += escrow;
        } else {
            mapping(address => uint256) storage bal = isYes ? yesBalance : noBalance;
            if (bal[msg.sender] < amount) revert InsufficientBalance();
            bal[msg.sender] -= amount;
        }

        orderId = nextOrderId++;
        orders[orderId] =
            Order({maker: msg.sender, isYes: isYes, isBuy: isBuy, price: price, remaining: amount, collateralEscrow: escrow});

        if (isBuy) _pullCollateral(msg.sender, escrow);
        emit OrderPlaced(orderId, msg.sender, isYes, isBuy, price, amount);
    }

    /// @notice Cancel an order and recover its escrow. Allowed in any state so
    /// funds are never stranded after resolution.
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.maker != msg.sender) revert NotMaker();
        if (order.remaining == 0) revert OrderInactive();

        uint128 remaining = order.remaining;
        uint128 escrow = order.collateralEscrow;
        order.remaining = 0;
        order.collateralEscrow = 0;

        if (order.isBuy) {
            totalBuyEscrow -= escrow;
            _pushCollateral(msg.sender, escrow);
        } else {
            mapping(address => uint256) storage bal = order.isYes ? yesBalance : noBalance;
            bal[msg.sender] += remaining;
        }
        emit OrderCancelled(orderId);
    }

    /// @notice Fill up to `amount` of an open order at the maker's limit price.
    /// Filling a buy order: taker delivers outcome tokens, receives escrowed
    /// collateral. Filling a sell order: taker pays collateral straight to the
    /// maker, receives the escrowed outcome tokens.
    function fillOrder(uint256 orderId, uint128 amount) external nonReentrant {
        _checkTradingOpen();
        Order storage order = orders[orderId];
        if (order.remaining == 0) revert OrderInactive();
        if (amount == 0) revert ZeroAmount();
        if (amount > order.remaining) revert FillTooLarge();

        mapping(address => uint256) storage bal = order.isYes ? yesBalance : noBalance;
        uint256 paid;

        if (order.isBuy) {
            // Last fill sweeps the whole escrow so rounding dust never sticks.
            bool isFinal = amount == order.remaining;
            paid = isFinal ? order.collateralEscrow : (uint256(amount) * order.price) / PRICE_SCALE;

            if (bal[msg.sender] < amount) revert InsufficientBalance();
            bal[msg.sender] -= amount;
            bal[order.maker] += amount;
            order.remaining -= amount;
            order.collateralEscrow -= uint128(paid);
            totalBuyEscrow -= paid;

            _pushCollateral(msg.sender, paid);
        } else {
            // Round up: a taker can never take tokens for zero collateral.
            paid = (uint256(amount) * order.price + PRICE_SCALE - 1) / PRICE_SCALE;

            order.remaining -= amount;
            bal[msg.sender] += amount;

            if (!collateral.transferFrom(msg.sender, order.maker, paid)) revert TransferFailed();
        }
        emit OrderFilled(orderId, msg.sender, amount, paid, order.price);
    }

    // ----------------------------------------------------------- settlement

    /// @notice Prove a depeg from on-chain feed history and trigger the market.
    /// Permissionless: anyone (a YES holder, the frontend, a bot) can call it.
    ///
    /// @param startRoundId A feed round whose answer is below the threshold and
    /// whose timestamp is at/after market creation. The proof walks forward from
    /// there: every subsequent round until `start + breachWindow` must also be
    /// below threshold. Between rounds the feed price is, by definition, the
    /// last posted answer, so consecutive below-threshold rounds spanning the
    /// window prove continuous breach. If the feed simply stopped updating while
    /// below threshold, the breach persists, and the call succeeds once
    /// block.timestamp passes the window end.
    function settleDepeg(uint80 startRoundId) external {
        if (state != State.Open) revert MarketNotOpen();

        (bool startExists, int256 startAnswer, uint256 startUpdatedAt) = _tryGetRound(startRoundId);
        if (!startExists) revert InvalidRound();
        if (startUpdatedAt < createdAt) revert RoundBeforeCreation();
        if (startAnswer >= depegThreshold) revert PriceNotBelowThreshold();

        uint256 windowEnd = startUpdatedAt + breachWindow;
        // The full window must have elapsed before expiry: a breach still "in
        // progress" at expiry does not pay out.
        if (windowEnd > expiry) revert BreachWindowExceedsExpiry();

        uint80 roundId = startRoundId;
        while (true) {
            (bool exists, int256 answer, uint256 updatedAt) = _tryGetRound(roundId + 1);
            if (!exists) {
                // No later round: the feed price has been the last (breached)
                // answer ever since. The breach is proven once the window has
                // actually elapsed in wall-clock time.
                if (block.timestamp < windowEnd) revert BreachWindowNotElapsed();
                break;
            }
            if (updatedAt >= windowEnd) break; // round in effect through window end was breached
            if (answer >= depegThreshold) revert BreachInterrupted(roundId + 1);
            roundId++;
        }

        state = State.TriggeredYes;
        breachStart = startUpdatedAt;
        emit MarketTriggered(startRoundId, startUpdatedAt);
    }

    /// @notice Resolve to NO after expiry plus the settlement grace period.
    /// The grace window exists so a breach completing right before expiry can
    /// still be proven via settleDepeg() before NO is locked in.
    function settleExpiry() external {
        if (state != State.Open) revert MarketNotOpen();
        if (block.timestamp <= uint256(expiry) + settlementGrace) revert NotYetExpired();

        state = State.ExpiredNo;
        emit MarketExpired();
    }

    /// @notice Redeem winning outcome tokens 1:1 for collateral. Tokens locked
    /// in open sell orders must be recovered with cancelOrder() first.
    function redeem() external nonReentrant returns (uint256 payout) {
        if (state == State.Open) revert NotResolved();

        if (state == State.TriggeredYes) {
            payout = yesBalance[msg.sender];
            yesBalance[msg.sender] = 0;
            yesSupply -= payout;
        } else {
            payout = noBalance[msg.sender];
            noBalance[msg.sender] = 0;
            noSupply -= payout;
        }
        if (payout == 0) revert NothingToRedeem();

        _pushCollateral(msg.sender, payout);
        emit Redeemed(msg.sender, payout);
    }

    // ---------------------------------------------------------------- views

    /// @notice Everything a frontend needs to render the market in one call.
    function marketInfo()
        external
        view
        returns (
            State state_,
            address collateral_,
            address priceFeed_,
            int256 depegThreshold_,
            uint64 breachWindow_,
            uint64 expiry_,
            uint64 settlementGrace_,
            uint256 yesSupply_,
            uint256 noSupply_,
            string memory description_
        )
    {
        return (
            state,
            address(collateral),
            address(priceFeed),
            depegThreshold,
            breachWindow,
            expiry,
            settlementGrace,
            yesSupply,
            noSupply,
            description
        );
    }

    /// @notice All orders with remaining size, for frontends without an indexer.
    /// O(nextOrderId) — fine at demo scale; index OrderPlaced/Filled events at real scale.
    function openOrders() external view returns (uint256[] memory ids, Order[] memory openList) {
        uint256 total = nextOrderId;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (orders[i].remaining > 0) count++;
        }
        ids = new uint256[](count);
        openList = new Order[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < total; i++) {
            if (orders[i].remaining > 0) {
                ids[j] = i;
                openList[j] = orders[i];
                j++;
            }
        }
    }

    // ------------------------------------------------------------ internals

    function _checkTradingOpen() internal view {
        if (state != State.Open) revert MarketNotOpen();
        if (block.timestamp >= expiry) revert TradingClosed();
    }

    function _tryGetRound(uint80 roundId) internal view returns (bool exists, int256 answer, uint256 updatedAt) {
        try priceFeed.getRoundData(roundId) returns (uint80, int256 answer_, uint256, uint256 updatedAt_, uint80) {
            // Some aggregators return zeroed data instead of reverting for
            // unknown rounds; treat updatedAt == 0 as nonexistent.
            return (updatedAt_ != 0, answer_, updatedAt_);
        } catch {
            return (false, 0, 0);
        }
    }

    function _pullCollateral(address from, uint256 amount) internal {
        if (!collateral.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _pushCollateral(address to, uint256 amount) internal {
        if (!collateral.transfer(to, amount)) revert TransferFailed();
    }
}
