import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { useCompanionGotchis } from "./useCompanionGotchis";
import { useCompanion } from "@/state/useCompanion";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { glowColor } from "@/lib/companion/glow";

export function CompanionMascot() {
  const reduce = useReducedMotion();
  const gotchis = useCompanionGotchis();
  const { selectedTokenId, isOpen, toggleOpen, ensureDefault } = useCompanion();

  useEffect(() => { ensureDefault(gotchis); }, [gotchis, ensureDefault]);

  const id = selectedTokenId ?? gotchis[0]?.id ?? null;
  const gotchi = gotchis.find((g) => g.id === id) ?? null;
  const glow = gotchi ? glowColor(gotchi) : "rgba(217,70,239,0.45)";

  return (
    <motion.button
      onClick={toggleOpen}
      aria-label="open gotchi companion"
      className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full border border-fuchsia-400/30
                 bg-[#160a23]/70 p-1 shadow-lg shadow-fuchsia-900/40 backdrop-blur"
      animate={reduce ? {} : { y: [0, -6, 0] }}
      transition={reduce ? {} : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
      whileTap={{ scale: 0.92 }}
      style={{ boxShadow: `0 0 24px 4px ${glow}` }}
    >
      {id
        ? <GotchiSvgById id={id} className="block h-full w-full overflow-hidden rounded-full [&>svg]:h-full [&>svg]:w-full" />
        : <span className="grid h-full w-full place-items-center text-2xl">👻</span>}
      {!isOpen && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-fuchsia-400 shadow" />}
    </motion.button>
  );
}
