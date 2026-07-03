// src/components/games/SubmitGameDialog.tsx
import { useState } from "react";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import { CATEGORIES, type Category } from "@/lib/games/types";
import { submitMessage } from "@/lib/games/auth";
import { downscaleImageFile } from "@/lib/games/image";
import { submitGame, editGame } from "@/lib/games/api";
import { AAVEGOTCHI_DIAMOND } from "@/lib/games/constants";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { useToast } from "@/ui/use-toast";

const erc721Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** When present, the dialog edits an existing entry instead of creating a new one. */
export interface EditTarget {
  id: number;
  title: string;
  description: string;
  url: string;
  category: Category;
  currentImageUrl?: string;
}

export function SubmitGameDialog({ onClose, onSubmitted, editing }: { onClose: () => void; onSubmitted: () => void; editing?: EditTarget }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [category, setCategory] = useState<Category>(editing?.category ?? "Games");
  const [image, setImage] = useState<{ base64: string; mime: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: balance } = useReadContract({
    address: AAVEGOTCHI_DIAMOND, abi: erc721Abi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const ownsGotchi = typeof balance === "bigint" && balance > 0n;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await downscaleImageFile(file);
      setImage(img);
      setPreview(`data:${img.mime};base64,${img.base64}`);
    } catch {
      toast({ title: "Couldn't read that image", variant: "destructive" });
    }
  }

  async function submit() {
    if (!address) return;
    if (!editing && !image) return; // new submissions require an image
    setBusy(true);
    try {
      const signedAt = Date.now();
      const signature = await signMessageAsync({ message: submitMessage(address, signedAt) });
      if (editing) {
        await editGame(editing.id, {
          title, description, url, category, wallet: address, signature, signedAt,
          ...(image ? { imageBase64: image.base64, imageMime: image.mime } : {}),
        });
        toast({ title: "Resubmitted!", description: "Your edit is awaiting review." });
      } else {
        await submitGame({ title, description, url, category, imageBase64: image!.base64, imageMime: image!.mime, wallet: address, signature, signedAt });
        toast({ title: "Submitted!", description: "Your entry is awaiting review." });
      }
      onSubmitted();
      onClose();
    } catch (err) {
      toast({ title: editing ? "Edit failed" : "Submission failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const imageReady = !!image || !!editing; // edit keeps existing image if none chosen
  const canSubmit = isConnected && ownsGotchi && imageReady && !!title.trim() && !!description.trim() && !!url.trim() && !busy;
  const shownImage = preview ?? editing?.currentImageUrl ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{editing ? "Edit submission" : "Submit to the Game Center"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {editing
            ? "Saving resubmits your entry for review. Leave the image empty to keep the current one."
            : "You must own at least one Aavegotchi. Entries are reviewed before going live."}
        </p>

        {!isConnected && <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">Connect your wallet to submit.</p>}
        {isConnected && !ownsGotchi && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">You need at least one Aavegotchi to submit.</p>}

        <div className="mt-4 space-y-3">
          <Input placeholder="Title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Short description" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} />
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
          {shownImage && <img src={shownImage} alt="preview" className="rounded-lg max-h-40 object-contain" />}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={submit}>{busy ? "Saving…" : editing ? "Resubmit" : "Submit"}</Button>
        </div>
      </div>
    </div>
  );
}
