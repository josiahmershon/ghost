"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReferenceStore, Reference } from "@/stores/referenceStore";
import { createClient } from "@/lib/supabase/client";

interface Props {
  documentId: string;
}

export default function ReferenceShelf({ documentId }: Props) {
  const { references, addReference, updateReference, removeReference, setReferences } =
    useReferenceStore();
  const [urlInput, setUrlInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Load existing references on mount
  useEffect(() => {
    supabase
      .from("doc_references")
      .select("id, title, source_type, original_url")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setReferences(
            data.map((r) => ({ ...r, source_type: r.source_type as Reference["source_type"], status: "ready" as const }))
          );
        }
      });
  }, [documentId]);

  const uploadPdf = useCallback(
    async (file: File) => {
      const tempId = crypto.randomUUID();
      addReference({
        id: tempId,
        title: file.name,
        source_type: "pdf",
        original_url: null,
        status: "processing",
      });

      try {
        const form = new FormData();
        form.append("file", file);
        form.append("documentId", documentId);

        const res = await fetch("/api/references/upload", {
          method: "POST",
          body: form,
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        updateReference(tempId, {
          id: data.id,
          title: data.title,
          chunk_count: data.chunk_count,
          status: "ready",
        });
      } catch (err: unknown) {
        updateReference(tempId, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [documentId, addReference, updateReference]
  );

  async function importUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlInput("");

    const tempId = crypto.randomUUID();
    addReference({
      id: tempId,
      title: url,
      source_type: "url",
      original_url: url,
      status: "processing",
    });

    try {
      const res = await fetch("/api/references/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, documentId }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      updateReference(tempId, {
        id: data.id,
        title: data.title,
        chunk_count: data.chunk_count,
        status: "ready",
      });
    } catch (err: unknown) {
      updateReference(tempId, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  async function deleteReference(id: string) {
    removeReference(id);
    await supabase.from("doc_references").delete().eq("id", id);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf"
    );
    files.forEach(uploadPdf);
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div
        className="px-4 py-3 border-b text-xs font-medium tracking-wider uppercase"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        References
      </div>

      {/* Drop zone */}
      <div
        className="mx-3 mt-3 rounded-md border-2 border-dashed flex flex-col items-center justify-center py-5 cursor-pointer transition-colors"
        style={{
          borderColor: isDragging ? "var(--accent)" : "var(--border)",
          background: isDragging ? "rgba(124,111,247,0.05)" : "transparent",
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
          Drop PDFs here or click to browse
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach(uploadPdf);
            e.target.value = "";
          }}
        />
      </div>

      {/* URL import */}
      <div
        className="flex items-center mx-3 mt-2 rounded-md border overflow-hidden"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && importUrl()}
          placeholder="Paste URL…"
          className="flex-1 bg-transparent px-3 py-2 text-xs outline-none"
          style={{ color: "var(--text)" }}
        />
        <button
          onClick={importUrl}
          className="px-3 py-2 text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          Add
        </button>
      </div>

      {/* Reference list */}
      <div className="flex-1 overflow-y-auto mt-2 pb-4">
        {references.length === 0 ? (
          <p
            className="px-4 py-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No references yet.
          </p>
        ) : (
          references.map((ref) => (
            <ReferenceItem
              key={ref.id}
              ref_={ref}
              onDelete={() => deleteReference(ref.id)}
              onRetryPdf={ref.source_type === "pdf" ? () => fileInputRef.current?.click() : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ReferenceItem({
  ref_,
  onDelete,
}: {
  ref_: Reference;
  onDelete: () => void;
  onRetryPdf?: () => void;
}) {
  const label =
    ref_.original_url
      ? new URL(ref_.original_url).hostname
      : ref_.title;

  return (
    <div
      className="flex items-start gap-2 px-4 py-2.5 group"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <p
          className="truncate text-xs"
          style={{
            color:
              ref_.status === "error"
                ? "#e05555"
                : "var(--text)",
          }}
          title={ref_.title}
        >
          {ref_.status === "processing" ? (
            <span style={{ color: "var(--text-muted)" }}>Processing…</span>
          ) : ref_.status === "error" ? (
            <span title={ref_.errorMessage}>⚠ {ref_.title}</span>
          ) : (
            label
          )}
        </p>
        {ref_.status === "ready" && ref_.chunk_count !== undefined && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
            {ref_.chunk_count} chunks
          </p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        ✕
      </button>
    </div>
  );
}
