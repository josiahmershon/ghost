import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/references/embeddings";

export async function POST(req: NextRequest) {
  const { documentId, queryText, topK = 3 } = await req.json();

  if (!documentId || !queryText) {
    return NextResponse.json({ chunks: [] });
  }

  try {
    const embedding = await embedText(queryText);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("match_reference_chunks", {
      p_document_id: documentId,
      p_embedding: JSON.stringify(embedding),
      p_top_k: topK,
    });

    if (error) {
      console.error("[query]", error);
      return NextResponse.json({ chunks: [] });
    }

    return NextResponse.json({ chunks: (data ?? []).map((r: { chunk_text: string }) => r.chunk_text) });
  } catch (err) {
    console.error("[query]", err);
    return NextResponse.json({ chunks: [] });
  }
}
