"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Link as LinkIcon, Loader2, Upload } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { tryApi } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface RecipeImageUploadProps {
  recipeId: string;
  imageUrl?: string;
}

export function RecipeImageUpload({ recipeId, imageUrl }: RecipeImageUploadProps) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const [, startTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    const res = await tryApi(`/api/recipes/${recipeId}/image`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      setCacheBust((n) => n + 1);
      setExpanded(false);
      toast("Photo updated", "success");
      startTransition(() => router.refresh());
    } else {
      toast(res.error.message || "Upload failed", "error");
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUrlSave() {
    const url = urlInput.trim();
    if (!url) return;

    setSavingUrl(true);
    const res = await tryApi(`/api/recipes/${recipeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    });

    if (res.ok) {
      setUrlInput("");
      setCacheBust((n) => n + 1);
      setExpanded(false);
      toast("Photo updated", "success");
      startTransition(() => router.refresh());
    } else {
      toast(res.error.message || "Failed to save image URL", "error");
    }

    setSavingUrl(false);
  }

  const controls = (
    <div className="mt-2 space-y-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        loading={uploading}
      >
        {!uploading && <Upload className="h-4 w-4" />}
        Upload from device
      </Button>
      <div className="flex items-center gap-2">
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
        <Input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSave()}
          placeholder="Or paste an image URL"
          className="flex-1"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleUrlSave}
          loading={savingUrl}
          disabled={!urlInput.trim()}
        >
          Use
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mb-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {imageUrl ? (
        <div>
          <div className="relative overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/recipes/${recipeId}/image${cacheBust ? `?v=${cacheBust}` : ""}`}
              alt="Recipe photo"
              className="h-64 w-full object-cover"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm"
            >
              <Camera className="h-3.5 w-3.5" /> Change photo
            </Button>
          </div>
          {expanded && controls}
        </div>
      ) : expanded ? (
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-card-border py-8 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Drop or choose a photo"}
          </button>
          <div className="flex items-center gap-2 pt-2">
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
            <Input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSave()}
              placeholder="Or paste an image URL"
              className="flex-1"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleUrlSave}
              loading={savingUrl}
              disabled={!urlInput.trim()}
            >
              Use
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
          <Camera className="h-4 w-4" /> Add photo
        </Button>
      )}
    </div>
  );
}
