import { createRequire } from "module";
import { chunkText } from "./chunker";

const require = createRequire(import.meta.url);

export async function processPdf(
  buffer: Buffer
): Promise<{ title: string; chunks: string[] }> {
  // pdf-parse v1: plain async function, works in Node.js without browser APIs
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);

  const raw = data.text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Use first non-empty line as title fallback
  const firstLine = raw.split(/\n/)[0]?.trim() ?? "Untitled PDF";
  const title = firstLine.slice(0, 120);

  return { title, chunks: chunkText(raw) };
}
