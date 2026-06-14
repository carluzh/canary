// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Keystone receiver that turns a Chainlink CRE report into a market
/// settlement. The CRE "Canary Watchtower" workflow monitors the USDe feed on a
/// cron schedule and, on a provable depeg, emits a DON-signed report carrying
/// the breach round id. The Keystone Forwarder delivers it to `onReport`, which
/// relays it into the (permissionless) `CanaryMarket.settleDepeg`.
///
/// This closes the Chainlink loop: Data Feeds price it, CRE watches it, and
/// settlement fires autonomously — no keeper, no human.
interface ICanaryMarketSettle {
    function settleDepeg(uint80 startRoundId) external;
}

contract CanaryReportReceiver {
    error NotForwarder();

    /// @notice Keystone Forwarder on Arc (production `0x76c9…5E62`, or the
    /// simulation forwarder for `cre workflow simulate --broadcast`).
    address public immutable forwarder;
    ICanaryMarketSettle public immutable market;

    event Settled(uint80 indexed roundId);

    constructor(address forwarder_, ICanaryMarketSettle market_) {
        forwarder = forwarder_;
        market = market_;
    }

    /// @notice Called by the Keystone Forwarder with the DON-signed report.
    /// `report` carries the abi-encoded breach round id from the workflow.
    /// settleDepeg is permissionless and self-verifying: if the breach isn't
    /// actually provable yet it reverts, and the workflow retries next cron.
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        uint80 roundId = abi.decode(report, (uint80));
        market.settleDepeg(roundId);
        emit Settled(roundId);
    }

    /// @notice Keystone Forwarder checks the receiver advertises IReceiver.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // IReceiver (onReport(bytes,bytes)) + ERC-165.
        return interfaceId == this.onReport.selector || interfaceId == 0x01ffc9a7;
    }
}
