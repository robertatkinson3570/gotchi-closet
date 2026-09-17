// Owner tool: pick the app developers who use Wisp for free (their players pay).
// Runs against the companion database on the box that serves the API.
//
//   npx tsx scripts/wisp-partner.ts list
//   npx tsx scripts/wisp-partner.ts add <wsp_ key or its wsp_xxxxxxxx tag> "Haunt Hollow, Grim's friend"
//   npx tsx scripts/wisp-partner.ts remove <wsp_ key or tag>
//
// Set COMPANION_DB_PATH when the database is not ./data/companion.db.

import { accountsByPrefix, listPartners, setPartner, type WispAccount } from "../server/mcp/accounts";
import { closeDb } from "../server/companion/db";

function show(a: WispAccount): string {
  const app = a.context?.appName ? ` ${a.context.appName}` : "";
  return `${a.apiKey.slice(0, 12)}${app}${a.partnerNote ? `  (${a.partnerNote})` : ""}`;
}

function one(prefix: string | undefined): WispAccount {
  const found = accountsByPrefix(String(prefix ?? "").trim());
  if (found.length === 0) throw new Error("no key starts with that; pass the wsp_ key or its first 12 characters");
  if (found.length > 1) throw new Error("more than one key starts with that; pass more of the key");
  return found[0]!;
}

try {
  const [cmd, target, ...noteParts] = process.argv.slice(2);
  if (cmd === "list") {
    const partners = listPartners();
    console.log(partners.length ? partners.map(show).join("\n") : "no partners yet");
  } else if (cmd === "add") {
    const a = setPartner(one(target).apiKey, true, noteParts.join(" ").trim() || undefined);
    console.log(`partner: ${show(a)}`);
  } else if (cmd === "remove") {
    const a = setPartner(one(target).apiKey, false);
    console.log(`no longer a partner: ${show(a)}`);
  } else {
    console.log("usage: wisp-partner.ts list | add <key or tag> [note] | remove <key or tag>");
    process.exitCode = 1;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  closeDb();
}
