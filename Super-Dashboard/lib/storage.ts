import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = "publisher ads";

export interface UploadResult {
  publicUrl: string;
  filePath: string;
  mediaType: "image" | "video";
  mimeType: string;
  duration: null;
  size: number;
}

export async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  size: number,
): Promise<UploadResult> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `ad-creatives/${timestamp}_${random}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

  const mediaType = mimeType.startsWith("video") ? "video" : "image";

  return {
    publicUrl: data.publicUrl,
    filePath,
    mediaType,
    mimeType,
    duration: null,
    size,
  };
}

export async function deleteFromStorage(filePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (error) console.error("[Storage] Delete failed:", error.message);
}
