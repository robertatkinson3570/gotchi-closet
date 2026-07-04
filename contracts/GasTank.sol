// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Non-custodial gas escrow + scoped forwarder for Steward v2.
/// Owners deposit ETH they can withdraw anytime; an allowlisted operator runs
/// their pet/channel/claim actions and is reimbursed strictly <= metered gas.
contract GasTank {
    address public immutable admin;

    mapping(address => uint256) public balanceOf; // owner => escrowed wei
    mapping(address => bool) public isOperator;    // relayer allowlist (admin-managed)
    mapping(address => uint256) public capPerRun;  // owner => max reimbursement per run (0 = no cap)

    event OperatorSet(address indexed operator, bool allowed);
    event CapSet(address indexed owner, uint256 cap);

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }

    function setOperator(address op, bool allowed) external onlyAdmin {
        isOperator[op] = allowed;
        emit OperatorSet(op, allowed);
    }

    function setCapPerRun(uint256 cap) external {
        capPerRun[msg.sender] = cap;
        emit CapSet(msg.sender, cap);
    }

    uint256 private _lock;
    modifier nonReentrant() { require(_lock == 0, "reentrant"); _lock = 1; _; _lock = 0; }

    event Deposit(address indexed owner, uint256 amount, uint256 newBalance);
    event Withdraw(address indexed owner, uint256 amount, uint256 newBalance);

    // set in later tasks
    address public immutable aavegotchiDiamond;
    address public immutable realmDiamond;

    constructor(address _aavegotchi, address _realm) {
        admin = msg.sender;
        aavegotchiDiamond = _aavegotchi;
        realmDiamond = _realm;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value, balanceOf[msg.sender]);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "xfer failed");
        emit Withdraw(msg.sender, amount, balanceOf[msg.sender]);
    }
}
