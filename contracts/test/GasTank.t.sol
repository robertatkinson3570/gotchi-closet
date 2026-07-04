// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../GasTank.sol";

contract GasTankTest is Test {
    GasTank tank;
    address aave = address(0xA11CE);
    address realm = address(0xBEEF);
    address owner = address(0x1111);
    address operator = address(0x2222);

    function setUp() public {
        tank = new GasTank(aave, realm); // deployer = admin
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
}
