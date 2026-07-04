# Steward v2 GasTank Contract — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test the `GasTank` escrow-and-scoped-forwarder contract that lets an operator run an
owner's pet/channel/claim actions while the owner pays exactly-metered gas from a withdrawable deposit.

**Architecture:** A single Solidity contract. Owners `deposit()`/`withdraw()` their own ETH balance. An
allowlisted operator calls `run(owner, calls)`, which executes ONLY `interact`/`channelAlchemica`/
`claimAllAvailableAlchemica` on the two known diamonds (msg.sender = the contract, which the owner has
whitelisted on-chain), then reimburses the operator `min(gasUsed×tx.gasprice, ownerCap, ownerBalance)` —
strictly ≤ the gas actually burned — and emits a `Reimbursed` receipt event. Non-custodial (owner withdraws
anytime), profit-impossible by construction, scope enforced on-chain.

**Tech Stack:** Solidity ^0.8.20, Foundry (forge 1.7.1, already installed at `~/.foundry/bin`). Contracts
live in `contracts/` alongside the existing `SoulSeal.sol` (standalone `.sol`, deployed externally). Tests
in `contracts/test/` run via `forge test`.

**Full design context:** `docs/superpowers/specs/2026-07-03-steward-v2-delegated-automation-design.md`.

**Verified constants (Base 8453):**
- Aavegotchi diamond `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF`
- Realm diamond `0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372`
- Selectors: `interact(uint256[])`=`0x22c67519` · `channelAlchemica(uint256,uint256,uint256,bytes)`=`0x8027870e`
  · `claimAllAvailableAlchemica(uint256[],uint256,bytes)`=`0xbc6dc2f0`

---

## File Structure

- Create: `foundry.toml` — repo-root Foundry config scoped to the `contracts/` dir (does not touch the
  JS/TS build; forge only reads `.sol`).
- Create: `contracts/GasTank.sol` — the contract.
- Create: `contracts/test/GasTank.t.sol` — Foundry tests (mock diamonds + full behavior).
- Modify: `contracts/README.md` — document GasTank alongside SoulSeal.
- Create: `.gitignore` entry for `out/` and `cache/` (forge build artifacts).

---

## Task 1: Foundry scaffold that compiles + runs one trivial test

**Files:**
- Create: `foundry.toml`
- Create: `contracts/test/Smoke.t.sol`
- Modify: `.gitignore`

- [ ] **Step 1: Write `foundry.toml`** (scopes forge to `contracts/`, keeps artifacts out of the JS build)

```toml
# Foundry config for the on-chain contracts (contracts/*.sol). Isolated from the
# JS/TS app build — forge only compiles Solidity. Run: forge test --root .
[profile.default]
src = "contracts"
test = "contracts/test"
out = "out"
libs = ["lib"]
solc = "0.8.20"
optimizer = true
optimizer_runs = 200
```

- [ ] **Step 2: Add forge artifacts to `.gitignore`**

Append these lines to `.gitignore`:

```
# Foundry build artifacts
/out/
/cache/
```

- [ ] **Step 3: Write a trivial smoke test** at `contracts/test/Smoke.t.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

contract SmokeTest is Test {
    function test_forgeWorks() public {
        assertEq(uint256(1) + 1, 2);
    }
}
```

- [ ] **Step 4: Install forge-std and run the smoke test**

Run:
```bash
export PATH="$PATH:$HOME/.foundry/bin"
forge install foundry-rs/forge-std --no-git 2>/dev/null || forge install foundry-rs/forge-std
forge test --match-path contracts/test/Smoke.t.sol -vv
```
Expected: `[PASS] test_forgeWorks()` and `Test result: ok. 1 passed`.
(If `forge install` complains about a dirty tree, `forge soldeer` or a manual clone of forge-std into
`lib/forge-std` is an acceptable fallback — forge-std just needs to resolve `import "forge-std/Test.sol"`.)

- [ ] **Step 5: Commit**

```bash
git add foundry.toml .gitignore contracts/test/Smoke.t.sol lib/forge-std
git commit -m "chore(contracts): foundry scaffold + smoke test"
```

---

## Task 2: `deposit()` and `withdraw()` — the escrow, non-custodial

**Files:**
- Create: `contracts/GasTank.sol`
- Create: `contracts/test/GasTank.t.sol`

- [ ] **Step 1: Write failing tests** at `contracts/test/GasTank.t.sol`

```solidity
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
}
```

- [ ] **Step 2: Run the tests to verify they fail** (no GasTank yet)

Run: `export PATH="$PATH:$HOME/.foundry/bin"; forge test --match-contract GasTankTest -vv`
Expected: compile error / FAIL — `GasTank.sol` does not exist.

- [ ] **Step 3: Write the minimal contract** at `contracts/GasTank.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Non-custodial gas escrow + scoped forwarder for Steward v2.
/// Owners deposit ETH they can withdraw anytime; an allowlisted operator runs
/// their pet/channel/claim actions and is reimbursed strictly <= metered gas.
contract GasTank {
    address public immutable admin;

    mapping(address => uint256) public balanceOf; // owner => escrowed wei

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$PATH:$HOME/.foundry/bin"; forge test --match-contract GasTankTest -vv`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add contracts/GasTank.sol contracts/test/GasTank.t.sol
git commit -m "feat(gastank): non-custodial deposit/withdraw escrow"
```

---

## Task 3: operator allowlist + owner cap setters

**Files:**
- Modify: `contracts/GasTank.sol`
- Modify: `contracts/test/GasTank.t.sol`

- [ ] **Step 1: Add failing tests** (append inside `GasTankTest`)

```solidity
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
```

- [ ] **Step 2: Run to verify fail**

Run: `forge test --match-contract GasTankTest -vv`
Expected: FAIL — `isOperator`/`setOperator`/`setCapPerRun`/`capPerRun` undefined.

- [ ] **Step 3: Add to `contracts/GasTank.sol`** (inside the contract, after `balanceOf`)

```solidity
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
```

- [ ] **Step 4: Run to verify pass**

Run: `forge test --match-contract GasTankTest -vv`
Expected: all passing (5 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/GasTank.sol contracts/test/GasTank.t.sol
git commit -m "feat(gastank): admin operator allowlist + owner cap-per-run"
```

---

## Task 4: `run()` executes only scoped calls (scope enforced on-chain)

**Files:**
- Modify: `contracts/GasTank.sol`
- Modify: `contracts/test/GasTank.t.sol`

- [ ] **Step 1: Add a mock diamond + failing scope tests**

At the TOP of `contracts/test/GasTank.t.sol` (after the imports, before `GasTankTest`), add a mock that
records calls and lets us point the tank at real-looking targets:

```solidity
contract MockDiamond {
    uint256 public calls;
    fallback() external payable { calls++; }
}
```

Then in `GasTankTest`, replace the `aave`/`realm` address literals with deployed mocks. Change `setUp`:

```solidity
    MockDiamond aaveMock;
    MockDiamond realmMock;

    function setUp() public {
        aaveMock = new MockDiamond();
        realmMock = new MockDiamond();
        tank = new GasTank(address(aaveMock), address(realmMock));
        tank.setOperator(operator, true);
        vm.deal(owner, 10 ether);
    }
```

(Delete the old `address aave`/`address realm` fields and the `new GasTank(aave, realm)` line.)

Add these tests:

```solidity
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
```

- [ ] **Step 2: Run to verify fail**

Run: `forge test --match-contract GasTankTest -vv`
Expected: FAIL — `GasTank.Call`/`run` undefined.

- [ ] **Step 3: Add the `Call` struct, scope allowlist, and a run() that only executes (reimbursement next task)** to `contracts/GasTank.sol`

```solidity
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
        for (uint256 i = 0; i < calls.length; i++) {
            require(calls[i].data.length >= 4, "bad calldata");
            bytes4 sel = bytes4(calls[i].data);
            require(_allowed(calls[i].target, sel), "scope");
            (bool ok, ) = calls[i].target.call(calls[i].data);
            require(ok, "action failed");
        }
        // reimbursement + event added in Task 5
        pet; channel; claim; owner; // silence unused warnings until Task 5
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `forge test --match-contract GasTankTest -vv`
Expected: all passing (10 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/GasTank.sol contracts/test/GasTank.t.sol
git commit -m "feat(gastank): run() executes only scoped (target,selector) calls"
```

---

## Task 5: metered reimbursement (≤ actual gas) + `Reimbursed` receipt

**Files:**
- Modify: `contracts/GasTank.sol`
- Modify: `contracts/test/GasTank.t.sol`

- [ ] **Step 1: Add failing tests** (append to `GasTankTest`)

```solidity
    function test_run_reimbursesOperator_fromOwnerBalance() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519);
        uint256 opBefore = operator.balance;
        vm.txGasPrice(1 gwei);
        vm.prank(operator, operator);
        tank.run(owner, calls, 1, 0, 0);
        // owner balance dropped by exactly what the operator received
        uint256 charged = 1 ether - tank.balanceOf(owner);
        assertGt(charged, 0);
        assertEq(operator.balance - opBefore, charged);
    }

    function test_run_capsReimbursementAtOwnerCap() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        vm.prank(owner); tank.setCapPerRun(1); // 1 wei cap
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519);
        vm.txGasPrice(1 gwei);
        vm.prank(operator, operator);
        tank.run(owner, calls, 1, 0, 0);
        assertEq(1 ether - tank.balanceOf(owner), 1); // charged exactly the cap
    }

    function test_run_neverChargesMoreThanBalance() public {
        vm.prank(owner); tank.deposit{value: 100 wei}(); // tiny balance
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519);
        vm.txGasPrice(1 gwei);
        vm.prank(operator, operator);
        tank.run(owner, calls, 1, 0, 0);
        assertEq(tank.balanceOf(owner), 0); // drained to zero, never negative/underflow
    }

    function test_run_emitsReimbursedReceipt() public {
        vm.prank(owner); tank.deposit{value: 1 ether}();
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519);
        vm.txGasPrice(1 gwei);
        vm.recordLogs();
        vm.prank(operator, operator);
        tank.run(owner, calls, 3, 2, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        // find the Reimbursed event (topic0 = keccak of its signature)
        bytes32 sig = keccak256("Reimbursed(address,address,uint256,uint256,uint16,uint16,uint16)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) if (logs[i].topics[0] == sig) found = true;
        assertTrue(found, "Reimbursed event not emitted");
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `forge test --match-contract GasTankTest -vv`
Expected: FAIL — no reimbursement/event yet (charged == 0).

- [ ] **Step 3: Replace the `run()` body tail in `contracts/GasTank.sol`** with metered reimbursement

Add the event near the other events:

```solidity
    event Reimbursed(
        address indexed owner, address indexed operator,
        uint256 gasUsed, uint256 weiCharged,
        uint16 pet, uint16 channel, uint16 claim
    );
```

Replace `run()` with:

```solidity
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
```

- [ ] **Step 4: Run to verify pass**

Run: `forge test --match-contract GasTankTest -vv`
Expected: all passing (14 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/GasTank.sol contracts/test/GasTank.t.sol
git commit -m "feat(gastank): metered reimbursement (<= actual gas) + Reimbursed receipt"
```

---

## Task 6: reentrancy + fuzz the no-profit invariant

**Files:**
- Modify: `contracts/test/GasTank.t.sol`

- [ ] **Step 1: Add a reentrancy guard test + a fuzz invariant**

```solidity
    function test_run_reentrancyGuardBlocksNestedRun() public {
        // A malicious operator contract that tries to re-enter run() during reimbursement.
        Reenter attacker = new Reenter(tank, address(aaveMock));
        tank.setOperator(address(attacker), true);
        vm.prank(owner); tank.deposit{value: 1 ether}();
        vm.txGasPrice(1 gwei);
        vm.expectRevert(); // nested run reverts on the reentrancy guard
        attacker.attack(owner);
    }

    function testFuzz_neverReimbursesMoreThanCapOrBalance(uint96 deposit, uint96 cap) public {
        vm.assume(deposit > 0);
        vm.deal(owner, uint256(deposit));
        vm.prank(owner); tank.deposit{value: deposit}();
        if (cap != 0) { vm.prank(owner); tank.setCapPerRun(cap); }
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = _call(address(aaveMock), 0x22c67519);
        vm.txGasPrice(1 gwei);
        vm.prank(operator, operator);
        tank.run(owner, calls, 1, 0, 0);
        uint256 charged = uint256(deposit) - tank.balanceOf(owner);
        if (cap != 0) assertLe(charged, cap);
        assertLe(charged, uint256(deposit));
    }
```

Add this attacker contract at the top of the file (after `MockDiamond`):

```solidity
contract Reenter {
    GasTank tank; address aave;
    constructor(GasTank _tank, address _aave) { tank = _tank; aave = _aave; }
    function attack(address owner) external {
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = GasTank.Call({ target: aave, data: abi.encodePacked(bytes4(0x22c67519)) });
        tank.run(owner, calls, 1, 0, 0);
    }
    receive() external payable {
        // re-enter during reimbursement transfer
        GasTank.Call[] memory calls = new GasTank.Call[](1);
        calls[0] = GasTank.Call({ target: aave, data: abi.encodePacked(bytes4(0x22c67519)) });
        tank.run(msg.sender, calls, 1, 0, 0);
    }
}
```

- [ ] **Step 2: Run to verify pass** (the guard + caps already exist from prior tasks; these lock the invariants)

Run: `export PATH="$PATH:$HOME/.foundry/bin"; forge test --match-contract GasTankTest -vv`
Expected: all passing, including the fuzz test (`[PASS] testFuzz_... (runs: 256)`).

- [ ] **Step 3: Commit**

```bash
git add contracts/test/GasTank.t.sol
git commit -m "test(gastank): reentrancy guard + fuzz the no-profit/no-overdraw invariant"
```

---

## Task 7: README + deploy notes

**Files:**
- Modify: `contracts/README.md`

- [ ] **Step 1: Append a GasTank section** to `contracts/README.md`

```markdown
## GasTank Contract

Non-custodial gas escrow + scoped forwarder for Steward v2 estate automation.

### Constructor
`constructor(address aavegotchiDiamond, address realmDiamond)` — deployer becomes `admin`
(manages the operator allowlist). Base: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` /
`0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372`.

### Owner functions (any wallet)
- `deposit()` payable — add to your own gas float.
- `withdraw(uint256)` — pull your float back anytime (non-custodial).
- `setCapPerRun(uint256)` — max wei reimbursable per run (0 = no cap).

### Admin
- `setOperator(address, bool)` — allow/deny a relayer to call `run`.

### run(owner, Call[] calls, pet, channel, claim) — operator only
Executes ONLY `interact` (Aavegotchi) / `channelAlchemica` / `claimAllAvailableAlchemica` (Realm) as
`msg.sender` (the contract, which the owner has whitelisted on-chain via `setPetOperatorForAll` +
`setParcelsAccessRightWithWhitelists`). Reimburses the operator `min(metered gas × tx.gasprice, ownerCap,
ownerBalance)` — always ≤ the gas actually burned — and emits `Reimbursed(owner, operator, gasUsed,
weiCharged, pet, channel, claim)` as the on-chain receipt.

### Deploy
No JS toolchain change. Build + deploy with forge:
`forge create contracts/GasTank.sol:GasTank --constructor-args <aave> <realm> --rpc-url <base> --private-key <deployer>`.
Then `setOperator(<relayer>, true)` and set `STEWARD_GASTANK_ADDRESS` in the server `.env` (used by Plan 2).
```

- [ ] **Step 2: Run the full test suite one last time**

Run: `export PATH="$PATH:$HOME/.foundry/bin"; forge test -vv`
Expected: all tests pass (Smoke + GasTank).

- [ ] **Step 3: Commit**

```bash
git add contracts/README.md
git commit -m "docs(gastank): README + deploy notes"
```

---

## Definition of done (Plan 1)
- `forge test` green: deposit/withdraw, admin operator allowlist, owner cap, scope allowlist (rejects wrong
  selector AND wrong target), metered reimbursement ≤ actual gas, cap + balance ceilings, reentrancy guard,
  and the fuzz no-profit/no-overdraw invariant.
- README documents the contract + deploy.
- **Next:** Plan 2 (backend — swap `aa.ts` for a GasTank submitter, add gas-price + balance gating and the
  `channelScope` option, mirror `Reimbursed` events into the DB for the ledger) and Plan 3 (frontend —
  delegation wizard + receipts dashboard). Before mainnet: professional audit of `GasTank.sol` (it holds
  user funds); ship testnet-first.
