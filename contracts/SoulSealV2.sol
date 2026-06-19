// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ---------------------------------------------------------------------------
// Minimal Aavegotchi interfaces.
//
// IMPORTANT (the whole reason v2 exists): on Base, while a gotchi is rented out
// via Aavegotchi lending, `ownerOf(tokenId)` returns the BORROWER, not the real
// owner. v1 checked `ownerOf == msg.sender`, so the real owner could not seal a
// rented-out gotchi (and the borrower perversely could). v2 resolves the *real*
// owner: if there is an active lending, the lender (original owner) is authorised
// and the borrower is rejected; otherwise `ownerOf` is used as before.
// ---------------------------------------------------------------------------

interface IAavegotchi {
    function ownerOf(uint256 tokenId) external view returns (address);
}

// Subset of the GotchiLending struct returned by the diamond. Field order/types
// MUST match the on-chain struct for the ABI decode to work.
struct GotchiLending {
    address lender;
    uint96  initialCost;
    address borrower;
    uint32  listingId;
    uint32  erc721TokenId;
    uint32  whitelistId;
    address originalOwner;
    uint40  timeCreated;
    uint40  timeAgreed;
    bool    canceled;
    bool    completed;
    address thirdParty;
    uint8[3] revenueSplit;
    uint40  lastClaimed;
    uint32  period;
    address[] revenueTokens;
}

interface IGotchiLending {
    function isAavegotchiLent(uint32 _erc721TokenId) external view returns (bool);
    function getGotchiLendingFromToken(uint32 _erc721TokenId)
        external
        view
        returns (GotchiLending memory);
}

/**
 * @title  SoulSealV2
 * @notice On-chain "soul seal" for each Aavegotchi, lending-aware so the real
 *         owner can always seal their gotchi — even while it is rented out.
 *
 * @dev    EIP-712 domain is unchanged from v1 so the existing attestor signer
 *         keeps working (only the verifyingContract address changes):
 *           { name: "GotchiClosetSoulSeal", version: "1",
 *             chainId: 8453, verifyingContract: <this> }
 *
 *         SealPayload type (unchanged):
 *           { uint256 tokenId, bytes32 soulHash, uint16 depthBips,
 *             uint16 soulAgeDays, uint256 nonce }
 */
contract SoulSealV2 {
    // -----------------------------------------------------------------------
    // EIP-712 constants
    // -----------------------------------------------------------------------

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    bytes32 private constant _SEAL_PAYLOAD_TYPEHASH =
        keccak256(
            "SealPayload(uint256 tokenId,bytes32 soulHash,uint16 depthBips,uint16 soulAgeDays,uint256 nonce)"
        );

    bytes32 private immutable _domainSeparator;

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    /// @notice The trusted attestor address (server key).
    address public immutable attestor;

    /// @notice Aavegotchi diamond on Base (ownerOf + lending lookups).
    address public immutable diamond;

    struct SealRecord {
        bytes32 soulHash;
        uint16  depthBips;
        uint16  soulAgeDays;
        uint256 blockNumber;
        address sealedBy;
    }

    /// @notice tokenId => latest seal record.
    mapping(uint256 => SealRecord) public latest;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Sealed(
        uint256 indexed tokenId,
        bytes32 indexed soulHash,
        uint16  depthBips,
        address indexed sealedBy
    );

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address _attestor, address _diamond) {
        require(_attestor != address(0), "SoulSeal: zero attestor");
        require(_diamond  != address(0), "SoulSeal: zero diamond");

        attestor = _attestor;
        diamond  = _diamond;

        _domainSeparator = keccak256(
            abi.encode(
                _DOMAIN_TYPEHASH,
                keccak256(bytes("GotchiClosetSoulSeal")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // -----------------------------------------------------------------------
    // Ownership resolution (lending-aware)
    // -----------------------------------------------------------------------

    /**
     * @notice The address authorised to seal `tokenId`: the lender (real owner)
     *         while the gotchi is actively rented out, otherwise `ownerOf`.
     * @dev    Defensive try/catch around both lending calls so any diamond
     *         revert or interface mismatch falls back to the plain ownerOf check.
     */
    function authorizedOwner(uint256 tokenId) public view returns (address) {
        try IGotchiLending(diamond).isAavegotchiLent(uint32(tokenId)) returns (bool lent) {
            if (lent) {
                try IGotchiLending(diamond).getGotchiLendingFromToken(uint32(tokenId))
                    returns (GotchiLending memory l)
                {
                    // Only an active, agreed, not-yet-finished lending counts.
                    if (l.timeAgreed != 0 && !l.completed && !l.canceled) {
                        return l.originalOwner != address(0) ? l.originalOwner : l.lender;
                    }
                } catch {}
            }
        } catch {}
        return IAavegotchi(diamond).ownerOf(tokenId);
    }

    // -----------------------------------------------------------------------
    // External — write
    // -----------------------------------------------------------------------

    function seal(
        uint256 tokenId,
        bytes32 soulHash,
        uint16  depthBips,
        uint16  soulAgeDays,
        uint256 nonce,
        bytes calldata attestorSig
    ) external {
        // 1. Verify attestor signature over the EIP-712 SealPayload.
        bytes32 structHash = keccak256(
            abi.encode(
                _SEAL_PAYLOAD_TYPEHASH,
                tokenId,
                soulHash,
                depthBips,
                soulAgeDays,
                nonce
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator, structHash)
        );
        require(_recover(digest, attestorSig) == attestor, "SoulSeal: invalid attestor sig");

        // 2. Caller must be the real owner (lender if rented out, else ownerOf).
        require(
            authorizedOwner(tokenId) == msg.sender,
            "SoulSeal: caller is not gotchi owner"
        );

        // 3. Store the record.
        latest[tokenId] = SealRecord({
            soulHash:    soulHash,
            depthBips:   depthBips,
            soulAgeDays: soulAgeDays,
            blockNumber: block.number,
            sealedBy:    msg.sender
        });

        emit Sealed(tokenId, soulHash, depthBips, msg.sender);
    }

    // -----------------------------------------------------------------------
    // External — read
    // -----------------------------------------------------------------------

    /**
     * @notice Return the latest seal record for a token.
     *         blockNumber == 0 means the gotchi has never been sealed.
     */
    function getSeal(uint256 tokenId)
        external
        view
        returns (SealRecord memory)
    {
        return latest[tokenId];
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _recover(bytes32 digest, bytes calldata sig)
        internal
        pure
        returns (address)
    {
        require(sig.length == 65 || sig.length == 64, "SoulSeal: bad sig length");

        bytes32 r;
        bytes32 s;
        uint8   v;

        if (sig.length == 65) {
            assembly {
                r := calldataload(sig.offset)
                s := calldataload(add(sig.offset, 32))
                v := byte(0, calldataload(add(sig.offset, 64)))
            }
        } else {
            assembly {
                r := calldataload(sig.offset)
                let vs := calldataload(add(sig.offset, 32))
                s := and(vs, 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)
                v := add(shr(255, vs), 27)
            }
        }

        if (v < 27) v += 27;
        require(v == 27 || v == 28, "SoulSeal: bad sig v");

        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "SoulSeal: ecrecover failed");
        return signer;
    }
}
