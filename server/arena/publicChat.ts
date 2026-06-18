import { filterInbound, screenOutbound } from "../../src/lib/companion/contentFilter";
import { templateReply } from "../../src/lib/companion/templates";
import { buildPersonality } from "../../src/lib/companion/personality";
import { complete } from "../companion/llmProvider";
import { fetchPublicGotchi } from "./publicState";
import { getCachedReply, putCachedReply, bumpVisitor } from "./arenaCache";

// ---------------------------------------------------------------------------
// Simple deterministic hash — no crypto dependency needed
// ---------------------------------------------------------------------------

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function normalise(msg: string): string {
  return msg.toLowerCase().trim().replace(/\s+/g, " ");
}

function qHash(msg: string): string {
  return simpleHash(normalise(msg));
}

// ---------------------------------------------------------------------------
// Public taste chat — FREE tier ONLY, cache/template-first
// ---------------------------------------------------------------------------

export type TasteChatSource = "cache" | "template" | "ai" | "capped";

export interface TasteChatResult {
  reply: string;
  source: TasteChatSource;
}

const VISITOR_MAX = 12;
const VISITOR_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h

const CAPPED_REPLY =
  "I've chatted a lot today — connect your wallet to keep going! 👻";

export async function publicTasteChat(
  tokenId: string,
  message: string,
  visitor: string
): Promise<TasteChatResult> {
  // 1. Inbound content filter
  const { masked: maskedMessage, deflected } = filterInbound(message);
  if (deflected) {
    // Build a minimal profile for the template — fall back to defaults if fetch fails
    const gotchi = await fetchPublicGotchi(tokenId);
    const profile = gotchi
      ? buildPersonality({
          name: gotchi.name,
          numericTraits: gotchi.traits,
          kinship: gotchi.kinship,
          level: gotchi.level,
        })
      : buildPersonality({ name: `Gotchi #${tokenId}`, numericTraits: [50, 50, 50, 50, 0, 0] });

    return {
      reply: templateReply({ profile, message, deflected: true }),
      source: "template",
    };
  }

  // 2. Cache check
  const hash = qHash(message);
  const cached = getCachedReply(tokenId, hash);
  if (cached !== null) {
    return { reply: cached, source: "cache" };
  }

  // 3. Per-visitor cap (checked BEFORE any LLM call)
  const overCap = bumpVisitor(visitor, VISITOR_MAX, VISITOR_WINDOW_MS);
  if (overCap) {
    return { reply: CAPPED_REPLY, source: "capped" };
  }

  // 4. Fetch public gotchi state
  const gotchi = await fetchPublicGotchi(tokenId);
  if (!gotchi) {
    return {
      reply: "This spirit has wandered beyond the veil… try a different tokenId 👻",
      source: "template",
    };
  }

  // 5. Build personality + short taste system prompt
  const personality = buildPersonality({
    name: gotchi.name,
    numericTraits: gotchi.traits,
    kinship: gotchi.kinship,
    level: gotchi.level,
  });

  const systemPrompt = [
    personality.systemPrompt,
    "",
    "TASTE MODE: You are visible to anyone on the public Gotchi Arena — no wallet needed. " +
      "Keep your reply brief (2-3 sentences max), playful, and true to your trait-voice. " +
      "End with a light invitation: hint that connecting a wallet unlocks the full companion " +
      "experience without being pushy. Never break character.",
  ].join("\n");

  // 6. LLM call — FREE tier ONLY (never "premium")
  const aiText = await complete(
    systemPrompt,
    [{ role: "user", content: maskedMessage }],
    "free" // HARD: public arena NEVER uses "premium"
  );

  const reply = aiText ? screenOutbound(aiText) : templateReply({ profile: personality, message, deflected: false });
  const source: TasteChatSource = aiText ? "ai" : "template";

  // 7. Cache for next time
  putCachedReply(tokenId, hash, reply);

  return { reply, source };
}
