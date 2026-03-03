"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDocumentStore, Document } from "@/stores/documentStore";

interface Props {
  currentDocId: string;
}

export default function DocumentList({ currentDocId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { documents, setDocuments, addDocument } = useDocumentStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("documents")
        .select("id, title, document_type, word_count, updated_at, created_at")
        .order("updated_at", { ascending: false });
      if (data) setDocuments(data as Document[]);
      setLoading(false);
    }
    load();
  }, []);

  async function createDoc() {
    const { data, error } = await supabase
      .from("documents")
      .insert({ title: "Untitled", content: {} })
      .select()
      .single();
    if (!error && data) {
      addDocument(data as Document);
      router.push(`/editor/${data.id}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-xs font-medium tracking-wider uppercase text-[var(--text-muted)]">
          Documents
        </span>
        <button
          onClick={createDoc}
          className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none transition-colors"
          title="New document"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="px-4 py-3 text-sm text-[var(--text-muted)]">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--text-muted)]">
            No documents yet.
          </p>
        ) : (
          documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => router.push(`/editor/${doc.id}`)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                doc.id === currentDocId
                  ? "text-[var(--text)] bg-white/5"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <div className="truncate">{doc.title || "Untitled"}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5 opacity-60">
                {doc.word_count > 0 ? `${doc.word_count} words` : "Empty"}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
