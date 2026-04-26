/**
 * Parse a viem/wagmi error object into a human-readable string.
 * Handles common Aavegotchi lending revert reasons.
 */

const REVERT_PATTERNS: Array<{ match: RegExp; message: string }> = [
  // GHST allowance / balance
  { match: /ERC20:\s*insufficient allowance/i, message: "GHST approval is missing or too low. Approve GHST first." },
  { match: /ERC20:\s*transfer amount exceeds balance/i, message: "Not enough GHST in your wallet for this rent." },
  { match: /transfer amount exceeds allowance/i, message: "GHST approval is too low. Approve GHST first." },

  // Aavegotchi LendingFacet specific
  { match: /Lending:\s*Lending exists for this token/i, message: "This gotchi already has an active listing. Cancel it first." },
  { match: /Lending:\s*Token not active/i, message: "Gotchi must be summoned (not in portal/closed state) to list it." },
  { match: /Lending:\s*Period .* exceeds limit/i, message: "Rental period exceeds the 30-day protocol cap." },
  { match: /Lending:\s*Period must be greater than 0/i, message: "Rental period must be at least 1 second." },
  { match: /Lending:\s*Revenue splits do not add up/i, message: "Revenue splits must sum to exactly 100." },
  { match: /Lending:\s*originalOwner cannot be zero/i, message: "Listing requires a valid owner address." },
  { match: /Lending:\s*Whitelist not found/i, message: "Whitelist ID doesn't exist on-chain." },
  { match: /Lending:\s*Borrower not whitelisted/i, message: "Your wallet isn't on this listing's whitelist." },
  { match: /Lending:\s*Not available for borrowing/i, message: "Listing was already taken or cancelled." },
  { match: /Lending:\s*Lending not found/i, message: "Lending no longer exists (already ended/cancelled)." },
  { match: /Lending:\s*Token in escrow/i, message: "Gotchi is in baazaar/lending escrow." },
  { match: /Lending:\s*Lending already exists/i, message: "This gotchi is already lent out." },
  { match: /Lending:\s*Period not over/i, message: "Rental period hasn't ended yet — only the borrower can return early." },
  { match: /Lending:\s*Not the lender/i, message: "Only the original lender can cancel/end this." },
  { match: /Lending:\s*Not the borrower/i, message: "Only the current borrower can do this." },
  { match: /Lending:\s*Caller not lender or borrower/i, message: "Only the lender or borrower can settle this rental." },
  { match: /Lending:\s*Locked aavegotchi cannot be lent/i, message: "Gotchi is locked (probably listed in baazaar). Unlist first." },
  { match: /Lending:\s*Aavegotchi must be unequipped/i, message: "Gotchi can be lent with wearables, but inventory items must be removed." },

  // Whitelist facet
  { match: /Whitelist:\s*Not whitelist owner/i, message: "Only the whitelist owner can do that." },
  { match: /Whitelist:\s*Empty addresses/i, message: "Whitelist needs at least one address." },
  { match: /Whitelist:\s*Whitelist not found/i, message: "Whitelist doesn't exist." },

  // Operator
  { match: /Operator:\s*Not authorized/i, message: "Operator wallet isn't authorized for this gotchi. Toggle auto-renew on first." },

  // Wallet / network / generic
  { match: /User rejected the request/i, message: "Transaction rejected in wallet." },
  { match: /User denied transaction signature/i, message: "Transaction rejected in wallet." },
  { match: /chain.*mismatch|wrong network/i, message: "Switch your wallet to Base." },
  { match: /insufficient funds for gas/i, message: "Not enough ETH on Base for gas. Bridge a tiny amount." },
  { match: /nonce too low|replacement transaction underpriced/i, message: "Wallet nonce out of sync. Refresh the page or reset wallet activity." },
  { match: /timeout|timed out/i, message: "Network is slow — the tx may still go through. Check Basescan in a minute." },
  { match: /execution reverted(?!:)/i, message: "Transaction reverted on-chain. Likely a state issue (e.g. gotchi already lent, kinship too low, allowance reset)." },
];

export function parseRevert(err: unknown): string {
  if (!err) return "Unknown error.";

  // viem errors usually have a `shortMessage` and a longer `message`
  const e = err as any;
  const candidates: string[] = [];
  if (typeof e.shortMessage === "string") candidates.push(e.shortMessage);
  if (typeof e.details === "string") candidates.push(e.details);
  if (typeof e.metaMessages === "object" && Array.isArray(e.metaMessages)) {
    candidates.push(...e.metaMessages.filter((s: any): s is string => typeof s === "string"));
  }
  if (typeof e.cause?.shortMessage === "string") candidates.push(e.cause.shortMessage);
  if (typeof e.cause?.message === "string") candidates.push(e.cause.message);
  if (typeof e.message === "string") candidates.push(e.message);

  const haystack = candidates.join("\n");

  for (const { match, message } of REVERT_PATTERNS) {
    if (match.test(haystack)) return message;
  }

  // Unknown — return the cleanest available
  const best = candidates[0] || "Transaction failed.";
  return best.length > 180 ? best.slice(0, 180) + "…" : best;
}
