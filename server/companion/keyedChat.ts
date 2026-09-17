// KEEPER GOTCHI (08-wisp-chat.md §8.2): the keyed chat turn. A third-party
// app pays for a Wisp key and its users talk to the same gotchi, on our
// models, in the same shared log Closet and GVR write to. Everything the
// unkeyed route does that is Closet's own is left out here, by construction:
//
//   * consumeChat runs BEFORE anything else: before the gotchi is fetched,
//     before any model is asked. Over the cap, lapsed, or not in the plan is
//     a clean 429 and never a model call (§8.2 "never an unmetered key").
//   * no private desk memory: Closet's remembered facts (companion_facts),
//     Hermes's action log and goals are that wallet's own, proved by nothing
//     a third party sends; a keyed turn reads none of them and writes none
//     (no `remember`). The public subgraph summaries (holdings, lending,
//     deals, DAO, estate: all public chain data) fold on the same triggers.
//   * canAct is off: the "I can act for you" sentence is replaced by one that
//     points at the app; the collect short-circuit, the tool loop and the
//     prepareUpkeep directive do not exist on this path.
//   * SITE_OVERVIEW and Closet's app how-tos are dropped (their app is not
//     our site); appName replaces GotchiCloset in the persona, kbLines fold
//     as <data> after the lore, navMap drives navigation for their routes.
//   * the analyst is not on this door: a body asking for Ask mode is refused
//     (a Wisp key never reaches /api/analyst/ask).
//
// Pure over its deps so the route test can pin every one of those with a
// spy; routes/companion.ts adapts express.

import { buildPersonality } from "../../src/lib/companion/personality";
import { retrieveLore } from "../../src/lib/companion/knowledge";
import { filterInbound, screenOutbound } from "../../src/lib/companion/contentFilter";
import { templateReply } from "../../src/lib/companion/templates";
import { assembleMessages } from "../../src/lib/companion/chatPrompt";
import { fetchGotchiState } from "./gotchiState";
import { fetchHoldingsSummary } from "./holdings";
import { fetchBaazaarDeals } from "./baazaar";
import { fetchDaoSummary } from "./dao";
import { fetchEstateStatus } from "./estate";
import { fetchLendingSummary } from "./lending";
import { detectNavFrom, isHelpIntent } from "./intent";
import { complete } from "./llmProvider";
import { appendMessage, getRecentMessages, clientTagOfKey } from "./db";
import { soulDepthSnapshot } from "../soul/snapshot";
import { consumeChat, type WispAccount, type WispContext } from "../mcp/accounts";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_ID_RE = /^\d{1,12}$/;
export const KEYED_MESSAGE_CUT = 500;
/** The same per-wallet ceiling as the unkeyed door (30 turns per 10 minutes),
 *  its own buckets: a third-party app's server is one IP for all its users,
 *  so the unkeyed per-IP cap would be wrong here and is not applied. */
export const KEYED_WALLET_LIMIT = 30;
export const KEYED_WALLET_WINDOW_MS = 600_000;

const buckets = new Map<string, { count: number; resetAt: number }>();
function walletLimited(apiKey: string, wallet: string, now: number): boolean {
  const key = `${apiKey}|${wallet}`;
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + KEYED_WALLET_WINDOW_MS }); return false; }
  b.count += 1;
  return b.count > KEYED_WALLET_LIMIT;
}

/** The app when the key has set no context yet. */
export const DEFAULT_APP_NAME = "the app you are chatting in";

export function cannotActLine(appName: string): string {
  return (
    "\n\nYou cannot act for your owner from this chat and you have no buttons here. If they ask you to channel, " +
    `claim, pet, empty, list, lend or move anything, say plainly that ${appName} can show them where to do that. ` +
    "Never claim you did it, never say you can do it here, and never tell them to set anything up."
  );
}

export function appLine(ctx: WispContext | null): string {
  const name = ctx?.appName ?? DEFAULT_APP_NAME;
  return (
    `\n\nYou are speaking inside ${name}${ctx?.appUrl ? ` (${ctx.appUrl})` : ""}, a third-party app that hosts you. ` +
    "You know that app only through the facts it gives you in <data>; if it gave none, do not invent its screens or buttons. " +
    "You are not on your usual site right now."
  );
}

/** The same honesty rule the unkeyed route carries, verbatim. */
export const HONESTY_LINE =
  "\n\nWhen the context includes live on-chain data (holdings, lendings, deals, proposals, due " +
  "upkeep), state it directly as the current truth — never say 'I recall' or 'earlier', and never " +
  "ask permission to look; you already have it. If the owner asks about something you have no live " +
  "data for (news, announcements, anything not in your context), say plainly you can't pull that " +
  "live and point them to the official Aavegotchi channels — NEVER invent it.";

export function keyedCapabilities(appName: string): string {
  return [
    "here's what i can do for you here 👻",
    "",
    "💬 chat as myself: my traits, my mood, our shared memory of what we've talked about",
    "🔎 answer from live data: \"what do i own?\", \"what am i renting out?\", \"any deals now?\", \"what proposals are live?\", \"what's due?\"",
    `🧭 point you around ${appName} when it has told me its pages`,
    "",
    `i can't act on-chain from here — ${appName} can show you where to do that.`,
  ].join("\n");
}

export const ANALYST_NOT_ON_THIS_DOOR = "the analyst is not available to Wisp keys; keyed chat is companion chat only";

export interface KeyedChatDeps {
  now?: () => number;
  consume?: typeof consumeChat;
}

export type KeyedResult = { status: number; body: Record<string, unknown> };

export async function handleKeyedChat(bodyIn: unknown, apiKey: string, account: WispAccount, deps: KeyedChatDeps = {}): Promise<KeyedResult> {
  const now = deps.now ?? Date.now;
  const consume = deps.consume ?? consumeChat;
  const body = (bodyIn && typeof bodyIn === "object" ? bodyIn : {}) as Record<string, unknown>;
  const tokenId = String(body.tokenId ?? "");
  const wallet = String(body.wallet ?? "").toLowerCase();
  const rawMessage = String(body.message ?? "").slice(0, KEYED_MESSAGE_CUT);
  if (!TOKEN_ID_RE.test(tokenId) || !ADDR_RE.test(wallet) || !rawMessage.trim()) {
    return { status: 400, body: { error: "tokenId, wallet (0x), message required" } };
  }
  // A Wisp key never reaches the analyst (owner, slice 08): Ask mode is a
  // different, Holder-gated door that a third party cannot prove a wallet for.
  if (body.ask === true || body.mode === "ask" || body.analyst === true) {
    return { status: 403, body: { error: ANALYST_NOT_ON_THIS_DOOR } };
  }

  // 1. THE METER, before anything else. Refusals are clean and cost nothing.
  const t = now();
  const gate = consume(apiKey, t);
  const client = clientTagOfKey(apiKey);
  if (!gate.allowed) {
    return {
      status: 429,
      body: { error: "chat cap reached", reason: gate.reason, plan: gate.plan, usedToday: gate.usedToday, limitPerDay: gate.limitPerDay, resetsAt: gate.resetsAt, client },
    };
  }
  if (walletLimited(apiKey, wallet, t)) return { status: 429, body: { error: "slow down, fren 👻", reason: "wallet rate limit", plan: gate.plan, client } };

  const ctx = account.context;
  const appName = ctx?.appName ?? DEFAULT_APP_NAME;
  const { masked, deflected } = filterInbound(rawMessage);
  const persist = (r: string) => {
    appendMessage(wallet, tokenId, "user", masked, client);
    appendMessage(wallet, tokenId, "assistant", r, client);
  };
  const answer = (reply: string, extra: Record<string, unknown> = {}): KeyedResult => ({
    status: 200, body: { reply, deflected: false, client, plan: gate.plan, usedToday: gate.usedToday, limitPerDay: gate.limitPerDay, ...extra },
  });

  // 2. The persona: the same gotchi, the app's name in the site sentence, no
  //    site overview, the app line, no canAct, the honesty rule.
  const state = await fetchGotchiState(tokenId);
  if (!state) return { status: 404, body: { error: "gotchi not found" } };
  const profile = buildPersonality(state, { includeSiteOverview: false });
  const soul = soulDepthSnapshot(tokenId);
  const persona = profile.systemPrompt.replace(/GotchiCloset|Gotchi Closet/g, appName);
  const systemPrompt = (soul ? `${persona}\n\n${soul}` : persona) + appLine(ctx) + cannotActLine(appName) + HONESTY_LINE;

  if (deflected) {
    const reply = templateReply({ profile, message: masked, deflected: true });
    persist(reply);
    return { status: 200, body: { reply, deflected: true, client, plan: gate.plan, usedToday: gate.usedToday, limitPerDay: gate.limitPerDay } };
  }
  if (isHelpIntent(masked)) {
    const r = screenOutbound(keyedCapabilities(appName));
    persist(r);
    return answer(r);
  }
  // 3. Navigation over the APP's routes only (never Closet's table).
  if (ctx?.navMap && Object.keys(ctx.navMap).length) {
    const navTo = detectNavFrom(masked, ctx.navMap);
    if (navTo) {
      const r = screenOutbound("taking you there 👻");
      persist(r);
      return answer(r, { navigate: navTo });
    }
  }

  // 4. Public chain data on the same triggers as the unkeyed route. No
  //    private facts, no action log.
  const asksHoldings = /\b(wallet|holdings?|portfolio|own|owned|how many|my gotchis)\b/i.test(masked);
  const holdings = asksHoldings ? await fetchHoldingsSummary(wallet) : null;
  const asksLending = /\b(lend\w*|lent|rent\w*|borrow\w*)\b/i.test(masked);
  const lending = (asksLending || asksHoldings) ? await fetchLendingSummary(wallet) : null;
  const asksDeals = /\b(deals?|cheapest|floor|for sale|listings?|good buy|price)\b/i.test(masked);
  const deals = asksDeals ? await fetchBaazaarDeals() : null;
  const asksDao = /\b(proposals?|governance|agip|voting|vote on|snapshot)\b/i.test(masked);
  const daoInfo = asksDao ? await fetchDaoSummary() : null;
  const asksEstate = /\b(needs doing|anything (ready|due|to collect)|what.?s (due|ready)|estate status|due yet)\b/i.test(masked);
  const estate = asksEstate ? await fetchEstateStatus(wallet) : null;
  const messages = assembleMessages({
    facts: [...(holdings ? [holdings] : []), ...(lending ? [lending] : []), ...(deals ? [deals] : []), ...(daoInfo ? [daoInfo] : []), ...(estate ? [estate] : [])],
    lore: retrieveLore(masked, 4, { appKb: false }),
    ...(ctx?.kbLines?.length ? { appFacts: { appName, lines: ctx.kbLines } } : {}),
    // THE SHARED HISTORY: every client's turns, as the unkeyed route reads them.
    history: getRecentMessages(wallet, tokenId, 8).map((m) => ({ role: m.role, content: m.content })),
    userMessage: masked,
  });

  // 5. The model, on the free chain (the owner's local rail first, then Groq).
  //    A keyed turn cannot sign for premium and never spends premium credits.
  const text = await complete(systemPrompt, messages, "free");
  const reply = screenOutbound(text ?? templateReply({ profile, message: masked, deflected: false }));
  persist(reply);
  return answer(reply);
}
