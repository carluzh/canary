// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";
import {IERC20} from "../interfaces/IERC20.sol";

/// @notice Controllable ERC-4626-style yield venue for tests/demo. Shares track
/// deposits; yield is injected via `simulateYield` (anyone donates USDC, raising
/// the asset-per-share price). Always fully liquid, so `withdraw`/`redeem` are
/// atomic — modelling an instant-redeem venue (USYC instant teller / Aave-USDC).
contract MockYieldVault is IYieldStrategy {
    IERC20 public immutable usdc;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    event Deposited(address indexed account, uint256 assets, uint256 shares);
    event Withdrawn(address indexed account, uint256 assets, uint256 shares);
    event YieldSimulated(uint256 amount);

    constructor(IERC20 usdc_) {
        usdc = usdc_;
    }

    function asset() external view override returns (address) {
        return address(usdc);
    }

    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function deposit(uint256 assets) external override returns (uint256 shares) {
        uint256 supply = totalShares;
        shares = supply == 0 ? assets : (assets * supply) / totalAssets(); // round down
        require(usdc.transferFrom(msg.sender, address(this), assets), "pull failed");
        totalShares = supply + shares;
        sharesOf[msg.sender] += shares;
        emit Deposited(msg.sender, assets, shares);
    }

    /// @notice Burn just enough shares to return exactly `assets`.
    function withdraw(uint256 assets) external override returns (uint256 shares) {
        uint256 ta = totalAssets();
        shares = (assets * totalShares + ta - 1) / ta; // round up
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        require(usdc.transfer(msg.sender, assets), "push failed");
        emit Withdrawn(msg.sender, assets, shares);
    }

    function redeem(uint256 shares) external override returns (uint256 assets) {
        assets = (shares * totalAssets()) / totalShares; // round down
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        require(usdc.transfer(msg.sender, assets), "push failed");
        emit Withdrawn(msg.sender, assets, shares);
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        return totalShares == 0 ? 0 : (shares * totalAssets()) / totalShares;
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 ta = totalAssets();
        return (totalShares == 0 || ta == 0) ? assets : (assets * totalShares) / ta;
    }

    function maxWithdraw() external view override returns (uint256) {
        return totalAssets(); // fully liquid
    }

    /// @notice Inject yield: caller donates `amount` USDC, raising assets/share.
    function simulateYield(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "pull failed");
        emit YieldSimulated(amount);
    }
}
