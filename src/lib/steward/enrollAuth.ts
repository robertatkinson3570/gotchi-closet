// src/lib/steward/enrollAuth.ts
// The exact message the owner signs to authorize a Steward enrollment, shared by the client
// (signs it in the wizard) and the server (verifies it). Binds the enrollment to the owner,
// the steward gotchi, the chosen chores, the smart account, and a timestamp so a captured
// signature can't be replayed for different terms or indefinitely.
import type { ChoresLike } from "./sessionSpec";

export function enrollMessage(p: {
  owner: string;
  gotchiId: number;
  chores: ChoresLike;
  smartAccount: string;
  signedAt: number;
}): string {
  const chores = `${p.chores.pet ? 1 : 0}${p.chores.channel ? 1 : 0}${p.chores.claim ? 1 : 0}`;
  return [
    "GotchiCloset Steward — authorize enrollment",
    `owner: ${p.owner.toLowerCase()}`,
    `gotchi: ${p.gotchiId}`,
    `chores: ${chores}`,
    `account: ${p.smartAccount.toLowerCase()}`,
    `at: ${p.signedAt}`,
  ].join("\n");
}

export const ENROLL_SIG_TTL_MS = 15 * 60 * 1000;

// The message the owner signs to authorize a management action (pause/resume/revoke/
// edit-chores/run-now) on an existing enrollment. Same client/server sharing as
// enrollMessage. Binds the action + enrollment id + owner + timestamp — and for
// edit-chores the new chore set — so a captured signature can't be replayed for a
// different action, enrollment, or terms.
export type StewardAction = "pause" | "resume" | "revoke" | "edit-chores" | "run-now";

export function mutateMessage(p: {
  action: StewardAction;
  id: number;
  owner: string;
  signedAt: number;
  chores?: ChoresLike;
}): string {
  const lines = [
    "GotchiCloset Steward — authorize action",
    `action: ${p.action}`,
    `enrollment: ${p.id}`,
    `owner: ${p.owner.toLowerCase()}`,
    `at: ${p.signedAt}`,
  ];
  if (p.chores) lines.push(`chores: ${p.chores.pet ? 1 : 0}${p.chores.channel ? 1 : 0}${p.chores.claim ? 1 : 0}`);
  return lines.join("\n");
}
