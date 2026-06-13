// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {DepegSentinel} from "../src/ccip/DepegSentinel.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {IRouterClient} from "../src/interfaces/ICcip.sol";

/// @notice Deploys the DepegSentinel on the SOURCE chain (the chain that has the
/// real Chainlink USDe/USD feed, e.g. Ethereum Sepolia). Run AFTER Deploy.s.sol
/// has produced the RelayedFeed on Arc; then call RelayedFeed.setSource(srcSelector, sentinel)
/// on Arc to authorize this sentinel.
///
/// Env (required):
///   SOURCE_FEED      Chainlink AggregatorV3 USDe/USD feed on the source chain
///   SOURCE_ROUTER    CCIP router on the source chain
///   ARC_SELECTOR     CCIP chain selector for Arc (destination)
///   RELAYED_FEED     RelayedFeed address on Arc (from deployments.json)
///
/// forge script script/DeploySentinel.s.sol --rpc-url $SEPOLIA_RPC --broadcast --private-key $PK
contract DeploySentinel is Script {
    function run() external {
        address feed = vm.envAddress("SOURCE_FEED");
        address router = vm.envAddress("SOURCE_ROUTER");
        uint64 arcSelector = uint64(vm.envUint("ARC_SELECTOR"));
        address relayedFeed = vm.envAddress("RELAYED_FEED");

        vm.startBroadcast();
        DepegSentinel sentinel =
            new DepegSentinel(AggregatorV3Interface(feed), IRouterClient(router), arcSelector, relayedFeed);
        vm.stopBroadcast();

        console2.log("DepegSentinel:", address(sentinel));
        console2.log(">> next on Arc: RelayedFeed.setSource(<sourceChainSelector>,", address(sentinel));
        console2.log(">> then poke periodically: DepegSentinel.relay{value: quote()}()");
    }
}
