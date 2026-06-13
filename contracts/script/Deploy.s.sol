// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CanaryMarketFactory} from "../src/CanaryMarketFactory.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {RelayedFeed} from "../src/ccip/RelayedFeed.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockV3Aggregator} from "../src/mocks/MockV3Aggregator.sol";

/// @notice Deploys the full Canary stack on the destination chain (Arc) and
/// writes `deployments.json` for the frontend.
///
/// Always deploys:
///   - factory
///   - a DEMO feed (operator-controllable MockV3Aggregator) + demo market, so
///     the live demo can crash the price on cue and settle deterministically.
///
/// Optionally (when CCIP_ROUTER is set): also deploys a RelayedFeed + a
/// "credibility" market that settles on real USDe data relayed from the source
/// chain via CCIP. Wire its source with DeploySentinel.s.sol on the source chain,
/// then RelayedFeed.setSource(...).
///
/// Env:
///   USDC_ADDRESS   collateral (default: Arc canonical USDC 0x3600..0000)
///   CCIP_ROUTER    Arc CCIP router (optional; enables the relayed market)
///
/// Local:  forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --private-key $PK
/// Arc:    forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $PK
contract Deploy is Script {
    // Arc testnet canonical USDC (6-dec ERC-20 interface). See frontend chains.ts.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address usdcAddr = vm.envOr("USDC_ADDRESS", address(0));
        address ccipRouter = vm.envOr("CCIP_ROUTER", address(0));

        vm.startBroadcast();

        // Collateral: real USDC if given, Arc USDC if it exists on this chain,
        // else a local mock.
        if (usdcAddr == address(0)) {
            usdcAddr = ARC_USDC.code.length > 0 ? ARC_USDC : address(new MockUSDC());
        }

        CanaryMarketFactory factory = new CanaryMarketFactory(IERC20(usdcAddr));

        // Demo feed + market: operator-controllable so the stage demo settles
        // on cue. 15-minute breach window keeps the live settlement fast.
        MockV3Aggregator demoFeed = new MockV3Aggregator(8, 1e8);
        address demoMarket = factory.createMarket(
            AggregatorV3Interface(address(demoFeed)),
            0.95e8,
            15 minutes,
            uint64(block.timestamp + 7 days),
            30 minutes,
            "USDe < $0.95 for 15m (demo)"
        );

        // Optional CCIP-relayed market on real data.
        address relayedFeed;
        address relayedMarket;
        if (ccipRouter != address(0)) {
            RelayedFeed feed = new RelayedFeed(8, "USDe / USD (relayed via CCIP)", ccipRouter);
            relayedFeed = address(feed);
            relayedMarket = factory.createMarket(
                AggregatorV3Interface(relayedFeed),
                0.95e8,
                1 hours,
                uint64(block.timestamp + 30 days),
                1 hours,
                "USDe < $0.95 for 1h (live Chainlink via CCIP)"
            );
        }

        vm.stopBroadcast();

        _writeDeployments(usdcAddr, address(factory), address(demoFeed), demoMarket, relayedFeed, relayedMarket);

        console2.log("chainId:        ", block.chainid);
        console2.log("USDC:           ", usdcAddr);
        console2.log("Factory:        ", address(factory));
        console2.log("Demo feed:      ", address(demoFeed));
        console2.log("Demo market:    ", demoMarket);
        if (relayedFeed != address(0)) {
            console2.log("Relayed feed:   ", relayedFeed);
            console2.log("Relayed market: ", relayedMarket);
            console2.log(">> next: deploy DeploySentinel on the source chain, then RelayedFeed.setSource(...)");
        }
        console2.log(">> wrote deployments.json");
    }

    function _writeDeployments(
        address usdc,
        address factory,
        address demoFeed,
        address demoMarket,
        address relayedFeed,
        address relayedMarket
    ) internal {
        string memory o = "deployments";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "usdc", usdc);
        vm.serializeAddress(o, "factory", factory);
        vm.serializeAddress(o, "demoFeed", demoFeed);
        vm.serializeAddress(o, "demoMarket", demoMarket);
        vm.serializeAddress(o, "relayedFeed", relayedFeed);
        string memory json = vm.serializeAddress(o, "relayedMarket", relayedMarket);
        vm.writeJson(json, "./deployments.json");
    }
}
