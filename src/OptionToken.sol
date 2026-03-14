// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OptionToken
/// @notice ERC20 representing 1 option contract in a specific series.
///         e.g. "Voltaire Option: ETH-4000-JUN25-C"
///         Minted by OptionSeries (via OptionsHook) on purchase.
///         Burned on settlement or exercise.
contract OptionToken is ERC20 {
    error OnlySeries();

    address public immutable series;

    constructor(string memory _name, string memory _symbol, address _series) ERC20(_name, _symbol) {
        series = _series;
    }

    modifier onlySeries() {
        if (msg.sender != series) revert OnlySeries();
        _;
    }

    /// @notice Mint option tokens to a buyer
    function mint(address to, uint256 amount) external onlySeries {
        _mint(to, amount);
    }

    /// @notice Burn option tokens during settlement
    function burn(address from, uint256 amount) external onlySeries {
        _burn(from, amount);
    }

    /// @notice Convenience: burn caller's own tokens (exercise path)
    function burnSelf(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
