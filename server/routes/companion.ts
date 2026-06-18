import { Router } from "express";
import { buildPersonality } from "../../src/lib/companion/personality";
import { retrieveLore } from "../../src/lib/companion/knowledge";
import { filterInbound, screenOutbound } from "../../src/lib/companion/contentFilter";
import { templateReply } from "../../src/lib/companion/templates";
import { assembleMessages } from "../../src/lib/companion/chatPrompt";
import { fetchGotchiState } from "../companion/gotchiState";
import { complete } from "../companion/llmProvider";
import {
  appendMessage, getRecentMessages, getFacts, upsertFact,
  isPremiumActive, getEntitlement, addCredits, burnCredit, getCredits, hasCredits,
} from "../companion/db";
import { verifyGhstPayment } from "../lending/verifyPayment";
import { creditPackForGhst, expectedWeiForPack } from "../companion/pricing";
import { premiumSignatureValid } from "../companion/auth";

const router = Router();

// NOTE (v1 limitation): the wallet on /chat is self-reported (no signature/SIWE).
// The free tier runs on a Groq key so the blast radius is rate-limit abuse only.
// Before enabling the premium (OpenAI) tier in production, gate it behind a wallet
// signature so a caller cannot claim another address's premium entitlement and
// spend the operator's OpenAI key. See the design spec's phase-2 notes.

// crude per-wallet token bucket (in-memory): 30 msgs / 10 min
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(wallet: string): boolean {
  const now = Date.now();
  const b = buckets.get(wallet);
  if (!b || b.resetAt < now) { buckets.set(wallet, { count: 1, resetAt: now + 600_000 }); return false; }
  b.count += 1;
  return b.count > 30;
}

// A remembered fact is prepended to the system prompt, so reject anything that
// could carry a prompt-injection payload (newlines, brackets/braces/backticks).
function isSafeFact(fact: string): boolean {
  return fact.length <= 100 && !/[<>{}\[\]`\n\r]/.test(fact);
}

router.get("/health", (_req, res) => res.json({ ok: true }));

router.post("/chat", async (req, res) => {
  try {
    const body = req.body ?? {};
    const tokenId = String(body.tokenId ?? "");
    const wallet = String(body.wallet ?? "").toLowerCase();
    const rawMessage = String(body.message ?? "").slice(0, 500);
    if (!tokenId || !wallet.startsWith("0x") || !rawMessage.trim()) {
      return res.status(400).json({ error: "tokenId, wallet (0x), message required" });
    }
    if (rateLimited(wallet)) return res.status(429).json({ error: "slow down, fren 👻" });

    const { masked, deflected } = filterInbound(rawMessage);

    const state = await fetchGotchiState(tokenId);
    if (!state) return res.status(404).json({ error: "gotchi not found" });
    const profile = buildPersonality(state);

    if (deflected) {
      const reply = templateReply({ profile, message: masked, deflected: true });
      appendMessage(wallet, tokenId, "user", masked);
      appendMessage(wallet, tokenId, "assistant", reply);
      return res.json({ reply, deflected: true });
    }

    const messages = assembleMessages({
      facts: getFacts(wallet, tokenId),
      lore: retrieveLore(masked),
      history: getRecentMessages(wallet, tokenId, 20).map((m) => ({ role: m.role, content: m.content })),
      userMessage: masked,
    });

    // Premium (OpenAI) requires BOTH credits remaining AND a fresh wallet
    // signature, so a spoofed wallet in the body can't spend the operator's key.
    const eligiblePremium =
      isPremiumActive(wallet) &&
      (await premiumSignatureValid(wallet, Number(body.signedAt), String(body.signature ?? "")));

    let reply: string;
    let tier: "free" | "premium" = "free";

    if (eligiblePremium) {
      const premiumText = await complete(profile.systemPrompt, messages, "premium");
      if (premiumText !== null) {
        burnCredit(wallet);
        reply = screenOutbound(premiumText);
        tier = "premium";
      } else {
        // Premium LLM unavailable — fall through to free
        const freeText = await complete(profile.systemPrompt, messages, "free");
        reply = screenOutbound(freeText ?? templateReply({ profile, message: masked, deflected: false }));
      }
    } else {
      const freeText = await complete(profile.systemPrompt, messages, "free");
      reply = screenOutbound(freeText ?? templateReply({ profile, message: masked, deflected: false }));
    }

    appendMessage(wallet, tokenId, "user", masked);
    appendMessage(wallet, tokenId, "assistant", reply);

    const factMatch = masked.match(/\b(i am|i'm|my)\b.{3,80}/i);
    if (factMatch) {
      const fact = factMatch[0].trim();
      if (isSafeFact(fact)) upsertFact(wallet, tokenId, fact);
    }

    res.json({ reply, deflected: false, tier });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// POST /premium/claim  Body: { wallet, ghst, txHash }
router.post("/premium/claim", async (req, res) => {
  try {
    const body = req.body ?? {};
    const wallet = String(body.wallet ?? "");
    const ghst = Number(body.ghst ?? 0);
    const txHash = String(body.txHash ?? "");
    if (!wallet.startsWith("0x") || !txHash.startsWith("0x")) {
      return res.status(400).json({ error: "wallet (0x) and txHash (0x) required" });
    }
    const pack = creditPackForGhst(ghst);
    const expectedWei = expectedWeiForPack(ghst);
    if (!pack || expectedWei === null) return res.status(400).json({ error: `unsupported pack: ${ghst} GHST` });

    // Receiving wallet for premium GHST. Defaults to the GotchiCloset operator
    // wallet (same as the lending fee address); override via COMPANION_RECEIVING_WALLET.
    const operator = process.env.COMPANION_RECEIVING_WALLET || "0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96";

    const verify = await verifyGhstPayment({
      txHash: txHash as `0x${string}`,
      expectedFrom: wallet as `0x${string}`,
      expectedTo: operator as `0x${string}`,
      expectedValueWei: expectedWei,
    });
    if (!verify.ok) return res.status(402).json({ error: `payment verification failed: ${verify.error}` });

    try {
      const credits = addCredits(wallet, pack.credits, txHash);
      return res.json({ ok: true, credits });
    } catch (err: any) {
      if (String(err?.message).includes("already credited")) {
        return res.status(409).json({ error: "payment tx already credited" });
      }
      throw err;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/premium/:wallet", (req, res) => {
  const wallet = req.params.wallet;
  res.json({ active: hasCredits(wallet), credits: getCredits(wallet) });
});

// GET /history/:tokenId/:wallet — recent chat history for this gotchi + owner, so the
// client can restore past conversation after a browser close.
router.get("/history/:tokenId/:wallet", (req, res) => {
  const tokenId = String(req.params.tokenId);
  const wallet = String(req.params.wallet);
  if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet (0x) required" });
  const messages = getRecentMessages(wallet, tokenId, 30).map((m) => ({ role: m.role, content: m.content }));
  res.json({ messages });
});

export default router;
