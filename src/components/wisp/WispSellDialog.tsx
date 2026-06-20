import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useSendTransaction, useWriteContract, usePublicClient, useSignMessage } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  WISP_PLANS,
  FREE_PLAN,
  PERIODS,
  PER_SEAL_USD,
  priceUsd,
} from "@/lib/wisp/pricing";
import { createWispAccount, getWispQuote, buyWispPlan, manageWispAccount, rotateWispKey } from "@/lib/wisp/api";
import { wispManageMessage } from "@/lib/wisp/auth";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ERC20_TRANSFER = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const TOOLS = [
  ["get_persona", "Load a gotchi's soul into your model"],
  ["build_chat_context", "Ready chat turn → your model replies"],
  ["get_roast_setup", "Battle scaffold → your model roasts"],
  ["get_soul / verify_soul", "Depth, level, on-chain seal status"],
];

type PaidPlan = "pro" | "studio";

export function WispSellDialog({ onClose }: { onClose: () => void }) {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { signMessageAsync } = useSignMessage();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [plan, setPlan] = useState<PaidPlan>("pro");
  const [months, setMonths] = useState(1);
  const [asset, setAsset] = useState<"eth" | "usdc">("usdc");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeUntil, setActiveUntil] = useState<number | null>(null);

  async function ensureKey(): Promise<string> {
    if (apiKey) return apiKey;
    const { apiKey: k } = await createWispAccount(address);
    setApiKey(k);
    return k;
  }

  async function getFreeKey() {
    setBusy(true);
    setStatus(null);
    try {
      await ensureKey();
      setStatus("Free key created — copy it below 👇");
    } catch (e: any) {
      setStatus(e?.message || "could not create key");
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    if (!isConnected || !address) {
      setStatus("Connect your wallet first.");
      return;
    }
    setBusy(true);
    setStatus("getting quote…");
    try {
      const key = await ensureKey();
      const quote = await getWispQuote(plan, months, asset);
      setStatus(`confirm ${asset.toUpperCase()} payment in your wallet…`);
      let txHash: string;
      if (asset === "eth") {
        txHash = await sendTransactionAsync({
          chainId: BASE_CHAIN_ID,
          to: quote.receivingWallet,
          value: BigInt(quote.amountWei || "0"),
        });
      } else {
        txHash = await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: USDC_BASE,
          abi: ERC20_TRANSFER,
          functionName: "transfer",
          args: [quote.receivingWallet, BigInt(quote.amountUnits || "0")],
        });
      }
      setStatus("confirming on Base…");
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 });
      }
      setStatus("activating plan…");
      const r = await buyWispPlan({ apiKey: key, plan, months, asset, txHash, wallet: address });
      setActiveUntil(r.expiresAt);
      setStatus(`✓ ${r.plan.toUpperCase()} active`);
    } catch (e: any) {
      const raw = e?.shortMessage || e?.message || "purchase failed";
      setStatus(/rejected|denied/i.test(raw) ? "You cancelled the payment." : raw);
    } finally {
      setBusy(false);
    }
  }

  async function signManage(): Promise<{ wallet: string; signedAt: number; signature: string } | null> {
    if (!isConnected || !address) {
      setStatus("Connect your wallet first.");
      return null;
    }
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: wispManageMessage(address, signedAt) });
    return { wallet: address, signedAt, signature };
  }

  async function doManage() {
    setBusy(true);
    setStatus("sign to prove you own this wallet…");
    try {
      const sig = await signManage();
      if (!sig) return;
      const acct = await manageWispAccount(sig);
      setApiKey(acct.apiKey);
      setActiveUntil(acct.expiresAt || null);
      setStatus(`✓ ${acct.plan.toUpperCase()}${acct.expiresAt ? " · until " + new Date(acct.expiresAt).toLocaleDateString() : ""}`);
    } catch (e: any) {
      const raw = e?.shortMessage || e?.message || "could not load account";
      setStatus(/rejected|denied/i.test(raw) ? "Signature cancelled." : raw);
    } finally {
      setBusy(false);
    }
  }

  async function doRotate() {
    setBusy(true);
    setStatus("sign to rotate your key…");
    try {
      const sig = await signManage();
      if (!sig) return;
      const { apiKey: k } = await rotateWispKey(sig);
      setApiKey(k);
      setStatus("✓ key rotated — old key revoked, copy the new one below");
    } catch (e: any) {
      const raw = e?.shortMessage || e?.message || "rotate failed";
      setStatus(/rejected|denied/i.test(raw) ? "Signature cancelled." : raw);
    } finally {
      setBusy(false);
    }
  }

  const usd = priceUsd(plan, months);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#160a23] via-[#0d1426] to-[#0a1a1a] p-6 shadow-2xl shadow-violet-900/40"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/20 hover:text-white"
          >
            ✕ Close
          </button>

          {/* Hero */}
          <div className="pr-16">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/70">
              🔮 Wisp
            </div>
            <h2 className="mt-1 bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-2xl font-black text-transparent">
              Give any agent a gotchi's soul.
            </h2>
            <p className="mt-1.5 text-sm text-white/60">
              The soul, personality &amp; memory engine powering GotchiCloset's companion — as an
              <span className="text-white/80"> MCP you plug into your own project</span>. You bring the
              model; Wisp brings the soul. <span className="text-white/40">Zero LLM cost to you.</span>
            </p>
          </div>

          {/* What you get */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {TOOLS.map(([name, desc]) => (
              <div key={name} className="rounded-lg border border-white/8 bg-white/5 px-3 py-2">
                <div className="font-mono text-[11px] text-cyan-300">{name}</div>
                <div className="text-[10px] text-white/45">{desc}</div>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Pricing</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <PlanCard name={FREE_PLAN.name} price="$0" tagline={FREE_PLAN.tagline} features={FREE_PLAN.features} />
              {(["pro", "studio"] as PaidPlan[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`rounded-xl border p-3 text-left transition ${
                    plan === p ? "border-violet-400/60 bg-violet-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-bold text-white">{WISP_PLANS[p].name}</div>
                  <div className="text-lg font-black text-violet-200">${WISP_PLANS[p].usdPerMonth}<span className="text-[10px] font-normal text-white/40">/mo</span></div>
                  <div className="mt-0.5 text-[10px] text-white/45">{WISP_PLANS[p].tagline}</div>
                  <ul className="mt-1.5 space-y-0.5">
                    {WISP_PLANS[p].features.slice(0, 4).map((f) => (
                      <li key={f} className="text-[10px] text-white/55">· {f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-[10px] text-white/35">
              + Enterprise / white-label (contact) · per-seal ~${PER_SEAL_USD}. USD-denominated, paid in ETH/USDC on Base.
            </div>
          </div>

          {/* Checkout */}
          <div className="mt-5 rounded-xl border border-violet-500/25 bg-black/30 p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-white/50">Pay for</span>
              {PERIODS.map((p) => (
                <button
                  key={p.months}
                  onClick={() => setMonths(p.months)}
                  className={`rounded-md px-2 py-1 font-semibold ${months === p.months ? "bg-violet-500/30 text-violet-100" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
                >
                  {p.label}{p.discount ? ` (−${Math.round(p.discount * 100)}%)` : ""}
                </button>
              ))}
              <span className="ml-auto flex gap-1">
                {(["usdc", "eth"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAsset(a)}
                    className={`rounded-md px-2 py-1 font-semibold uppercase ${asset === a ? "bg-cyan-500/30 text-cyan-100" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
                  >
                    {a}
                  </button>
                ))}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-white/70">
                {WISP_PLANS[plan].name} · {months}mo —{" "}
                <span className="font-bold text-white">${usd}</span>{" "}
                <span className="text-[11px] text-white/40">in {asset.toUpperCase()}</span>
              </div>
              <button
                onClick={buy}
                disabled={busy}
                className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-50"
              >
                {busy ? "working…" : isConnected ? `Pay $${usd}` : "Connect wallet to pay"}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={getFreeKey}
                disabled={busy}
                className="text-[11px] text-white/50 underline underline-offset-2 hover:text-white/80 disabled:opacity-50"
              >
                get a free API key
              </button>
              <span className="text-white/15">·</span>
              <button
                onClick={doManage}
                disabled={busy}
                className="text-[11px] text-white/50 underline underline-offset-2 hover:text-white/80 disabled:opacity-50"
                title="Sign with your wallet to view & manage your account"
              >
                manage my account
              </button>
              {status && <span className="text-[11px] text-white/60">{status}</span>}
            </div>

            {apiKey && (
              <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/30 p-3">
                <div className="text-[10px] uppercase tracking-widest text-emerald-300/70">
                  Your Wisp API key {activeUntil ? `· paid until ${new Date(activeUntil).toLocaleDateString()}` : "· free tier"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-emerald-200">{apiKey}</code>
                  <button
                    onClick={() => navigator.clipboard?.writeText(apiKey)}
                    className="shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] text-white/70 hover:bg-white/20"
                  >
                    copy
                  </button>
                  <button
                    onClick={doRotate}
                    disabled={busy}
                    className="shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] text-white/70 hover:bg-white/20 disabled:opacity-50"
                    title="Sign with your wallet to revoke this key and issue a new one"
                  >
                    rotate
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-white/40">Save it now — it's shown once. Use it as the bearer token for the Wisp MCP.</div>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[10px] text-white/25">
            GotchiCloset is customer #1 of Wisp — this is the same engine, for your project.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  features,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-sm font-bold text-white">{name}</div>
      <div className="text-lg font-black text-white/80">{price}</div>
      <div className="mt-0.5 text-[10px] text-white/45">{tagline}</div>
      <ul className="mt-1.5 space-y-0.5">
        {features.slice(0, 4).map((f) => (
          <li key={f} className="text-[10px] text-white/55">· {f}</li>
        ))}
      </ul>
    </div>
  );
}
