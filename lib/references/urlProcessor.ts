import { chunkText } from "./chunker";

export async function processUrl(
  url: string
): Promise<{ title: string; chunks: string[] }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Ghost/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const html = await res.text();

  // Dynamically import JSDOM + Readability (server-only)
  const { JSDOM } = await import("jsdom");
  const { Readability } = await import("@mozilla/readability");

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article) throw new Error("Could not extract readable content from URL");

  const raw = (article.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: article.title?.slice(0, 120) ?? url,
    chunks: chunkText(raw),
  };
}
