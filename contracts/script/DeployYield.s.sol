// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CanaryMarketFactory} from "../src/CanaryMarketFactory.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";
import {MockV3Aggregator} from "../src/mocks/MockV3Aggregator.sol";

/// @notice Deploys the self-funding yield stack: a yield vault + factory + a
/// yield-enabled market (idle collateral rehypothecated 100%, yield split
/// fee/underwriter/buyer). On testnet the vault is MockYieldVault; in production
/// pass a USYC or Aave-USDC 4626 adapter as YIELD_STRATEGY.
///
/// Env:
///   USDC_ADDRESS      collateral (default Arc USDC)
///   FEED_ADDRESS      price feed (deploys a mock if unset)
///   YIELD_STRATEGY    IYieldStrategy (deploys MockYieldVault if unset)
///   FEE_RECIPIENT     protocol fee sink (default: broadcaster)
contract DeployYield is Script {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address feed = vm.envOr("FEED_ADDRESS", address(0));
        address strategy = vm.envOr("YIELD_STRATEGY", address(0));
        address feeRecipient = vm.envOr("FEE_RECIPIENT", msg.sender);

        vm.startBroadcast();
        if (usdc == address(0)) usdc = ARC_USDC.code.length > 0 ? ARC_USDC : address(0);
        require(usdc != address(0), "set USDC_ADDRESS");
        if (feed == address(0)) feed = address(new MockV3Aggregator(8, 1e8));
        if (strategy == address(0)) strategy = address(new MockYieldVault(IERC20(usdc)));

        CanaryMarketFactory factory = new CanaryMarketFactory(IERC20(usdc));
        address market = factory.createYieldMarket(
            AggregatorV3Interface(feed),
            0.95e8,
            1 hours,
            uint64(block.timestamp + 30 days),
            1 hours,
            "USDe < $0.95 (self-funding)",
            IYieldStrategy(strategy),
            0, // protocol fee: 0 on testnet
            3_000, // 30% of net yield rebated to coverage buyers
            feeRecipient
        );
        vm.stopBroadcast();

        console2.log("YieldVault/strategy:", strategy);
        console2.log("Factory:            ", address(factory));
        console2.log("Yield market:       ", market);
    }
}
