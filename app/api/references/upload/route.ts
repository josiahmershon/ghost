import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { processPdf } from "@/lib/references/pdfProcessor";
import { processUrl } from "@/lib/references/urlProcessor";
import { embedBatch } from "@/lib/references/embeddings";

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const contentType = req.headers.get("content-type") ?? "";

  let documentId: string;
  let sourceType: "pdf" | "url";
  let title: string;
  let originalUrl: string | null = null;
  let rawText: string;
  let chunks: string[];

  try {
    if (contentType.includes("multipart/form-data")) {
      // PDF upload
      const form = await req.formData();
      const file = form.get("file") as File | null;
      documentId = form.get("documentId") as string;

      if (!file || !documentId) {
        return NextResponse.json({ error: "Missing file or documentId" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await processPdf(buffer);
      title = result.title;
      chunks = result.chunks;
      rawText = chunks.join("\n\n");
      sourceType = "pdf";
    } else {
      // URL import
      const body = await req.json();
      documentId = body.documentId;
      const url = body.url as string;

      if (!url || !documentId) {
        return NextResponse.json({ error: "Missing url or documentId" }, { status: 400 });
      }

      originalUrl = url;
      const result = await processUrl(url);
      title = result.title;
      chunks = result.chunks;
      rawText = chunks.join("\n\n");
      sourceType = "url";
    }

    // Insert reference record
    const { data: ref, error: refError } = await supabase
      .from("doc_references")
      .insert({ document_id: documentId, source_type: sourceType, title, original_url: originalUrl, raw_text: rawText })
      .select("id")
      .single();

    if (refError || !ref) {
      console.error("[upload] ref insert error:", refError);
      return NextResponse.json({ error: "Failed to save reference" }, { status: 500 });
    }

    // Embed chunks and insert
    const embeddings = await embedBatch(chunks);
    const rows = chunks.map((chunk, i) => ({
      reference_id: ref.id,
      chunk_text: chunk,
      chunk_index: i,
      embedding: JSON.stringify(embeddings[i]),
    }));

    const { error: chunkError } = await supabase
      .from("reference_chunks")
      .insert(rows);

    if (chunkError) {
      console.error("[upload] chunk insert error:", chunkError);
    }

    return NextResponse.json({
      id: ref.id,
      title,
      source_type: sourceType,
      original_url: originalUrl,
      chunk_count: chunks.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[upload]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
