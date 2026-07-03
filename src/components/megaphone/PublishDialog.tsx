// src/components/megaphone/PublishDialog.tsx
// Admin-only: pick a locally-rendered MP4, auto-extract a poster frame + duration in the
// browser, sign the admin message, and publish it to the Megaphone. The render pipeline
// lives in video/ (Remotion); this is the "drop the finished clip in" step.
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Loader2, UploadCloud } from "lucide-react";
import { TEMPLATES, type Template } from "@/lib/megaphone/types";
import { adminMessage } from "@/lib/megaphone/auth";
import { pinPulse, publishVideo } from "@/lib/megaphone/api";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { useToast } from "@/ui/use-toast";

interface Loaded {
  name: string;
  sizeMb: number;
  mp4Base64: string;
  posterBase64: string | null;
  durationS: number;
  previewUrl: string;
}

/** Read the MP4 as base64 and grab a mid-clip frame as the poster (JPEG). */
function loadVideoFile(file: File): Promise<Loaded> {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = previewUrl;

    const readBase64 = () =>
      new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => rej(new Error("could not read file"));
        reader.readAsDataURL(file);
      });

    video.onloadedmetadata = () => {
      const durationS = video.duration || 0;
      // Seek ~40% in for a representative frame.
      video.currentTime = Math.min(durationS * 0.4, Math.max(durationS - 0.1, 0));
    };
    video.onseeked = async () => {
      let posterBase64: string | null = null;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        posterBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1] ?? null;
      } catch {
        posterBase64 = null; // tainted canvas / decode issue — poster is optional
      }
      try {
        const mp4Base64 = await readBase64();
        resolve({
          name: file.name,
          sizeMb: file.size / (1024 * 1024),
          mp4Base64,
          posterBase64,
          durationS: video.duration || 0,
          previewUrl,
        });
      } catch (e) {
        reject(e);
      }
    };
    video.onerror = () => reject(new Error("could not decode video"));
  });
}

function guessTemplate(name: string): Template {
  const n = name.toLowerCase();
  if (n.includes("pulse")) return "PulseRecap";
  if (n.includes("fit")) return "FitReveal";
  if (n.includes("sale")) return "SaleAlert";
  if (n.includes("spotlight")) return "Spotlight";
  return "Other";
}

export function PublishDialog({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reading, setReading] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [template, setTemplate] = useState<Template>("Other");
  const [gotchiId, setGotchiId] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("mp4") && !file.name.toLowerCase().endsWith(".mp4")) {
      toast({ title: "Please choose an MP4", variant: "destructive" });
      return;
    }
    setReading(true);
    try {
      const l = await loadVideoFile(file);
      setLoaded(l);
      if (!title) setTitle(file.name.replace(/\.mp4$/i, "").replace(/[-_]/g, " "));
      setTemplate(guessTemplate(file.name));
    } catch (err) {
      toast({ title: "Couldn't read that video", description: (err as Error).message, variant: "destructive" });
    } finally {
      setReading(false);
    }
  }

  async function publish() {
    if (!address || !loaded) return;
    setBusy(true);
    try {
      const signedAt = Date.now();
      const signature = await signMessageAsync({ message: adminMessage(address, signedAt) });
      const video = await publishVideo({
        title: title.trim() || loaded.name,
        caption,
        template,
        mp4Base64: loaded.mp4Base64,
        posterBase64: loaded.posterBase64 ?? undefined,
        durationS: Math.round(loaded.durationS),
        gotchiId: gotchiId.trim() || undefined,
        wallet: address,
        signature,
        signedAt,
      });
      if (pin) await pinPulse(video.id, { wallet: address, signature, signedAt });
      toast({ title: "Published!", description: pin ? "Live on Megaphone and pinned to Pulse." : "Live on Megaphone." });
      onPublished();
      onClose();
    } catch (err) {
      toast({ title: "Publish failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const canPublish = isConnected && !!loaded && !!title.trim() && !busy && loaded.sizeMb <= 40;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-background shadow-[0_0_60px_-12px_hsl(var(--spectral)/0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-white/10 p-5">
          <div className="absolute -top-16 right-0 h-32 w-32 rounded-full bg-[hsl(var(--ghst-pink))]/20 blur-3xl" />
          <h2 className="relative bg-gradient-to-r from-[hsl(var(--spectral))] via-[hsl(var(--ghst-pink))] to-[hsl(var(--cyan))] bg-clip-text text-lg font-bold text-transparent">
            Publish a video
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Rendered with the video engine (video/). Drop the MP4 here and a poster frame is grabbed automatically.
          </p>
        </div>

        <div className="space-y-3 p-5">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center transition-colors hover:border-[hsl(var(--spectral))]/50">
            {reading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-6 w-6 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">
              {loaded ? `${loaded.name} · ${loaded.sizeMb.toFixed(1)}MB · ${Math.round(loaded.durationS)}s` : "Choose an MP4 (max 40MB)"}
            </span>
            <input type="file" accept="video/mp4,.mp4" className="hidden" onChange={onFile} />
          </label>

          {loaded && loaded.sizeMb > 40 && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
              That file is {loaded.sizeMb.toFixed(1)}MB. Re-render smaller (or trim), the cap is 40MB.
            </p>
          )}

          <Input placeholder="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            placeholder="Caption (posted with the video on X / Discord / YouTube)"
            value={caption}
            maxLength={600}
            onChange={(e) => setCaption(e.target.value)}
            className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={template}
              onChange={(e) => setTemplate(e.target.value as Template)}
            >
              {TEMPLATES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input placeholder="Gotchi # (optional)" value={gotchiId} onChange={(e) => setGotchiId(e.target.value)} className="w-40" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="accent-[hsl(var(--spectral))]" />
            Pin to the <span className="font-semibold text-foreground">/pulse</span> hero (replaces the current one)
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 p-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canPublish} onClick={publish}>{busy ? "Publishing…" : "Publish"}</Button>
        </div>
      </div>
    </div>
  );
}
