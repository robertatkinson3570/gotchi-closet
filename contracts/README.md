# SoulSeal Contract

A minimal Base (chain ID 8453) contract that anchors Aavegotchi soul scores on-chain via EIP-712 typed-data attestations.

## EIP-712 Domain

```json
{
  "name": "GotchiClosetSoulSeal",
  "version": "1",
  "chainId": 8453,
  "verifyingContract": "<deployed address>"
}
```

## Typed Data — SealPayload

```
SealPayload {
  uint256 tokenId
  bytes32 soulHash
  uint16  depthBips
  uint16  soulAgeDays
  uint256 nonce
}
```

- **tokenId** — Aavegotchi token ID
- **soulHash** — keccak256 of the canonical soul document (see `server/soul/soulDoc.ts`)
- **depthBips** — soul depth × 100 (e.g. depth 72.50 → 7250 bips; max 10000)
- **soulAgeDays** — bonded days at time of sealing
- **nonce** — monotone nonce (server uses `Date.now()`)

## Constructor Arguments

```
constructor(address attestor, address aavegotchiDiamond)
```

| Arg | Description |
|-----|-------------|
| `attestor` | Server address whose private key signs `SealPayload` structs. Corresponds to `SOUL_ATTESTOR_KEY` in `.env`. |
| `aavegotchiDiamond` | Aavegotchi diamond on Base. Default: `0xA99c4B08201F2913Db8D28e71d020c4298F29dBF` |

## Deploy Note

No Solidity toolchain is included in this repo. The operator deploys with their own tooling (e.g. `forge create`, `hardhat run`, Remix, etc.). After deployment, set `SOUL_SEAL_ADDRESS` in the server `.env` to the deployed contract address.

## Seal Flow

1. Server computes `soulHash` and `depthBips` from the live soul document.
2. Client calls `POST /api/soul/:tokenId/seal` → server returns `{ payload, attestorSig, contract }`.
3. User submits `seal(tokenId, soulHash, depthBips, soulAgeDays, nonce, attestorSig)` from their wallet.
4. Contract verifies attestor signature + gotchi ownership, then stores the `SealRecord`.
