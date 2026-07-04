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
    event Reimbursed(
        address indexed owner, address indexed operator,
        uint256 gasUsed, uint256 weiCharged,
        uint16 pet, uint16 channel, uint16 claim
    );

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

    struct Call { address target; bytes data; }

    bytes4 private constant SEL_INTERACT = 0x22c67519;
    bytes4 private constant SEL_CHANNEL  = 0x8027870e;
    bytes4 private constant SEL_CLAIM    = 0xbc6dc2f0;

    function _allowed(address target, bytes4 sel) internal view returns (bool) {
        if (target == aavegotchiDiamond) return sel == SEL_INTERACT;
        if (target == realmDiamond) return sel == SEL_CHANNEL || sel == SEL_CLAIM;
        return false;
    }

    function run(address owner, Call[] calldata calls, uint16 pet, uint16 channel, uint16 claim)
        external nonReentrant
    {
        require(isOperator[msg.sender], "not operator");
        uint256 gasStart = gasleft();
        for (uint256 i = 0; i < calls.length; i++) {
            require(calls[i].data.length >= 4, "bad calldata");
            bytes4 sel = bytes4(calls[i].data);
            require(_allowed(calls[i].target, sel), "scope");
            (bool ok, ) = calls[i].target.call(calls[i].data);
            require(ok, "action failed");
        }
        // Metered gas is a strict SUBSET of the whole tx's gas (excludes intrinsic +
        // calldata + this transfer), so reimbursement is always <= what the operator
        // actually paid — profit is impossible by construction.
        uint256 cost = (gasStart - gasleft()) * tx.gasprice;
        uint256 cap = capPerRun[owner];
        if (cap != 0 && cost > cap) cost = cap;
        if (cost > balanceOf[owner]) cost = balanceOf[owner];
        balanceOf[owner] -= cost;
        (bool paid, ) = msg.sender.call{value: cost}("");
        require(paid, "reimburse failed");
        emit Reimbursed(owner, msg.sender, gasStart - gasleft(), cost, pet, channel, claim);
    }
}
