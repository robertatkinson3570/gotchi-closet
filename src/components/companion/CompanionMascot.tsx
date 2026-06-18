import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { useAppStore } from "@/state/useAppStore";
import { useCompanion } from "@/state/useCompanion";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

export function CompanionMascot() {
  const reduce = useReducedMotion();
  const gotchis = useAppStore((s) => s.gotchis);
  const { selectedTokenId, isOpen, toggleOpen, ensureDefault } = useCompanion();

  useEffect(() => { ensureDefault(gotchis); }, [gotchis, ensureDefault]);

  const id = selectedTokenId ?? gotchis[0]?.id ?? null;

  return (
    <motion.button
      onClick={toggleOpen}
      aria-label="open gotchi companion"
      className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full border border-fuchsia-400/30
                 bg-[#160a23]/70 p-1 shadow-lg shadow-fuchsia-900/40 backdrop-blur"
      animate={reduce ? {} : { y: [0, -6, 0] }}
      transition={reduce ? {} : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
      whileTap={{ scale: 0.92 }}
    >
      {id
        ? <GotchiSvgById id={id} className="block h-full w-full" />
        : <span className="grid h-full w-full place-items-center text-2xl">👻</span>}
      {!isOpen && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-fuchsia-400 shadow" />}
    </motion.button>
  );
}
