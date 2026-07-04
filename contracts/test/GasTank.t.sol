// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../GasTank.sol";

contract MockDiamond {
    uint256 public calls;
    fallback() external payable { calls++; }
}

contract GasTankTest is Test {
    GasTank tank;
    address owner = address(0x1111);
    address operator = address(0x2222);

    MockDiamond aaveMock;
    MockDiamond realmMock;

    function setUp() public {
        aaveMock = new MockDiamond();
        realmMock = new MockDiamond();
        tank = new GasTank(address(aaveMock), address(realmMock));
        tank.setOperator(operator, true);
        vm.deal(owner, 10 ether);
    }

    function test_deposit_creditsBalance() public {
        vm.prank(owner);
        tank.deposit{value: 1 ether}();
        assertEq(tank.balanceOf(owner), 1 ether);
        assertEq(address(tank).balance, 1 ether);
    }

    function test_withdraw_returnsFunds_anytime() public {
        vm.prank(owner);
        tank.deposit{value: 1 ether}();
        vm.prank(owner);
        tank.withdraw(0.4 ether);
        assertEq(tank.balanceOf(owner), 0.6 ether);
        assertEq(owner.balance, 9.4 ether); // 10 - 1 deposited + 0.4 back
    }

    function test_withdraw_revertsWhenInsufficient() public {
        vm.prank(owner);
        tank.deposit{value: 1 ether}();
        vm.prank(owner);
        vm.expectRevert(bytes("insufficient"));
        tank.withdraw(2 ether);
    }

    function test_setOperator_onlyAdmin() public {
        tank.setOperator(operator, true); // test contract deployed tank => is admin
        assertTrue(tank.isOperator(operator));
        vm.prank(owner);
        vm.expectRevert(bytes("not admin"));
        tank.setOperator(owner, true);
    }

    function test_setCapPerRun_ownerControlsOwnCap() public {
        vm.prank(owner);
        tank.setCapPerRun(0.001 ether);
        assertEq(tank.capPerRun(owner), 0.001 ether);
    }

    // helper: build a Call with a given selector + no args body
    function _call(address target, bytes4 sel) internal pure returns (GasTank.Call memory) {
        return GasTank.Call({ target: target, data: abi.encodePacked(sel) });
    }

    function test_run_allowsInteractOnAavegotchi() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519); // interact
        vm.prank(operator);
        tank.run(owner, calls, 1, 0, 0);
        assertEq(aaveMock.calls(), 1);
    }

    function test_run_allowsChannelAndClaimOnRealm() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](2);
        calls[0] = _call(address(realmMock), 0x8027870e); // channel
        calls[1] = _call(address(realmMock), 0xbc6dc2f0); // claim
        vm.prank(operator);
        tank.run(owner, calls, 0, 1, 1);
        assertEq(realmMock.calls(), 2);
    }

    function test_run_rejectsWrongSelector() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0xdeadbeef); // not allowed
        vm.prank(operator);
        vm.expectRevert(bytes("scope"));
        tank.run(owner, calls, 0, 0, 0);
    }

    function test_run_rejectsWrongTarget() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(0xBAD), 0x22c67519); // interact selector, wrong contract
        vm.prank(operator);
        vm.expectRevert(bytes("scope"));
        tank.run(owner, calls, 0, 0, 0);
    }

    function test_run_onlyOperator() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519);
        vm.prank(owner); // not an operator
        vm.expectRevert(bytes("not operator"));
        tank.run(owner, calls, 1, 0, 0);
    }
}
