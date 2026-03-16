// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Reactive Network core interface — RSCs implement this.
/// @dev    RSCs are deployed on the Reactive Network chain.
///         They subscribe to events on any source chain and emit
///         Callback events that get relayed to destination chains.
interface IReactive {
    /// @notice Emitted to trigger a cross-chain callback.
    ///         Reactive Network relays this as a tx on the destination chain.
    /// @param chain_id      Destination chain ID
    /// @param _contract     Destination contract address
    /// @param gas_limit     Gas to use on destination chain
    /// @param payload       ABI-encoded calldata for destination call
    event Callback(
        uint256 indexed chain_id, address indexed _contract, uint64 indexed gas_limit, bytes payload
    );

    /// @notice Called by Reactive Network when a subscribed event fires.
    /// @param chain_id      Source chain where the event was emitted
    /// @param _contract     Source contract that emitted the event
    /// @param topic_0       Event signature hash (keccak256 of event sig)
    /// @param topic_1       First indexed event parameter
    /// @param topic_2       Second indexed event parameter
    /// @param topic_3       Third indexed event parameter
    /// @param data          ABI-encoded non-indexed event data
    /// @param block_number  Block number on the source chain
    /// @param op_code       Reactive Network operation code
    function react(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3,
        bytes calldata data,
        uint256 block_number,
        uint256 op_code
    ) external;
}

/// @notice Reactive Network subscription service interface.
interface ISubscriptionService {
    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;

    function unsubscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;
}
