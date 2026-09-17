import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The panel's data fetch and wallet hooks are not under test here; the pure
// report view is (QA 06-T6: this file did not exist).
vi.mock("wagmi", () => ({ useAccount: () => ({ address: "0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2" }), useSignMessage: () => ({ signMessageAsync: async () => "0x" }), useWalletClient: () => ({ data: undefined }) }));

import { KeeperPanel, KeeperReportView, type KeeperReport } from "./KeeperPanel";
import { ANALYST_DISCLAIMERS } from "@/lib/companion/api";

const OWNER = "0xe0d4f8f6f04a42aed5a7ea4f68bc612e6a54a3c2";
const fixture: KeeperReport = {
  wallet: OWNER, tokenId: "3560", asOfBlock: "51376268", voiced: false, at: 1_789_000_000_000,
  text: "The Watch: 1 approval looks risky. The Scribe: 200 new transactions labelled.",
  report: {
    lines: [
      { key: "permissions", severity: "act", text: "The Watch: 1 approval looks risky.", facts: [{ key: "risky_count", label: "Risky approvals", value: "1" }, { key: "spender", label: "Spender", value: "0xabc...def (unlabelled)" }], cites: [{ queryId: "3d940cfffa2f", asOfBlock: "51376268", chains: [8453] }] },
      { key: "transactions", severity: "note", text: "The Scribe: 200 new transactions labelled.", facts: [], cites: [] },
      { key: "exchanges", severity: "quiet", text: "", facts: [], cites: [] },
    ],
  },
  actions: [
    { key: "revoke:0xabc:0xdef", label: "Revoke USDC for 0xabc", call: { to: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", data: "0x095ea7b3", label: "Revoke USDC for 0xabc" } },
    { key: "revoke:0x7702", label: "Revoke delegation", call: null, note: "an EIP-7702 delegation has no safe prepared action yet" },
  ],
};

function render(over: Partial<Parameters<typeof KeeperReportView>[0]> = {}) {
  return renderToStaticMarkup(<KeeperReportView report={fixture} whyOpen={new Set()} busyAction={null} onToggleWhy={() => {}} onRunAction={() => {}} {...over} />);
}

describe("KeeperReportView", () => {
  it("renders one row per line with text, a severity chip per row, and skips lines with no text", () => {
    const html = render();
    expect(html.split("The Watch: 1 approval looks risky. The Scribe: 200 new transactions labelled.")).toHaveLength(2); // the summary text once
    expect(html).toContain("The Watch: 1 approval looks risky.");
    expect(html).toContain("The Scribe: 200 new transactions labelled.");
    expect(html.match(/uppercase[^>]*>(act|note|quiet)</g)).toEqual(["uppercase bg-amber-500/20 text-amber-200\">act<", "uppercase bg-sky-500/20 text-sky-200\">note<"]);
    expect(html).not.toContain("exchanges");
  });

  it("renders a button for a prepared revoke and a plain note for an action with no call, on the permissions row only", () => {
    const html = render();
    expect(html.match(/<button[^>]*>Revoke USDC for 0xabc<\/button>/)).toHaveLength(1);
    expect(html).toContain("an EIP-7702 delegation has no safe prepared action yet");
    expect(html.match(/<button/g)).toHaveLength(2); // the revoke button and the one Why? toggle
    expect(render({ busyAction: "revoke:0xabc:0xdef" })).toContain("Confirm in wallet");
  });

  it("the Why toggle opens the facts and the cite with its block link", () => {
    const closed = render();
    expect(closed).not.toContain("Risky approvals");
    const open = render({ whyOpen: new Set(["permissions"]) });
    expect(open).toContain("<b>Risky approvals</b>: 1");
    expect(open).toContain("query 3d940cfffa2f");
    expect(open).toContain('href="https://basescan.org/block/51376268"');
  });

  it("H-01, OWNER-21: the panel renders the four legal lines from 00-overview section 8 once at the bottom, verbatim from the Ask mode constant", () => {
    // A server render runs no effects, so this is the panel before its first read: the not-yet line plus the legal block.
    const html = renderToStaticMarkup(<KeeperPanel tokenId="3560" />);
    expect(ANALYST_DISCLAIMERS).toHaveLength(4);
    for (const line of ANALYST_DISCLAIMERS) expect(html.split(line)).toHaveLength(2);
    const at = ANALYST_DISCLAIMERS.map((line) => html.indexOf(line));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(html.indexOf("watched a full night yet")).toBeLessThan(at[0]!);
    expect(html).not.toContain("\u2014");
  });
});
