/**
 * Gets a private `shift-images` object path from either the current raw path
 * representation or storage URLs persisted by older app versions.
 */
export function getShiftImageStoragePath(imageUrl: string): string | null {
  if (!imageUrl.startsWith('http')) return imageUrl;

  try {
    const pathname = new URL(imageUrl).pathname;
    const match = pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/shift-images\/(.+)$/,
    );
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** True only for values an authenticated account can reopen after this session. */
export function isPersistentShiftImageReference(value: string | null | undefined): value is string {
  const imageUrl = value?.trim();
  if (!imageUrl) return false;
  if (/^https?:\/\//i.test(imageUrl)) return true;
  // Local picker/camera references must never be treated as cloud records.
  if (/^[a-z][a-z0-9+.-]*:/i.test(imageUrl)) return false;
  return true; // private Storage object path, e.g. <user-id>/schedule.jpg
}
