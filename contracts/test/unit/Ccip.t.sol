// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RelayedFeed} from "../../src/ccip/RelayedFeed.sol";
import {DepegSentinel} from "../../src/ccip/DepegSentinel.sol";
import {MockCcipRouter} from "../../src/mocks/MockCcipRouter.sol";
import {MockV3Aggregator} from "../../src/mocks/MockV3Aggregator.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {IRouterClient, Client, IAny2EVMMessageReceiver} from "../../src/interfaces/ICcip.sol";
import {CanaryMarket} from "../../src/CanaryMarket.sol";
import {CanaryMarketFactory} from "../../src/CanaryMarketFactory.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

contract CcipTest is Test {
    uint64 internal constant SRC_SELECTOR = 16015286601757825753; // sepolia-ish
    uint64 internal constant DST_SELECTOR = 4949039107694359620; // arc-ish
    uint8 internal constant FEED_DECIMALS = 8;
    uint256 internal constant START_TIME = 1_750_000_000;

    MockV3Aggregator internal sourceFeed; // the "real" Chainlink feed on the source chain
    MockCcipRouter internal router;
    RelayedFeed internal relayed; // Arc-side mirror
    DepegSentinel internal sentinel; // source-side sender

    function setUp() public {
        vm.warp(START_TIME);
        sourceFeed = new MockV3Aggregator(FEED_DECIMALS, 1e8);
        router = new MockCcipRouter(0.001 ether, SRC_SELECTOR);

        // Deploy both sides, then wire the trusted source (the realistic cross-
        // chain order: neither side can know the other's address at construction).
        relayed = new RelayedFeed(FEED_DECIMALS, "USDe / USD (relayed)", address(router));
        sentinel = new DepegSentinel(
            AggregatorV3Interface(address(sourceFeed)), IRouterClient(address(router)), DST_SELECTOR, address(relayed)
        );
        relayed.setSource(SRC_SELECTOR, address(sentinel));
    }

    function _relay() internal {
        uint256 fee = sentinel.quote();
        sentinel.relay{value: fee}();
    }

    // --------------------------------------------------------------- relaying

    function test_relay_mirrorsSourceAnswer() public {
        _relay();
        (uint80 rid, int256 answer,, uint256 updatedAt,) = relayed.latestRoundData();
        assertEq(rid, 1);
        assertEq(answer, 1e8);
        assertEq(updatedAt, START_TIME);
    }

    function test_relay_assignsGaplessLocalRounds() public {
        _relay(); // round 1 @ $1.00
        vm.warp(START_TIME + 10 minutes);
        sourceFeed.updateAnswer(0.98e8);
        _relay(); // round 2
        vm.warp(START_TIME + 20 minutes);
        sourceFeed.updateAnswer(0.90e8);
        _relay(); // round 3

        assertEq(relayed.latestRound(), 3);
        (, int256 a1,, uint256 t1,) = relayed.getRoundData(1);
        (, int256 a3,, uint256 t3,) = relayed.getRoundData(3);
        assertEq(a1, 1e8);
        assertEq(t1, START_TIME);
        assertEq(a3, 0.90e8);
        assertEq(t3, START_TIME + 20 minutes);
    }

    function test_relay_refundsExcessFee() public {
        uint256 fee = sentinel.quote();
        uint256 balBefore = address(this).balance;
        sentinel.relay{value: fee + 1 ether}();
        assertEq(address(this).balance, balBefore - fee); // 1 ether refunded
    }

    function test_relay_revert_nothingNew() public {
        _relay();
        vm.expectRevert(DepegSentinel.NothingNewToRelay.selector);
        sentinel.relay{value: 0.001 ether}();
    }

    function test_relay_revert_refundToRejector() public {
        RejectEth rejector = new RejectEth(sentinel);
        vm.deal(address(rejector), 2 ether);
        uint256 fee = sentinel.quote();
        vm.expectRevert(DepegSentinel.FeeTransferFailed.selector);
        rejector.poke(fee + 1); // overpays -> refund attempt fails
    }

    // ------------------------------------------------------ source wiring

    function test_setSource_revert_notOwner() public {
        RelayedFeed fresh = new RelayedFeed(FEED_DECIMALS, "x", address(router));
        vm.prank(makeAddr("notOwner"));
        vm.expectRevert(RelayedFeed.NotOwner.selector);
        fresh.setSource(SRC_SELECTOR, address(sentinel));
    }

    function test_setSource_revert_alreadySet() public {
        vm.expectRevert(RelayedFeed.SourceAlreadySet.selector);
        relayed.setSource(SRC_SELECTOR, address(sentinel)); // already set in setUp
    }

    function test_ccipReceive_revert_sourceNotSet() public {
        RelayedFeed fresh = new RelayedFeed(FEED_DECIMALS, "x", address(router));
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(0),
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(address(sentinel)),
            data: abi.encode(uint80(1), int256(1e8), uint256(START_TIME)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(RelayedFeed.SourceNotSet.selector);
        fresh.ccipReceive(m);
    }

    // ------------------------------------------------------ receiver guards

    function test_ccipReceive_revert_notRouter() public {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(0),
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(address(sentinel)),
            data: abi.encode(uint80(1), int256(1e8), uint256(START_TIME)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.expectRevert(RelayedFeed.NotRouter.selector);
        relayed.ccipReceive(m);
    }

    function test_ccipReceive_revert_wrongSourceChain() public {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(0),
            sourceChainSelector: 999, // not the configured source
            sender: abi.encode(address(sentinel)),
            data: abi.encode(uint80(1), int256(1e8), uint256(START_TIME)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(RelayedFeed.UntrustedSource.selector, uint64(999), address(sentinel)));
        relayed.ccipReceive(m);
    }

    function test_ccipReceive_revert_untrustedSender() public {
        address attacker = makeAddr("attacker");
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(0),
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(attacker),
            data: abi.encode(uint80(1), int256(1e8), uint256(START_TIME)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(RelayedFeed.UntrustedSource.selector, SRC_SELECTOR, attacker));
        relayed.ccipReceive(m);
    }

    function _deliver(bytes32 messageId, uint80 sourceRoundId, int256 answer, uint256 updatedAt) internal {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(address(sentinel)),
            data: abi.encode(sourceRoundId, answer, updatedAt),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        relayed.ccipReceive(m);
    }

    function test_ccipReceive_revert_duplicateMessage() public {
        bytes32 id = keccak256("dup");
        _deliver(id, 5, 1e8, START_TIME);
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: id, // same messageId replayed
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(address(sentinel)),
            data: abi.encode(uint80(6), int256(0.9e8), uint256(START_TIME + 1)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(RelayedFeed.DuplicateMessage.selector, id));
        relayed.ccipReceive(m);
    }

    function test_ccipReceive_revert_nonIncreasingSourceRound() public {
        _deliver(keccak256("a"), 5, 1e8, START_TIME);
        // a later message carrying an equal-or-lower source round is rejected
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: keccak256("b"),
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(address(sentinel)),
            data: abi.encode(uint80(5), int256(0.9e8), uint256(START_TIME + 1)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(RelayedFeed.NonIncreasingSourceRound.selector, uint80(5)));
        relayed.ccipReceive(m);
    }

    function test_ccipReceive_revert_staleObservation() public {
        _relay(); // round 1 @ START_TIME
        // craft a message with an older source timestamp arriving late
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(0),
            sourceChainSelector: SRC_SELECTOR,
            sender: abi.encode(address(sentinel)),
            data: abi.encode(uint80(9), int256(0.5e8), uint256(START_TIME - 1)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(RelayedFeed.StaleObservation.selector);
        relayed.ccipReceive(m);
    }

    // ----------------------------------- end-to-end: settle a market on relayed data

    /// The headline integration: a CanaryMarket pointed at the RelayedFeed
    /// settles permissionlessly off Chainlink data that originated on another
    /// chain and crossed via CCIP. No trusted resolver anywhere in the path.
    function test_endToEnd_settleDepegOverRelayedFeed() public {
        MockUSDC usdc = new MockUSDC();
        CanaryMarketFactory factory = new CanaryMarketFactory(IERC20(address(usdc)));
        uint64 expiry = uint64(block.timestamp) + 30 days;
        CanaryMarket market = CanaryMarket(
            factory.createMarket(
                AggregatorV3Interface(address(relayed)), 0.95e8, 1 hours, expiry, 1 hours, "USDe < $0.95 for 1h"
            )
        );

        // underwriter mints sets and sells YES to a buyer
        address underwriter = makeAddr("underwriter");
        address buyer = makeAddr("buyer");
        usdc.mint(underwriter, 1_000e6);
        usdc.mint(buyer, 1_000e6);
        vm.prank(underwriter);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);

        vm.prank(underwriter);
        market.mintSets(1_000e6);
        vm.prank(underwriter);
        uint256 ask = market.placeOrder(true, false, 0.05e6, 1_000e6);
        vm.prank(buyer);
        market.fillOrder(ask, 1_000e6);

        // relay a sustained depeg from the source feed across CCIP
        sourceFeed.updateAnswer(0.90e8);
        _relay();
        uint80 firstBreachRound = relayed.latestRound();
        for (uint256 i = 0; i < 6; i++) {
            vm.warp(block.timestamp + 10 minutes);
            sourceFeed.updateAnswer(0.90e8);
            _relay();
        }

        // anyone settles by proving the breach from the relayed round history
        market.settleDepeg(firstBreachRound);
        assertEq(uint256(market.state()), uint256(CanaryMarket.State.TriggeredYes));

        // buyer's coverage pays out 1:1
        vm.prank(buyer);
        assertEq(market.redeem(), 1_000e6);
    }

    receive() external payable {}
}

/// Calls relay() with an overpayment but rejects the ETH refund, exercising the
/// FeeTransferFailed path.
contract RejectEth {
    DepegSentinel internal sentinel;

    constructor(DepegSentinel sentinel_) {
        sentinel = sentinel_;
    }

    function poke(uint256 value) external {
        sentinel.relay{value: value}();
    }

    receive() external payable {
        revert("no refunds");
    }
}
