// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {Client, IAny2EVMMessageReceiver} from "../interfaces/ICcip.sol";

/// @title RelayedFeed
/// @notice Destination-chain (Arc) mirror of a Chainlink price feed that lives
/// on another chain. A trusted `DepegSentinel` on the source chain reads the
/// real Chainlink feed and CCIP-sends each observation here; this contract
/// stores them and re-exposes the standard `AggregatorV3Interface`.
///
/// Why this exists: the USDe/USD feed is not deployed on Arc. Rather than trust
/// a human resolver, we relay the actual Chainlink answer cross-chain and let
/// the market settle permissionlessly against it — `CanaryMarket.settleDepeg`
/// walks this feed's round history exactly as it would a native feed.
///
/// Round ids are assigned locally and monotonically (1, 2, 3, …) as messages
/// arrive, so the history is gapless and the round-walk in settleDepeg holds.
/// Each stored round preserves the *source* feed's `updatedAt`, so breach-window
/// timing reflects the real feed's timestamps, not Arc arrival time.
///
/// Integrity guards: each CCIP messageId is processed at most once (replay
/// protection), and source rounds must arrive strictly increasing in source
/// round id with non-decreasing timestamps. This makes the local history a
/// faithful prefix of the source feed. It relies on CCIP delivering a single
/// lane's messages from one sentinel in order; a reordered delivery that drops
/// a later-timestamp recovery is the one residual edge (documented, low-risk for
/// a single sequential sender — see README "known limitations").
contract RelayedFeed is AggregatorV3Interface, IAny2EVMMessageReceiver {
    struct Round {
        int256 answer;
        uint256 updatedAt; // source feed timestamp
        uint80 sourceRoundId; // original Chainlink round id (for reference)
    }

    error NotRouter();
    error NotOwner();
    error SourceAlreadySet();
    error SourceNotSet();
    error UntrustedSource(uint64 chainSelector, address sender);
    error StaleObservation();
    error DuplicateMessage(bytes32 messageId);
    error NonIncreasingSourceRound(uint80 sourceRoundId);

    event AnswerRelayed(uint80 indexed localRoundId, uint80 sourceRoundId, int256 answer, uint256 sourceUpdatedAt);
    event SourceConfigured(uint64 chainSelector, address sentinel);

    uint8 public immutable override decimals;
    string public override description;
    uint256 public constant override version = 1;

    address public immutable router; // CCIP router on Arc
    address public immutable owner; // deployer; configures the trusted source once

    uint64 public sourceChainSelector; // CCIP selector of the source chain
    address public sourceSentinel; // trusted DepegSentinel on the source chain

    uint80 public latestRound;
    uint80 public lastSourceRoundId; // highest source round id accepted so far
    mapping(uint80 => Round) public rounds;
    mapping(bytes32 => bool) public processedMessage; // CCIP messageId replay guard

    constructor(uint8 decimals_, string memory description_, address router_) {
        decimals = decimals_;
        description = description_;
        router = router_;
        owner = msg.sender;
    }

    /// @notice One-time wiring of the trusted source (chain selector + sentinel
    /// address), set by the deployer once the source-chain sentinel exists.
    /// Resolves the cross-chain circular-deploy dependency. Settlement remains
    /// permissionless — this only chooses which feed is mirrored, exactly like
    /// choosing a Chainlink feed address to read.
    function setSource(uint64 chainSelector, address sentinel) external {
        if (msg.sender != owner) revert NotOwner();
        if (sourceSentinel != address(0)) revert SourceAlreadySet();
        sourceChainSelector = chainSelector;
        sourceSentinel = sentinel;
        emit SourceConfigured(chainSelector, sentinel);
    }

    /// @notice CCIP delivery hook. Only the router may call, and only messages
    /// from the configured source chain + sentinel are accepted.
    function ccipReceive(Client.Any2EVMMessage calldata message) external override {
        if (msg.sender != router) revert NotRouter();
        if (sourceSentinel == address(0)) revert SourceNotSet();
        address sender = abi.decode(message.sender, (address));
        if (message.sourceChainSelector != sourceChainSelector || sender != sourceSentinel) {
            revert UntrustedSource(message.sourceChainSelector, sender);
        }

        // Replay protection: a CCIP messageId is honored at most once.
        if (processedMessage[message.messageId]) revert DuplicateMessage(message.messageId);
        processedMessage[message.messageId] = true;

        (uint80 sourceRoundId, int256 answer, uint256 sourceUpdatedAt) =
            abi.decode(message.data, (uint80, int256, uint256));

        // Source rounds must advance: rejects duplicate/out-of-order-older rounds
        // (dedup by source round id), keeping the local history a faithful prefix.
        if (sourceRoundId <= lastSourceRoundId) revert NonIncreasingSourceRound(sourceRoundId);
        lastSourceRoundId = sourceRoundId;
        // Timestamps are non-decreasing for increasing Chainlink rounds.
        if (latestRound != 0 && sourceUpdatedAt < rounds[latestRound].updatedAt) revert StaleObservation();

        uint80 localRoundId = ++latestRound;
        rounds[localRoundId] = Round(answer, sourceUpdatedAt, sourceRoundId);
        emit AnswerRelayed(localRoundId, sourceRoundId, answer, sourceUpdatedAt);
    }

    function getRoundData(uint80 roundId)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        Round memory r = rounds[roundId];
        require(r.updatedAt != 0, "No data present");
        return (roundId, r.answer, r.updatedAt, r.updatedAt, roundId);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[latestRound];
        return (latestRound, r.answer, r.updatedAt, r.updatedAt, latestRound);
    }
}
