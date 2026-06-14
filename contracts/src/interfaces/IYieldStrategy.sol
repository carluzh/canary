// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal ERC-4626-style interface for a yield venue the market
/// rehypothecates idle collateral into. Real adapters wrap USYC, an Aave-USDC
/// 4626 vault, etc.; `MockYieldVault` implements it directly for tests/demo.
///
/// The market deploys 100% of its collateral here (no idle buffer) and redeems
/// exactly what it needs on every withdrawal, so capital earns until the instant
/// it leaves. Instant settlement therefore requires the venue's `withdraw`/
/// `redeem` to be atomic — true for the mock, for Aave-USDC under normal
/// liquidity, and for any instant-redeem USYC teller.
interface IYieldStrategy {
    /// @notice The underlying asset (USDC).
    function asset() external view returns (address);

    /// @notice Deposit `assets` (pulled from msg.sender), mint and return shares.
    function deposit(uint256 assets) external returns (uint256 shares);

    /// @notice Burn shares to return exactly `assets` to msg.sender. Returns the
    /// shares burned. Used on the withdrawal path so the market gets an exact
    /// USDC amount.
    function withdraw(uint256 assets) external returns (uint256 shares);

    /// @notice Burn `shares`, return the resulting assets to msg.sender.
    function redeem(uint256 shares) external returns (uint256 assets);

    /// @notice Current asset value of `shares`.
    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    /// @notice Shares that `assets` would mint right now.
    function convertToShares(uint256 assets) external view returns (uint256 shares);

    /// @notice Assets currently redeemable (liquidity available for instant exit).
    function maxWithdraw() external view returns (uint256 assets);
}
