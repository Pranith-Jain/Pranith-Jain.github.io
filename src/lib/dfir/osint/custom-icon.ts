// src/lib/dfir/osint/custom-icon.ts
export const ICON_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ICON_MAX_BYTES = 256 * 1024; // 256KB, bounds localStorage growth

export type IconValidation = { ok: true } | { ok: false; error: string };

export function validateIconFile(file: File): IconValidation {
  if (file.type === 'image/svg+xml') {
    return { ok: false, error: 'SVG icons are not allowed. Use PNG, JPEG, or WebP.' };
  }
  if (!(ICON_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Unsupported file type. Use PNG, JPEG, or WebP.' };
  }
  if (file.size > ICON_MAX_BYTES) {
    return { ok: false, error: 'Icon must be 256KB or smaller.' };
  }
  return { ok: true };
}

/** Read a validated raster file as a data-URL. Caller MUST validateIconFile first. */
export function readIconAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read icon file.'));
    reader.readAsDataURL(file);
  });
}
