// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ---------------------------------------------------------------------------
// IAavegotchi — minimal interface: only ownerOf is needed.
// ---------------------------------------------------------------------------
interface IAavegotchi {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title  SoulSeal
 * @notice Stores an on-chain "soul seal" for each Aavegotchi.
 *         The attestor (a server key) signs an EIP-712 payload; the gotchi
 *         owner submits it to anchor their soul score on Base.
 *
 * @dev    EIP-712 domain:
 *           { name: "GotchiClosetSoulSeal", version: "1",
 *             chainId: 8453, verifyingContract: <this> }
 *
 *         SealPayload type:
 *           { uint256 tokenId, bytes32 soulHash, uint16 depthBips,
 *             uint16 soulAgeDays, uint256 nonce }
 */
contract SoulSeal {
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

    /// @notice Aavegotchi diamond on Base (used for ownerOf checks).
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

    /**
     * @param _attestor  Address whose private key signs SealPayload structs.
     * @param _diamond   Aavegotchi diamond on Base (for ownerOf checks).
     */
    constructor(address _attestor, address _diamond) {
        require(_attestor != address(0), "SoulSeal: zero attestor");
        require(_diamond  != address(0), "SoulSeal: zero diamond");

        attestor = _attestor;
        diamond  = _diamond;

        // Build the domain separator once, cheaply.
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
    // External — write
    // -----------------------------------------------------------------------

    /**
     * @notice Seal a gotchi's soul score on-chain.
     *
     * @param tokenId      Aavegotchi token ID.
     * @param soulHash     keccak256 of the canonical soul document.
     * @param depthBips    Soul depth * 100 (e.g. 72.50 depth → 7250 bips).
     * @param soulAgeDays  Number of bonded days at the time of sealing.
     * @param nonce        Monotone nonce (e.g. Date.now() from server).
     * @param attestorSig  EIP-712 signature over the SealPayload by `attestor`.
     */
    function seal(
        uint256 tokenId,
        bytes32 soulHash,
        uint16  depthBips,
        uint16  soulAgeDays,
        uint256 nonce,
        bytes calldata attestorSig
    ) external {
        // 1. Verify attestor signature.
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
        address recovered = _recover(digest, attestorSig);
        require(recovered == attestor, "SoulSeal: invalid attestor sig");

        // 2. Caller must be the current owner of the gotchi.
        require(
            IAavegotchi(diamond).ownerOf(tokenId) == msg.sender,
            "SoulSeal: caller is not gotchi owner"
        );

        // 3. Store the record.
        latest[tokenId] = SealRecord({
            soulHash:   soulHash,
            depthBips:  depthBips,
            soulAgeDays: soulAgeDays,
            blockNumber: block.number,
            sealedBy:   msg.sender
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

    /**
     * @dev Recover the signer of an Ethereum signature.
     *      Supports both 64-byte compact (EIP-2098) and 65-byte signatures.
     */
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
            // EIP-2098 compact signature
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
