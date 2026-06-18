// Small, intentionally conservative profanity list. Word-boundary matched.
const PROFANITY = ["shit", "fuck", "bitch", "asshole", "cunt", "dick", "bastard"];
const RE = new RegExp(`\\b(${PROFANITY.join("|")})\\b`, "gi");

export interface InboundResult { masked: string; deflected: boolean; }

export function filterInbound(text: string): InboundResult {
  const deflected = RE.test(text);
  RE.lastIndex = 0;
  const masked = text.replace(RE, (m) => "*".repeat(Math.max(4, m.length)));
  RE.lastIndex = 0;
  return { masked, deflected };
}

export function screenOutbound(text: string): string {
  const out = text.replace(RE, (m) => "*".repeat(Math.max(4, m.length)));
  RE.lastIndex = 0;
  return out;
}
