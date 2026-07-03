import { describe, expect, it } from "vitest";
import { addDays, type PulsePoint } from "./aggregate";
import { VERDICT_DEFS, evaluateVerdicts } from "./verdicts";

/** n days of flow data ending the day before endDay, split half old-rate, half new-rate. */
function flowSeries(endDay: string, n: number, oldRate: number, newRate: number): PulsePoint[] {
  const out: PulsePoint[] = [];
  for (let i = n; i >= 1; i--) {
    out.push({ day: addDays(endDay, -i), value: i > n / 2 ? oldRate : newRate });
  }
  return out;
}

const END = "2026-07-02";

describe("evaluateVerdicts", () => {
  it("returns one result per definition, accruing on empty data", () => {
    const res = evaluateVerdicts({}, END);
    expect(res.length).toBe(VERDICT_DEFS.length);
    for (const r of res) expect(r.verdict).toBe("accruing");
  });

  it("flags steady volume green and collapsed volume red", () => {
    const steady = evaluateVerdicts({ sales_volume_ghst: flowSeries(END, 60, 100, 100) }, END);
    expect(steady.find((r) => r.key === "sales-volume")?.verdict).toBe("green");
    const collapsed = evaluateVerdicts({ sales_volume_ghst: flowSeries(END, 60, 100, 50) }, END);
    expect(collapsed.find((r) => r.key === "sales-volume")?.verdict).toBe("red");
  });

  it("grades a mild dip yellow", () => {
    const mild = evaluateVerdicts({ sales_volume_ghst: flowSeries(END, 60, 100, 90) }, END);
    expect(mild.find((r) => r.key === "sales-volume")?.verdict).toBe("yellow");
  });

  it("grades price on 90d level change", () => {
    const up: PulsePoint[] = [
      { day: addDays(END, -91), value: 0.4 },
      { day: END, value: 0.5 },
    ];
    const res = evaluateVerdicts({ ghst_price_usd: up }, END);
    expect(res.find((r) => r.key === "ghst-price")?.verdict).toBe("green");
  });

  it("every definition carries ruleText and a lever", () => {
    for (const d of VERDICT_DEFS) {
      expect(d.ruleText.length).toBeGreaterThan(10);
      expect(d.lever.length).toBeGreaterThan(10);
    }
  });
});
