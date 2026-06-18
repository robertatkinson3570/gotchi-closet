export type RoastArchetype =
  | "Gladiator"
  | "Dark Oracle"
  | "Zen"
  | "Galaxy Brain"
  | "Lucky Fool"
  | "Wildcard";

export interface RoastLine {
  side: "a" | "b";
  round: number;
  text: string;
}

export interface JudgeVerdict {
  winner: "a" | "b";
  aScore: number;
  bScore: number;
  verdict: string;
}

export interface RoastOutcome {
  result: "win" | "loss";
}
