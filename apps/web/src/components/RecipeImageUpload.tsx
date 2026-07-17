"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Link, Loader2 } from "lucide-react";

interface RecipeImageUploadProps {
  recipeId: string;
  imageUrl?: string;
}

export function RecipeImageUpload({ recipeId, imageUrl }: RecipeImageUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);
  const [, startTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch(`/api/recipes/${recipeId}/image`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      setCacheBust((n) => n + 1);
      startTransition(() => router.refresh());
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Upload failed");
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUrlSave() {
    const url = urlInput.trim();
    if (!url) return;

    setSavingUrl(true);
    setError(null);

    const res = await fetch(`/api/recipes/${recipeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    });

    if (res.ok) {
      setUrlInput("");
      setCacheBust((n) => n + 1);
      startTransition(() => router.refresh());
    } else {
      setError("Failed to save image URL");
    }

    setSavingUrl(false);
  }

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
        <div className="group relative overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/recipes/${recipeId}/image${cacheBust ? `?v=${cacheBust}` : ""}`}
            alt="Recipe photo"
            className="h-64 w-full object-cover"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40"
          >
            <span className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Upload new photo"}
            </span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-card-border py-8 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {uploading ? "Uploading…" : "Upload photo"}
        </button>
      )}

      {/* URL input — always visible so external URLs can be pasted at any time */}
      <div className="mt-2 flex items-center gap-2">
        <Link className="h-3.5 w-3.5 shrink-0 text-muted" />
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSave()}
          placeholder={imageUrl ? "Paste a URL to replace photo" : "Or paste an image URL"}
          className="flex-1 rounded-lg border border-input-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleUrlSave}
          disabled={savingUrl || !urlInput.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {savingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
