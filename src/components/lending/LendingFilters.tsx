import type { LendingFilters as Filters } from "@/lib/lending/types";
import {
  ALL_BRS_BAND_LABELS,
  ALL_DURATION_LABELS,
} from "@/lib/lending/filters";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
};

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (label: string) => void;
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
  const toggle = (key: "brsBands" | "durationBuckets", label: string) => {
    const cur = filters[key];
    update({
      [key]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label],
    } as any);
  };

  return (
    <div className="space-y-4 text-sm">
      <Section title="BRS w/ wearables">
        <ChipGroup
          options={ALL_BRS_BAND_LABELS}
          selected={filters.brsBands}
          onToggle={(l) => toggle("brsBands", l)}
        />
      </Section>

      <Section title="Duration">
        <ChipGroup
          options={ALL_DURATION_LABELS}
          selected={filters.durationBuckets}
          onToggle={(l) => toggle("durationBuckets", l)}
        />
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

      <Section title="Channelling">
        <div className="flex flex-wrap gap-1">
          {(["any", "yes", "no"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update({ channelling: m })}
              className={`px-2 py-1 rounded text-[11px] border transition-colors capitalize ${
                filters.channelling === m
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-background/50 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {m}
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
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-8 px-2 rounded border border-border/40 bg-background/50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    />
  );
}
