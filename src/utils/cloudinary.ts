// Pure string helper for catalog image URLs (doc/extras.md §4,
// plan-features Fase 6):
//   - absolute res.cloudinary.com URLs of OUR cloud get the automatic URL
//     optimization f_auto,q_auto,w_<width> — never request an image bigger
//     than the card needs (extras.md §4)
//   - a relative path / public id of the cloud declared in
//     PUBLIC_CLOUDINARY_CLOUD_NAME is built into an absolute optimized URL
//     (empty cloud name or unresolvable value → '' so the caller keeps its
//     placeholder instead of a broken image)
//   - absolute URLs of another cloud or of any other host pass through
//     untouched
// Pure strings: NO fetch, NO api/ imports (astrobase §1, Fase 6 gate).

const CLOUD_NAME: string = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const DEFAULT_WIDTH = 400;
const CLOUDINARY_HOST = /^https?:\/\/res\.cloudinary\.com\//i;
const CLOUD_SEGMENT = /^https?:\/\/res\.cloudinary\.com\/([^/]+)\//i;
const ABSOLUTE_URL = /^https?:\/\//i;
const UPLOAD_MARKER = '/upload/';

function withTransforms(url: string, width: number): string {
  // Idempotent: an already-optimized URL keeps its own transform string.
  if (url.includes('q_auto') || url.includes('f_auto')) return url;
  const at = url.indexOf(UPLOAD_MARKER);
  // No /upload/ segment → cannot inject safely, serve as-is.
  if (at === -1) return url;
  const insert = `f_auto,q_auto,w_${width}/`;
  const head = at + UPLOAD_MARKER.length;
  return url.slice(0, head) + insert + url.slice(head);
}

/**
 * Resolves a Sheet `imagen_url` value into the final `<img>` src.
 * Pure string transform — see header. Returns '' when nothing can be
 * resolved (caller renders/keeps its placeholder).
 */
export function resolveImageUrl(raw?: string | null, width = DEFAULT_WIDTH): string {
  const value = raw?.trim();
  if (!value) return '';

  const w = Number.isFinite(width) && width > 0 ? Math.round(width) : DEFAULT_WIDTH;

  // Scheme-relative URLs (//res.cloudinary.com/…) → absolute https.
  const candidate = value.startsWith('//') ? `https:${value}` : value;

  if (CLOUDINARY_HOST.test(candidate)) {
    // Declared cloud known and this URL belongs to ANOTHER cloud → as-is.
    const seg = candidate.match(CLOUD_SEGMENT)?.[1] ?? '';
    if (CLOUD_NAME && seg && seg !== CLOUD_NAME) return candidate;
    return withTransforms(candidate, w);
  }

  // Absolute URL of any other host/provider → as-is.
  if (ABSOLUTE_URL.test(candidate)) return candidate;

  // Relative path / public id of the declared cloud → build absolute.
  if (!CLOUD_NAME) return '';
  const rel = candidate.replace(/^\/+/, '');
  const path = rel.startsWith('image/upload/')
    ? rel
    : `image/upload/${rel}`;
  return withTransforms(`https://res.cloudinary.com/${CLOUD_NAME}/${path}`, w);
}
