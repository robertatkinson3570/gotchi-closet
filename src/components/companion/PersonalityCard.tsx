import type { PersonalityProfile } from "@/lib/companion/types";

export function PersonalityCard({ profile }: { profile: PersonalityProfile }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
      <div className="text-xs uppercase tracking-[2px] text-fuchsia-300/80">{profile.archetype}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {profile.traitLines.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px] text-white/80"
            title={t.reason}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
            <span className="text-white/40">· {t.reason}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
