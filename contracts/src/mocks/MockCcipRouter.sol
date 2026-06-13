// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Client, IRouterClient, IAny2EVMMessageReceiver} from "../interfaces/ICcip.sol";

/// @notice Test/dev CCIP router that delivers messages synchronously in-process.
/// On `ccipSend` it immediately invokes the receiver's `ccipReceive`, simulating
/// a same-block cross-chain hop. Lets the full sentinel -> router -> RelayedFeed
/// path run inside a single Foundry test without two real chains.
contract MockCcipRouter is IRouterClient {
    uint256 public fee;
    uint64 public immutable sourceChainSelector; // selector this router reports as the source

    uint256 public sent;

    constructor(uint256 fee_, uint64 sourceChainSelector_) {
        fee = fee_;
        sourceChainSelector = sourceChainSelector_;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    function getFee(uint64, Client.EVM2AnyMessage calldata) external view override returns (uint256) {
        return fee;
    }

    function ccipSend(uint64, Client.EVM2AnyMessage calldata message)
        external
        payable
        override
        returns (bytes32 messageId)
    {
        if (msg.value < fee) revert InsufficientFeeTokenAmount();
        sent++;
        messageId = keccak256(abi.encode(sent, message.data));

        address receiver = abi.decode(message.receiver, (address));
        Client.Any2EVMMessage memory delivered = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: sourceChainSelector,
            sender: abi.encode(msg.sender),
            data: message.data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        IAny2EVMMessageReceiver(receiver).ccipReceive(delivered);
    }
}
