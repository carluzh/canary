// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal subset of Chainlink CCIP interfaces, copied to avoid pulling
/// the full chainlink-ccip contracts dependency for a hackathon build. Struct
/// layouts and selectors match the official contracts, so the real router can
/// be used unchanged at deploy time.
library Client {
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    /// @dev Message delivered to a receiver on the destination chain.
    struct Any2EVMMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        bytes sender; // abi-encoded sender address from the source chain
        bytes data;
        EVMTokenAmount[] destTokenAmounts;
    }

    /// @dev Message submitted to the router on the source chain.
    struct EVM2AnyMessage {
        bytes receiver; // abi-encoded destination receiver address
        bytes data;
        EVMTokenAmount[] tokenAmounts;
        address feeToken; // address(0) => pay fee in native gas token
        bytes extraArgs;
    }
}

interface IRouterClient {
    error UnsupportedDestinationChain(uint64 destChainSelector);
    error InsufficientFeeTokenAmount();

    function getFee(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message)
        external
        view
        returns (uint256 fee);

    function ccipSend(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32 messageId);
}

/// @notice Implemented by destination-chain receivers. The CCIP router calls
/// ccipReceive once a cross-chain message is delivered.
interface IAny2EVMMessageReceiver {
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}
