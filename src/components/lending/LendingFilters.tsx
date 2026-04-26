import type { LendingFilters as Filters, DurationUnit } from "@/lib/lending/types";
import {
  ALL_BRS_BAND_LABELS,
  ALL_DURATION_LABELS,
} from "@/lib/lending/filters";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
};

const HAUNTS = ["1", "2", "3", "4"];

function ChipGroup({
  options,
  selected,
  onToggle,
  testIdPrefix,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (label: string) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt}` : undefined}
            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
              active
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-background/50 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function LendingFilters({ filters, onChange }: Props) {
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleArr = (key: "brsBands" | "durationBuckets" | "haunts", label: string) => {
    const cur = filters[key];
    update({
      [key]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label],
    } as any);
  };

  return (
    <div className="space-y-4 text-sm" data-testid="lending-filters-panel">
      <Section title="Haunt">
        <ChipGroup
          options={HAUNTS}
          selected={filters.haunts}
          onToggle={(l) => toggleArr("haunts", l)}
          testIdPrefix="filter-haunt"
        />
      </Section>

      <Section title="BRS w/ wearables">
        <ChipGroup
          options={ALL_BRS_BAND_LABELS}
          selected={filters.brsBands}
          onToggle={(l) => toggleArr("brsBands", l)}
        />
      </Section>

      <Section title="Duration bucket">
        <ChipGroup
          options={ALL_DURATION_LABELS}
          selected={filters.durationBuckets}
          onToggle={(l) => toggleArr("durationBuckets", l)}
        />
      </Section>

      <Section title="Duration is at least">
        <div className="flex items-center gap-1.5">
          <NumberInput
            value={filters.durationMinValue}
            placeholder="e.g. 7"
            onChange={(v) => update({ durationMinValue: v })}
            testid="filter-duration-min"
          />
          <UnitToggle
            unit={filters.durationMinUnit}
            onChange={(u) => update({ durationMinUnit: u })}
          />
        </div>
      </Section>

      <Section title="Upfront price (GHST)">
        <div className="flex items-center gap-1.5">
          <NumberInput
            value={filters.priceMin}
            placeholder="min"
            onChange={(v) => update({ priceMin: v })}
          />
          <span className="text-muted-foreground text-xs">to</span>
          <NumberInput
            value={filters.priceMax}
            placeholder="max"
            onChange={(v) => update({ priceMax: v })}
            testid="filter-price-max"
          />
        </div>
      </Section>

      <Section title="Whitelist">
        <div className="flex flex-wrap gap-1">
          {(
            [
              { value: "any", label: "any" },
              { value: "open", label: "open" },
              { value: "whitelisted", label: "whitelisted" },
              { value: "rentable_by_me", label: "rentable by me" },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => update({ whitelist: m.value })}
              className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                filters.whitelist === m.value
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-background/50 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Whitelist ID (exact)">
        <input
          type="text"
          inputMode="numeric"
          value={filters.whitelistId}
          onChange={(e) => update({ whitelistId: e.target.value.replace(/[^0-9]/g, "") })}
          placeholder="e.g. 1234"
          data-testid="filter-whitelist-id"
          className="w-full h-8 px-2 rounded border border-border/40 bg-background/50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </Section>

      <Section title="Channelling">
        <div className="flex flex-wrap gap-1">
          {(
            [
              { v: "any", label: "All" },
              { v: "yes", label: "Allowed" },
              { v: "no", label: "Disabled" },
            ] as const
          ).map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => update({ channelling: m.v })}
              data-testid={`filter-channelling-${m.v}`}
              className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                filters.channelling === m.v
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-background/50 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Min borrower split %">
        <NumberInput
          value={filters.borrowerSplitMin}
          placeholder="e.g. 70"
          onChange={(v) => update({ borrowerSplitMin: v })}
        />
      </Section>

      <Section title="Min kinship">
        <NumberInput
          value={filters.kinshipMin}
          placeholder="e.g. 50"
          onChange={(v) => update({ kinshipMin: v })}
          testid="filter-kinship-min"
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  placeholder,
  onChange,
  testid,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  testid?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testid}
      className="w-full h-8 px-2 rounded border border-border/40 bg-background/50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    />
  );
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: DurationUnit;
  onChange: (u: DurationUnit) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/40 bg-background/40 p-0.5 shrink-0">
      {(["days", "hours"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          data-testid={`filter-duration-unit-${u}`}
          className={`px-2 h-7 rounded text-[10px] font-medium transition-colors ${
            unit === u
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {u === "days" ? "days" : "hours"}
        </button>
      ))}
    </div>
  );
}
