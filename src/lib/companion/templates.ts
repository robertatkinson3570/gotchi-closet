import type { PersonalityProfile } from "./types";

// Pick deterministically from a pool using the message length as a seed (no
// Math.random — keeps tests stable and avoids the harness Date/random ban).
function pick(pool: string[], seed: number): string {
  return pool[seed % pool.length];
}

export function templateReply(args: {
  profile: PersonalityProfile;
  message: string;
  deflected: boolean;
}): string {
  const { profile, message, deflected } = args;
  const eerie = profile.toneWords.includes("eerie");
  const seed = message.length;

  if (deflected) {
    return pick(
      ["ooOOoo, such language for a spirit to hear 👻", "mind your language, mortal… the spirits are listening 🔮", "spicy words! save them for the Baazaar 😼 (language like that offends the spirit world)"],
      seed
    );
  }
  const m = message.toLowerCase();
  if (/\b(hi|hey|hello|gm|sup)\b/.test(m)) {
    return pick(
      eerie
        ? ["the veil parts… you return. what do you seek? 🔮", "I felt you coming. speak, owner."]
        : ["heeey! 👻 missed you!", "boo! ...did I get you? hi!"],
      seed
    );
  }
  if (/\b(pet|kinship|love)\b/.test(m)) {
    return pick(["pet me and our kinship grows 💞 it's been a while…", "a little pet every 12 hours keeps our bond strong 👻"], seed);
  }
  return pick(
    eerie
      ? ["the spirits are quiet right now… ask me again soon 🔮", "my oracle-sight is hazy (the AI ether is busy). try once more 👻"]
      : ["my ghostly brain is buffering 👻 ask me again in a moment!", "the ether's busy! poke me again soon, fren 💜"],
    seed
  );
}
