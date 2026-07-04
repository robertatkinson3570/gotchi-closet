import { Router } from "express";
import { buildPersonality } from "../../src/lib/companion/personality";
import { retrieveLore } from "../../src/lib/companion/knowledge";
import { filterInbound, screenOutbound } from "../../src/lib/companion/contentFilter";
import { templateReply } from "../../src/lib/companion/templates";
import { assembleMessages } from "../../src/lib/companion/chatPrompt";
import { fetchGotchiState } from "../companion/gotchiState";
import { fetchHoldingsSummary } from "../companion/holdings";
import { fetchBaazaarDeals } from "../companion/baazaar";
import { fetchDaoSummary } from "../companion/dao";
import { fetchEstateStatus } from "../companion/estate";
import { complete, completeWithTools } from "../companion/llmProvider";
import { HERMES_TOOLS, HERMES_NAV_ROUTES, HERMES_ACTION_DIRECTIVE } from "../companion/tools";
import {
  appendMessage, getRecentMessages, getFacts, upsertFact,
  isPremiumActive, getEntitlement, addCredits, burnCredit, getCredits,
  getActions,
} from "../companion/db";
import { verifyGhstPayment } from "../lending/verifyPayment";
import { creditPackForGhst, expectedWeiForPack } from "../companion/pricing";
import { premiumSignatureValid } from "../companion/auth";
import { soulDepthSnapshot } from "../soul/snapshot";

const router = Router();

// NOTE (v1 limitation): the wallet on /chat is self-reported (no signature/SIWE).
// The free tier runs on a Groq key so the blast radius is rate-limit abuse only.
// Before enabling the premium (OpenAI) tier in production, gate it behind a wallet
// signature so a caller cannot claim another address's premium entitlement and
// spend the operator's OpenAI key. See the design spec's phase-2 notes.

// in-memory token buckets: 30 msgs / 10 min per wallet, plus a per-IP cap so a
// caller can't bypass the wallet limit by rotating wallets from one host.
// (req.ip is the real client only because app.ts sets trust proxy.)
const buckets = new Map<string, { count: number; resetAt: number }>();
function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return false; }
  b.count += 1;
  return b.count > limit;
}
function rateLimited(wallet: string, ip?: string): boolean {
  const w = hit("w:" + wallet, 30, 600_000);
  const i = ip ? hit("ip:" + ip, 100, 600_000) : false;
  return w || i;
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
    if (rateLimited(wallet, req.ip)) return res.status(429).json({ error: "slow down, fren 👻" });

    const { masked, deflected } = filterInbound(rawMessage);

    const state = await fetchGotchiState(tokenId);
    if (!state) return res.status(404).json({ error: "gotchi not found" });
    const profile = buildPersonality(state);
    const soul = soulDepthSnapshot(tokenId);
    const canAct =
      "\n\nYou CAN act for your owner right here in this chat — channel gotchis, empty parcel reservoirs, " +
      "and claim land alchemica all happen when they ask. NEVER say you can't invoke actions, and NEVER " +
      "tell them to set up 'Steward' or do it manually — you handle it.";
    const systemPrompt = (soul ? `${profile.systemPrompt}\n\n${soul}` : profile.systemPrompt) + canAct;

    if (deflected) {
      const reply = templateReply({ profile, message: masked, deflected: true });
      appendMessage(wallet, tokenId, "user", masked);
      appendMessage(wallet, tokenId, "assistant", reply);
      return res.json({ reply, deflected: true });
    }

    // Recent actions Hermes took go into context so it remembers what it did for the owner.
    const actionLines = getActions(wallet, tokenId, 5).map(
      (a) => `You did ${a.kind} for the owner${a.txHash ? ` (tx ${a.txHash.slice(0, 10)}…)` : ""}`
    );
    // When the owner asks about their wallet/holdings, fetch what they own from the subgraph so
    // Hermes answers from real data instead of guessing.
    const asksHoldings = /\b(wallet|holdings?|portfolio|own|owned|how many|my gotchis)\b/i.test(masked);
    const holdings = asksHoldings ? await fetchHoldingsSummary(wallet) : null;
    // "what deals / cheapest / floor" → answer from real Baazaar listings, not just navigate.
    const asksDeals = /\b(deals?|cheapest|floor|for sale|listings?|good buy|price)\b/i.test(masked);
    const deals = asksDeals ? await fetchBaazaarDeals() : null;
    // "what proposals are live / governance / voting" → answer from live Snapshot data.
    const asksDao = /\b(proposals?|governance|agip|voting|vote on|snapshot)\b/i.test(masked);
    const daoInfo = asksDao ? await fetchDaoSummary() : null;
    // "what needs doing / anything ready / what's due" → report due upkeep (read, don't act).
    const asksEstate = /\b(needs doing|anything (ready|due|to collect)|what.?s (due|ready)|estate status|due yet)\b/i.test(masked);
    const estate = asksEstate ? await fetchEstateStatus(wallet) : null;
    const messages = assembleMessages({
      facts: [...getFacts(wallet, tokenId), ...actionLines, ...(holdings ? [holdings] : []), ...(deals ? [deals] : []), ...(daoInfo ? [daoInfo] : []), ...(estate ? [estate] : [])],
      lore: retrieveLore(masked),
      history: getRecentMessages(wallet, tokenId, 20).map((m) => ({ role: m.role, content: m.content })),
      userMessage: masked,
    });

    // Premium (OpenAI) requires BOTH credits remaining AND a fresh wallet signature.
    const eligiblePremium =
      isPremiumActive(wallet) &&
      (await premiumSignatureValid(wallet, Number(body.signedAt), String(body.signature ?? "")));
    const tier: "free" | "premium" = eligiblePremium ? "premium" : "free";

    const persist = (r: string) => {
      appendMessage(wallet, tokenId, "user", masked);
      appendMessage(wallet, tokenId, "assistant", r);
    };
    const remember = () => {
      const factMatch = masked.match(/\b(i am|i'm|my)\b.{3,80}/i);
      if (factMatch) {
        const fact = factMatch[0].trim();
        if (isSafeFact(fact)) upsertFact(wallet, tokenId, fact);
      }
    };

    // Only offer tools when the message reads like an action/navigation intent — llama over-calls
    // tools on ordinary questions, which would break normal conversation. Plain chat skips tools.
    const wantsTool = !asksDeals && !asksDao && !asksEstate &&
      /\b(channel|pet|petting|claim|collect|harvest|empty|drain|parcel|parcels|upkeep|farm|swap|go to|goto|open|navigate|take me|bring me|show me|baazaar|bazaar|marketplace|lending|rent|forge|staking|dao|leaderboard|pulse|activity|get.?tokens|alchemica)\b/i.test(
        masked
      );
    // Deterministic: a clear "empty/collect/channel/claim" request ALWAYS prepares the upkeep.
    // Don't gamble on the model picking navigate over the action (it did, and disclaimed).
    const isQuestion = /^\s*(how|what|why|when|where|who|can|could|do|does|is|are|explain|tell me)\b/i.test(masked);
    const wantsCollect = !isQuestion && /\b(empty|collect|channel|claim|harvest|drain|reservoirs?)\b/i.test(masked);
    if (wantsCollect && String(state.owner).toLowerCase() === wallet) {
      const r = screenOutbound("on it — checking your parcels & gotchis… if there's alchemica ready, approve it in your wallet 👻");
      persist(r);
      return res.json({ reply: r, prepareUpkeep: true, navigate: "/lending/lands", tier });
    }

    const turn = wantsTool
      ? await completeWithTools(`${systemPrompt}\n\n${HERMES_ACTION_DIRECTIVE}`, messages, HERMES_TOOLS, tier)
      : null;

    // Hermes wants to ACT — channel/pet/claim right here. "Prepare + sign": the client fetches
    // the owner's due upkeep and their OWN wallet sends it (works today, no Steward enrollment).
    // The client reports when nothing is ready (cooldowns still ticking).
    if (turn?.toolCall?.name === "run_upkeep") {
      if (String(state.owner).toLowerCase() !== wallet) {
        const r = screenOutbound("that gotchi isn't in your wallet — i can only act for its owner 👻");
        persist(r);
        return res.json({ reply: r, deflected: false, tier });
      }
      const r = screenOutbound("on it — checking your parcels & gotchis… if there's alchemica ready, approve the transaction in your wallet 👻");
      persist(r);
      // Show them the land page while we collect (prepare+sign keeps the chat open).
      return res.json({ reply: r, prepareUpkeep: true, navigate: "/lending/lands", tier });
    }

    // Hermes wants to NAVIGATE the owner to a page (client performs the route change).
    if (turn?.toolCall?.name === "navigate") {
      const path = String(turn.toolCall.args.path ?? "");
      const allowed = (HERMES_NAV_ROUTES as readonly string[]).includes(path);
      const r = screenOutbound(allowed ? "taking you there now 👻" : "i can't open that page, fren");
      persist(r);
      return res.json({ reply: r, navigate: allowed ? path : undefined, tier });
    }

    // Normal chat reply — the proven plain-completion path, also the fallback when a tool turn
    // produced no usable text (so chat never collapses to the template on a stray tool call).
    const text = turn?.text ?? (await complete(systemPrompt, messages, tier));
    const reply = screenOutbound(text ?? templateReply({ profile, message: masked, deflected: false }));
    if (tier === "premium" && text) burnCredit(wallet);
    persist(reply);
    remember();
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
