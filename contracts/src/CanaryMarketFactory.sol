// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CanaryMarket} from "./CanaryMarket.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title CanaryMarketFactory
/// @notice Deploys and registers CanaryMarkets. Collateral (USDC) is fixed for
/// the whole factory; everything else is per-market. Market creation is
/// permissionless — the registry + events are what the frontend and the risk
/// curve read.
contract CanaryMarketFactory {
    error ZeroAddress();

    event MarketCreated(
        address indexed market,
        address indexed priceFeed,
        address indexed creator,
        int256 depegThreshold,
        uint64 breachWindow,
        uint64 expiry,
        string description
    );

    IERC20 public immutable collateral;
    address[] public markets;

    constructor(IERC20 collateral_) {
        if (address(collateral_) == address(0)) revert ZeroAddress();
        collateral = collateral_;
    }

    function createMarket(
        AggregatorV3Interface priceFeed,
        int256 depegThreshold,
        uint64 breachWindow,
        uint64 expiry,
        uint64 settlementGrace,
        string calldata description
    ) external returns (address market) {
        market = address(
            new CanaryMarket(collateral, priceFeed, depegThreshold, breachWindow, expiry, settlementGrace, description)
        );
        markets.push(market);
        emit MarketCreated(
            market, address(priceFeed), msg.sender, depegThreshold, breachWindow, expiry, description
        );
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function allMarkets() external view returns (address[] memory) {
        return markets;
    }
}
