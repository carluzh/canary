// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {Client, IRouterClient} from "../interfaces/ICcip.sol";

/// @title DepegSentinel
/// @notice Source-chain (e.g. Ethereum Sepolia) companion to RelayedFeed. Reads
/// a real Chainlink price feed and forwards each latest observation to the
/// RelayedFeed on Arc over CCIP.
///
/// `relay()` is permissionless — anyone (a bot, Chainlink Automation, the demo
/// operator) can poke it to push the current price across. It only ever
/// transmits Chainlink's own answer + timestamp, so the destination market
/// settles against authentic feed data.
contract DepegSentinel {
    error NothingNewToRelay();
    error FeeTransferFailed();

    event Relayed(bytes32 indexed messageId, uint80 sourceRoundId, int256 answer, uint256 updatedAt);

    // CCIP EVMExtraArgsV2: explicit destination gas limit + out-of-order
    // execution (required by 1.6 lanes). RelayedFeed.ccipReceive does a handful
    // of SSTOREs; 300k is ample. Relying on the router's default (empty args)
    // under-provisions gas and the destination execution reverts.
    bytes4 private constant EVM_EXTRA_ARGS_V2_TAG = 0x181dcf10;
    uint256 private constant DEST_GAS_LIMIT = 300_000;

    AggregatorV3Interface public immutable feed;
    IRouterClient public immutable router;
    uint64 public immutable destChainSelector; // CCIP selector for Arc
    address public immutable destReceiver; // RelayedFeed on Arc

    uint256 public lastRelayedUpdatedAt;

    constructor(AggregatorV3Interface feed_, IRouterClient router_, uint64 destChainSelector_, address destReceiver_) {
        feed = feed_;
        router = router_;
        destChainSelector = destChainSelector_;
        destReceiver = destReceiver_;
    }

    /// @notice Quote the CCIP fee for the next relay (native token wei).
    function quote() public view returns (uint256 fee) {
        (uint80 roundId, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        return router.getFee(destChainSelector, _build(roundId, answer, updatedAt));
    }

    /// @notice Read the feed's latest round and CCIP-send it to Arc. Pay the CCIP
    /// fee in native gas via msg.value; any excess is refunded.
    function relay() external payable returns (bytes32 messageId) {
        (uint80 roundId, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (updatedAt <= lastRelayedUpdatedAt) revert NothingNewToRelay();
        lastRelayedUpdatedAt = updatedAt;

        Client.EVM2AnyMessage memory message = _build(roundId, answer, updatedAt);
        uint256 fee = router.getFee(destChainSelector, message);
        messageId = router.ccipSend{value: fee}(destChainSelector, message);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert FeeTransferFailed();
        }
        emit Relayed(messageId, roundId, answer, updatedAt);
    }

    function _build(uint80 roundId, int256 answer, uint256 updatedAt)
        internal
        view
        returns (Client.EVM2AnyMessage memory)
    {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(destReceiver),
            data: abi.encode(roundId, answer, updatedAt),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0), // native
            extraArgs: abi.encodeWithSelector(EVM_EXTRA_ARGS_V2_TAG, DEST_GAS_LIMIT, true)
        });
    }
}
