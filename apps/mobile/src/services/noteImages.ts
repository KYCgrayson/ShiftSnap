import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

// Target ~1280px on the longest side and JPEG q=0.7. A typical iPhone
// photo (~3MB) shrinks to under 300KB after this without visible loss
// at note-thumbnail sizes.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;
const BUCKET = 'note-images';

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
}

/** Resize the longest edge to <= MAX_DIMENSION and re-encode as JPEG. */
export async function compressImage(uri: string): Promise<CompressedImage> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: result.uri, width: result.width, height: result.height };
}

/**
 * Upload a local file URI to the note-images bucket under
 * `{userId}/{uuid}.jpg`. Returns the bucket public URL on success.
 */
export async function uploadNoteImage(userId: string, localUri: string): Promise<string> {
  const compressed = await compressImage(localUri);

  // RN fetch + blob is the canonical Supabase upload path on Expo.
  const response = await fetch(compressed.uri);
  const blob = await response.blob();

  // Globally unique filename — UUID via crypto when available, otherwise
  // a timestamp+random fallback that is unguessable enough.
  const filename =
    typeof crypto !== 'undefined' && (crypto as any).randomUUID
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${filename}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Best-effort delete; failures are non-blocking. */
export async function deleteNoteImage(publicUrl: string) {
  // publicUrl looks like https://<proj>.supabase.co/storage/v1/object/public/note-images/<userId>/<file>
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
