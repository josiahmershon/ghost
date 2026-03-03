const EMBEDDING_MODEL = "models/gemini-embedding-001";
const OUTPUT_DIM = 768;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        content: { parts: [{ text }] },
        outputDimensionality: OUTPUT_DIM,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${err}`);
  }

  const data = await res.json();
  return data.embedding.values as number[];
}

// Batch embed with a small delay to avoid rate limits
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text));
    // Small pause to stay within rate limits
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}
