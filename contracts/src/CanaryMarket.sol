// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

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
///   - settleDepeg / settleExpiry: permissionless settlement off the feed.
///
/// Optional yield layer ("self-funding cover", off unless `enableYield` is
/// called once at creation):
///   - 100% of idle collateral is rehypothecated into a yield venue
///     (`IYieldStrategy`: USYC, an Aave-USDC 4626 vault, …) — no idle buffer;
///     withdrawals redeem exactly what they need, so capital earns until it
///     leaves. Instant settlement relies on the venue's atomic redeem.
///   - Yield is split three ways: a protocol fee (bps, 0 on testnet), the
///     underwriters (NO holders — "deposit to underwrite, earn yield +
///     premiums"), and a rebate streamed to coverage buyers (YES holders) that
///     lowers their net premium. For deep-tail, long-dated cover the yield can
///     exceed the premium → cover that funds itself.
///   - Distribution within each side is pro-rata by held-balance × time
///     (a MasterChef-style accumulator). Tokens resting in open orders forgo
///     yield while they rest; that yield is socialised to active holders.
///
/// Insurance mapping: coverage buyer = YES buyer; underwriter = mints a set,
/// sells YES, keeps NO.
///
/// Assumptions: collateral is USDC-like (returns true, no fee-on-transfer, no
/// rebasing); the feed has gapless round ids within a phase; the yield strategy
/// is independent of the insured risk (enforced socially + by asset() check) and
/// redeems atomically.
contract CanaryMarket {
    // ---------------------------------------------------------------- types

    enum State {
        Open, // trading live, not resolved
        TriggeredYes, // depeg proven: YES pays 1, NO pays 0
        ExpiredNo // expired without proven depeg: NO pays 1, YES pays 0
    }

    struct Order {
        address maker;
        bool isYes;
        bool isBuy;
        uint64 price; // collateral per token, scaled by PRICE_SCALE, in (0, PRICE_SCALE)
        uint128 remaining;
        uint128 collateralEscrow;
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
    error NotDeployer();
    error YieldAlreadyEnabled();
    error YieldDisabled();
    error InvalidYieldConfig();

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
    event YieldEnabled(address strategy, uint256 protocolFeeBps, uint256 buyerRebateBps, address feeRecipient);
    event YieldHarvested(uint256 newYield, uint256 fee, uint256 toBuyers, uint256 toUnderwriters);
    event YieldClaimed(address indexed account, uint256 amount);
    event FeeClaimed(uint256 amount);

    // ---------------------------------------------------------------- config

    uint256 public constant PRICE_SCALE = 1e6;
    uint256 public constant YIELD_SCALE = 1e18;

    IERC20 public immutable collateral;
    AggregatorV3Interface public immutable priceFeed;
    int256 public immutable depegThreshold;
    uint64 public immutable breachWindow;
    uint64 public immutable expiry;
    uint64 public immutable settlementGrace;
    uint64 public immutable createdAt;
    address public immutable deployer; // may enable yield once, before any activity

    string public description;

    // ---------------------------------------------------------------- state

    State public state;
    uint256 public breachStart;

    mapping(address => uint256) public yesBalance;
    mapping(address => uint256) public noBalance;
    uint256 public yesSupply;
    uint256 public noSupply;

    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;
    uint256 public totalBuyEscrow;

    // ------- yield layer (all zero / inert unless enableYield was called) ----
    IYieldStrategy public yieldStrategy;
    address public feeRecipient;
    uint256 public protocolFeeBps; // of gross yield
    uint256 public buyerRebateBps; // of net yield, to YES holders
    bool public yieldFrozen; // set at resolution; stops further accrual

    uint256 public totalShares; // strategy shares held by the market
    uint256 public yesHeld; // sum of held yesBalance (accumulator denominator)
    uint256 public noHeld; // sum of held noBalance
    uint256 public accYieldPerYes; // YIELD_SCALE-scaled
    uint256 public accYieldPerNo;
    mapping(address => uint256) public yesYieldDebt;
    mapping(address => uint256) public noYieldDebt;
    mapping(address => uint256) public claimableYield;
    uint256 public totalCredited; // cumulative yield routed to accumulators + fee
    uint256 public totalYieldClaimed; // cumulative yield paid out (incl. fee)
    uint256 public feeAccrued; // protocol fee owed to feeRecipient

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
        if (expiry_ <= block.timestamp + breachWindow_) revert InvalidParams();

        collateral = collateral_;
        priceFeed = priceFeed_;
        depegThreshold = depegThreshold_;
        breachWindow = breachWindow_;
        expiry = expiry_;
        settlementGrace = settlementGrace_;
        createdAt = uint64(block.timestamp);
        description = description_;
        deployer = msg.sender;
    }

    /// @notice Turn on the yield layer. Callable once by the deployer (the
    /// factory) before any positions exist. The strategy must use this market's
    /// collateral as its asset, and must be independent of the insured risk
    /// (the deployer's responsibility — e.g. USYC's T-bill yield vs a USDe
    /// depeg). `protocolFeeBps` should be 0 on testnet.
    function enableYield(
        IYieldStrategy strategy_,
        uint256 protocolFeeBps_,
        uint256 buyerRebateBps_,
        address feeRecipient_
    ) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(yieldStrategy) != address(0)) revert YieldAlreadyEnabled();
        if (yesSupply != 0 || totalBuyEscrow != 0) revert YieldAlreadyEnabled();
        if (address(strategy_) == address(0) || strategy_.asset() != address(collateral)) revert InvalidYieldConfig();
        if (protocolFeeBps_ > 2_000 || buyerRebateBps_ > 10_000) revert InvalidYieldConfig();
        if (feeRecipient_ == address(0) && protocolFeeBps_ != 0) revert InvalidYieldConfig();

        yieldStrategy = strategy_;
        protocolFeeBps = protocolFeeBps_;
        buyerRebateBps = buyerRebateBps_;
        feeRecipient = feeRecipient_;
        collateral.approve(address(strategy_), type(uint256).max);
        emit YieldEnabled(address(strategy_), protocolFeeBps_, buyerRebateBps_, feeRecipient_);
    }

    // ------------------------------------------------------- complete sets

    function mintSets(uint256 amount) external nonReentrant {
        _checkTradingOpen();
        if (amount == 0) revert ZeroAmount();
        _harvest();

        _addYes(msg.sender, amount);
        _addNo(msg.sender, amount);
        yesSupply += amount;
        noSupply += amount;

        _pullCollateral(msg.sender, amount);
        emit SetsMinted(msg.sender, amount);
    }

    function burnSets(uint256 amount) external nonReentrant {
        if (state != State.Open) revert MarketNotOpen();
        if (amount == 0) revert ZeroAmount();
        if (yesBalance[msg.sender] < amount || noBalance[msg.sender] < amount) revert InsufficientBalance();
        _harvest();

        _subYes(msg.sender, amount);
        _subNo(msg.sender, amount);
        yesSupply -= amount;
        noSupply -= amount;

        _pushCollateral(msg.sender, amount);
        emit SetsBurned(msg.sender, amount);
    }

    // ---------------------------------------------------------- order book

    function placeOrder(bool isYes, bool isBuy, uint64 price, uint128 amount)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        _checkTradingOpen();
        if (amount == 0) revert ZeroAmount();
        if (price == 0 || price >= PRICE_SCALE) revert InvalidPrice();
        _harvest();

        uint128 escrow = 0;
        if (isBuy) {
            escrow = uint128((uint256(amount) * price + PRICE_SCALE - 1) / PRICE_SCALE);
            totalBuyEscrow += escrow;
        } else {
            uint256 bal = isYes ? yesBalance[msg.sender] : noBalance[msg.sender];
            if (bal < amount) revert InsufficientBalance();
            _sub(isYes, msg.sender, amount);
        }

        orderId = nextOrderId++;
        orders[orderId] =
            Order({maker: msg.sender, isYes: isYes, isBuy: isBuy, price: price, remaining: amount, collateralEscrow: escrow});

        if (isBuy) _pullCollateral(msg.sender, escrow);
        emit OrderPlaced(orderId, msg.sender, isYes, isBuy, price, amount);
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.maker != msg.sender) revert NotMaker();
        if (order.remaining == 0) revert OrderInactive();
        _harvest();

        uint128 remaining = order.remaining;
        uint128 escrow = order.collateralEscrow;
        bool isBuy = order.isBuy;
        bool isYes = order.isYes;
        order.remaining = 0;
        order.collateralEscrow = 0;

        if (isBuy) {
            totalBuyEscrow -= escrow;
            _pushCollateral(msg.sender, escrow);
        } else {
            _add(isYes, msg.sender, remaining);
        }
        emit OrderCancelled(orderId);
    }

    function fillOrder(uint256 orderId, uint128 amount) external nonReentrant {
        _checkTradingOpen();
        Order storage order = orders[orderId];
        if (order.remaining == 0) revert OrderInactive();
        if (amount == 0) revert ZeroAmount();
        if (amount > order.remaining) revert FillTooLarge();
        _harvest();

        bool isYes = order.isYes;
        uint256 paid;

        if (order.isBuy) {
            bool isFinal = amount == order.remaining;
            paid = isFinal ? order.collateralEscrow : (uint256(amount) * order.price) / PRICE_SCALE;

            uint256 bal = isYes ? yesBalance[msg.sender] : noBalance[msg.sender];
            if (bal < amount) revert InsufficientBalance();
            _sub(isYes, msg.sender, amount);
            _add(isYes, order.maker, amount);
            order.remaining -= amount;
            order.collateralEscrow -= uint128(paid);
            totalBuyEscrow -= paid;

            _pushCollateral(msg.sender, paid);
        } else {
            paid = (uint256(amount) * order.price + PRICE_SCALE - 1) / PRICE_SCALE;

            order.remaining -= amount;
            _add(isYes, msg.sender, amount);

            // premium is paid maker-to-taker directly; it never enters the pool.
            if (!collateral.transferFrom(msg.sender, order.maker, paid)) revert TransferFailed();
        }
        emit OrderFilled(orderId, msg.sender, amount, paid, order.price);
    }

    // ----------------------------------------------------------- settlement

    function settleDepeg(uint80 startRoundId) external {
        if (state != State.Open) revert MarketNotOpen();

        (bool startExists, int256 startAnswer, uint256 startUpdatedAt) = _tryGetRound(startRoundId);
        if (!startExists) revert InvalidRound();
        if (startUpdatedAt < createdAt) revert RoundBeforeCreation();
        if (startAnswer >= depegThreshold) revert PriceNotBelowThreshold();

        uint256 windowEnd = startUpdatedAt + breachWindow;
        if (windowEnd > expiry) revert BreachWindowExceedsExpiry();

        uint80 roundId = startRoundId;
        while (true) {
            (bool exists, int256 answer, uint256 updatedAt) = _tryGetRound(roundId + 1);
            if (!exists) {
                if (block.timestamp < windowEnd) revert BreachWindowNotElapsed();
                break;
            }
            if (updatedAt >= windowEnd) break;
            if (answer >= depegThreshold) revert BreachInterrupted(roundId + 1);
            roundId++;
        }

        _harvest();
        yieldFrozen = true;
        state = State.TriggeredYes;
        breachStart = startUpdatedAt;
        emit MarketTriggered(startRoundId, startUpdatedAt);
    }

    function settleExpiry() external {
        if (state != State.Open) revert MarketNotOpen();
        if (block.timestamp <= uint256(expiry) + settlementGrace) revert NotYetExpired();

        _harvest();
        yieldFrozen = true;
        state = State.ExpiredNo;
        emit MarketExpired();
    }

    /// @notice Redeem winning tokens 1:1 for collateral, plus any accrued yield.
    /// (Losing-side holders who earned yield while underwriting claim it via
    /// claimYield.) Tokens resting in sell orders must be cancelOrder'd first.
    function redeem() external nonReentrant returns (uint256 payout) {
        if (state == State.Open) revert NotResolved();
        _harvest(); // no-op (frozen), but keeps debts consistent

        if (state == State.TriggeredYes) {
            payout = yesBalance[msg.sender];
            if (payout > 0) {
                _subYes(msg.sender, payout);
                yesSupply -= payout;
            }
        } else {
            payout = noBalance[msg.sender];
            if (payout > 0) {
                _subNo(msg.sender, payout);
                noSupply -= payout;
            }
        }

        uint256 yieldAmt = claimableYield[msg.sender];
        if (yieldAmt > 0) {
            claimableYield[msg.sender] = 0;
            totalYieldClaimed += yieldAmt;
        }

        uint256 total = payout + yieldAmt;
        if (total == 0) revert NothingToRedeem();

        _pushCollateral(msg.sender, total);
        emit Redeemed(msg.sender, payout);
    }

    // -------------------------------------------------------------- yield

    /// @notice Claim accrued yield without touching your positions.
    function claimYield() external nonReentrant returns (uint256 amount) {
        if (!_yieldOn()) revert YieldDisabled();
        _harvest();
        _checkpointYes(msg.sender);
        _checkpointNo(msg.sender);
        amount = claimableYield[msg.sender];
        if (amount == 0) revert NothingToRedeem();
        claimableYield[msg.sender] = 0;
        totalYieldClaimed += amount;
        _pushCollateral(msg.sender, amount);
        emit YieldClaimed(msg.sender, amount);
    }

    /// @notice Sweep the protocol fee to the fee recipient (permissionless).
    function claimFee() external nonReentrant returns (uint256 amount) {
        _harvest();
        amount = feeAccrued;
        if (amount == 0) revert NothingToRedeem();
        feeAccrued = 0;
        totalYieldClaimed += amount;
        _pushCollateral(feeRecipient, amount);
        emit FeeClaimed(amount);
    }

    /// @notice Public accrual trigger (anyone).
    function harvestYield() external {
        _harvest();
    }

    // ---------------------------------------------------------------- views

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

    /// @notice A user's claimable yield (claimable + un-settled accumulator
    /// pending, against the last harvest — call harvestYield first for exactness).
    function pendingYield(address account) external view returns (uint256) {
        if (!_yieldOn()) return 0;
        uint256 y = yesBalance[account] * accYieldPerYes / YIELD_SCALE - yesYieldDebt[account];
        uint256 n = noBalance[account] * accYieldPerNo / YIELD_SCALE - noYieldDebt[account];
        return claimableYield[account] + y + n;
    }

    /// @notice Total assets the market controls (idle + deployed in the venue).
    function totalCollateralValue() public view returns (uint256) {
        uint256 deployed = _yieldOn() ? yieldStrategy.convertToAssets(totalShares) : 0;
        return collateral.balanceOf(address(this)) + deployed;
    }

    // ------------------------------------------------------------ internals

    function _yieldOn() internal view returns (bool) {
        return address(yieldStrategy) != address(0);
    }

    function _checkTradingOpen() internal view {
        if (state != State.Open) revert MarketNotOpen();
        if (block.timestamp >= expiry) revert TradingClosed();
    }

    // ---- yield accounting ----

    /// @dev Realise yield generated since the last harvest and route it to the
    /// fee + the two side-accumulators. newYield is bounded by actually-generated
    /// surplus, so distribution can never exceed what the venue produced.
    function _harvest() internal {
        if (!_yieldOn() || yieldFrozen) return;
        uint256 principal = yesSupply + totalBuyEscrow; // yes==no supply pre-resolution
        uint256 lhs = totalCollateralValue() + totalYieldClaimed;
        uint256 rhs = principal + totalCredited;
        if (lhs <= rhs) return;
        uint256 newYield = lhs - rhs;

        uint256 fee = (newYield * protocolFeeBps) / 10_000;
        uint256 dist = newYield - fee;
        uint256 buyerPart = (dist * buyerRebateBps) / 10_000;
        uint256 underPart = dist - buyerPart;

        uint256 credited = fee;
        if (fee > 0) feeAccrued += fee;
        if (yesHeld > 0 && buyerPart > 0) {
            accYieldPerYes += (buyerPart * YIELD_SCALE) / yesHeld;
            credited += buyerPart;
        }
        if (noHeld > 0 && underPart > 0) {
            accYieldPerNo += (underPart * YIELD_SCALE) / noHeld;
            credited += underPart;
        }
        totalCredited += credited; // undistributed parts (held==0) stay for next harvest
        emit YieldHarvested(newYield, fee, yesHeld > 0 ? buyerPart : 0, noHeld > 0 ? underPart : 0);
    }

    function _checkpointYes(address u) internal {
        uint256 p = yesBalance[u] * accYieldPerYes / YIELD_SCALE - yesYieldDebt[u];
        if (p > 0) claimableYield[u] += p;
        yesYieldDebt[u] = yesBalance[u] * accYieldPerYes / YIELD_SCALE;
    }

    function _checkpointNo(address u) internal {
        uint256 p = noBalance[u] * accYieldPerNo / YIELD_SCALE - noYieldDebt[u];
        if (p > 0) claimableYield[u] += p;
        noYieldDebt[u] = noBalance[u] * accYieldPerNo / YIELD_SCALE;
    }

    function _add(bool isYes, address u, uint256 amt) internal {
        if (isYes) _addYes(u, amt);
        else _addNo(u, amt);
    }

    function _sub(bool isYes, address u, uint256 amt) internal {
        if (isYes) _subYes(u, amt);
        else _subNo(u, amt);
    }

    function _addYes(address u, uint256 amt) internal {
        if (_yieldOn()) {
            uint256 p = yesBalance[u] * accYieldPerYes / YIELD_SCALE - yesYieldDebt[u];
            if (p > 0) claimableYield[u] += p;
            yesHeld += amt;
        }
        yesBalance[u] += amt;
        if (_yieldOn()) yesYieldDebt[u] = yesBalance[u] * accYieldPerYes / YIELD_SCALE;
    }

    function _subYes(address u, uint256 amt) internal {
        if (_yieldOn()) {
            uint256 p = yesBalance[u] * accYieldPerYes / YIELD_SCALE - yesYieldDebt[u];
            if (p > 0) claimableYield[u] += p;
            yesHeld -= amt;
        }
        yesBalance[u] -= amt;
        if (_yieldOn()) yesYieldDebt[u] = yesBalance[u] * accYieldPerYes / YIELD_SCALE;
    }

    function _addNo(address u, uint256 amt) internal {
        if (_yieldOn()) {
            uint256 p = noBalance[u] * accYieldPerNo / YIELD_SCALE - noYieldDebt[u];
            if (p > 0) claimableYield[u] += p;
            noHeld += amt;
        }
        noBalance[u] += amt;
        if (_yieldOn()) noYieldDebt[u] = noBalance[u] * accYieldPerNo / YIELD_SCALE;
    }

    function _subNo(address u, uint256 amt) internal {
        if (_yieldOn()) {
            uint256 p = noBalance[u] * accYieldPerNo / YIELD_SCALE - noYieldDebt[u];
            if (p > 0) claimableYield[u] += p;
            noHeld -= amt;
        }
        noBalance[u] -= amt;
        if (_yieldOn()) noYieldDebt[u] = noBalance[u] * accYieldPerNo / YIELD_SCALE;
    }

    // ---- feed ----

    function _tryGetRound(uint80 roundId) internal view returns (bool exists, int256 answer, uint256 updatedAt) {
        try priceFeed.getRoundData(roundId) returns (uint80, int256 answer_, uint256, uint256 updatedAt_, uint80) {
            return (updatedAt_ != 0, answer_, updatedAt_);
        } catch {
            return (false, 0, 0);
        }
    }

    // ---- collateral routing (100% deployed when yield is on) ----

    function _pullCollateral(address from, uint256 amount) internal {
        if (!collateral.transferFrom(from, address(this), amount)) revert TransferFailed();
        if (_yieldOn() && !yieldFrozen) {
            totalShares += yieldStrategy.deposit(amount);
        }
    }

    function _pushCollateral(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (_yieldOn()) {
            uint256 idle = collateral.balanceOf(address(this));
            if (idle < amount) {
                totalShares -= yieldStrategy.withdraw(amount - idle);
            }
        }
        if (!collateral.transfer(to, amount)) revert TransferFailed();
    }
}
