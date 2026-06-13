// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

/// @notice Chainlink-compatible mock feed. Behaves like a single aggregator
/// phase: round ids increase by 1, timestamps are monotone (callers control
/// them via block.timestamp or explicit setters). getRoundData reverts with
/// "No data present" for unknown rounds, matching real aggregator behavior.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public immutable override decimals;
    string public constant override description = "Mock USDe / USD";
    uint256 public constant override version = 0;

    uint80 public latestRound;
    mapping(uint80 => int256) public answers;
    mapping(uint80 => uint256) public timestamps;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        _push(initialAnswer, block.timestamp);
    }

    /// @notice Push a new round at the current block timestamp.
    function updateAnswer(int256 answer) external {
        _push(answer, block.timestamp);
    }

    /// @notice Push a new round at an explicit timestamp (for crafting histories in tests).
    function updateAnswerAt(int256 answer, uint256 timestamp) external {
        _push(answer, timestamp);
    }

    function getRoundData(uint80 roundId)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        require(timestamps[roundId] != 0, "No data present");
        return (roundId, answers[roundId], timestamps[roundId], timestamps[roundId], roundId);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (latestRound, answers[latestRound], timestamps[latestRound], timestamps[latestRound], latestRound);
    }

    function _push(int256 answer, uint256 timestamp) internal {
        latestRound++;
        answers[latestRound] = answer;
        timestamps[latestRound] = timestamp;
    }
}
