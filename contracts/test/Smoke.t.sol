// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

contract SmokeTest is Test {
    function test_forgeWorks() public {
        assertEq(uint256(1) + 1, 2);
    }
}
