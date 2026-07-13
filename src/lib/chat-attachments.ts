"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "chat-attachments";
const SIGN_TTL_SECONDS = 3600;
// Reuse signed URLs slightly shorter than their real lifetime
const CACHE_TTL_MS = 55 * 60 * 1000;

// Storage path from a stored public URL (uploads store the full public URL on the
// message row). Also accepts a bare path so the bucket can be flipped to private
// without a data migration.
export function attachmentPath(fileUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = fileUrl.indexOf(marker);
  if (i !== -1) {
    const raw = fileUrl.slice(i + marker.length);
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}

const signedUrlCache = new Map<string, { url: string; expires: number }>();

// Batch-resolves signed URLs for a message list's attachments: one storage round
// trip per conversation load, cached across drawer opens. Returns a map keyed by
// the original file_url; callers fall back to the original URL while resolving
// (which keeps working as long as the bucket is public).
export function useSignedAttachmentUrls(fileUrls: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = fileUrls.filter(Boolean).sort().join("|");

  useEffect(() => {
    const now = Date.now();
    const fromCache: Record<string, string> = {};
    const wanted = new Map<string, string>(); // path -> original url
    for (const u of key ? key.split("|") : []) {
      const path = attachmentPath(u);
      if (!path) continue;
      const cached = signedUrlCache.get(path);
      if (cached && cached.expires > now) fromCache[u] = cached.url;
      else wanted.set(path, u);
    }
    setUrls(fromCache);
    if (wanted.size === 0) return;

    let cancelled = false;
    const supabase = createClient();
    void supabase.storage
      .from(BUCKET)
      .createSignedUrls([...wanted.keys()], SIGN_TTL_SECONDS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const expires = Date.now() + CACHE_TTL_MS;
        const resolved: Record<string, string> = {};
        data.forEach((row) => {
          if (!row.signedUrl || !row.path) return;
          signedUrlCache.set(row.path, { url: row.signedUrl, expires });
          const original = wanted.get(row.path);
          if (original) resolved[original] = row.signedUrl;
        });
        setUrls((prev) => ({ ...prev, ...resolved }));
      });
    return () => { cancelled = true; };
  }, [key]);

  return urls;
}

const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];
const MAX_DIMENSION = 1600;
const SKIP_BELOW_BYTES = 300 * 1024;

// Downscale/re-encode large images client-side before upload; chat renders them
// small, so shipping multi-MB originals wastes upload and download time for
// everyone. GIFs (animation) and PDFs pass through untouched.
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < SKIP_BELOW_BYTES) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}
