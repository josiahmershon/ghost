const CHUNK_SIZE = 400;   // words per chunk
const CHUNK_OVERLAP = 50; // words of overlap between chunks

export function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let i = 0;

  while (i < words.length) {
    const slice = words.slice(i, i + CHUNK_SIZE);
    chunks.push(slice.join(" "));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks.filter((c) => c.trim().length > 20);
}
