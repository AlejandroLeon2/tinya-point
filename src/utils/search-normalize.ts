// Search query normalization (plan-speak-search.md — D6: one path for voice
// and keyboard). Lowercase, strip accents, drop filler punctuation/stopwords
// and collapse spaces. Also applied to the Fuse INDEX (per-key getFn) so
// "lactea" matches "Láctea". Naming per extras.md §7: code in English,
// domain/UI in Spanish — the stopwords themselves are Spanish domain data.

export const STOP_WORDS = [
  'quiero',
  'una',
  'un',
  'unos',
  'unas',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'por',
  'favor',
  'dame',
  'buscar',
  'busca',
];

const STOP_SET = new Set(STOP_WORDS);

export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word !== '' && !STOP_SET.has(word))
    .join(' ');
}
