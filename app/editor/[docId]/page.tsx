"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { useDocumentStore, Document } from "@/stores/documentStore";
import GhostEditor from "@/components/editor/GhostEditor";
import InlineTransform from "@/components/editor/InlineTransform";
import DocumentList from "@/components/sidebar/DocumentList";
import ReferenceShelf from "@/components/shelf/ReferenceShelf";
import ThemeToggle from "@/components/ui/ThemeToggle";

interface TransformState {
  selectedText: string;
  from: number;
  to: number;
  position: { top: number; left: number };
  beforeSelection: string;
  afterSelection: string;
}

const DOC_TYPES = ["essay", "research_paper", "blog_post", "technical_doc", "speech"] as const;
const AUDIENCES = ["general", "academic", "professional", "technical", "creative"] as const;

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params.docId as string;
  const supabase = createClient();

  const { currentDoc, setCurrentDoc, isSaving, saveError } = useDocumentStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [transform, setTransform] = useState<TransformState | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    async function loadDoc() {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", docId)
        .single();
      if (error || !data) {
        setNotFound(true);
      } else {
        setCurrentDoc(data as Document);
      }
      setLoading(false);
    }
    loadDoc();
  }, [docId]);

  const openTransform = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const { selection, doc } = editor.state;
    const { from, to } = selection;
    if (from === to) return;

    const selectedText = doc.textBetween(from, to);
    if (!selectedText.trim()) return;

    const coords = editor.view.coordsAtPos(to);
    const beforeSelection = doc.textBetween(Math.max(0, from - 200), from);
    const afterSelection = doc.textBetween(to, Math.min(doc.content.size, to + 200));

    setTransform({
      selectedText,
      from,
      to,
      position: { top: coords.bottom, left: coords.left },
      beforeSelection,
      afterSelection,
    });
  }, []);

  // Save document type or audience change
  async function updateDocMeta(field: "document_type" | "audience", value: string) {
    if (!currentDoc) return;
    setCurrentDoc({ ...currentDoc, [field]: value });
    await supabase.from("documents").update({ [field]: value }).eq("id", docId);
    // Update extension storage live so next suggestion uses the new value
    const editor = editorRef.current;
    if (editor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ghostStorage = (editor.storage as any).ghost;
      if (field === "document_type") ghostStorage.documentType = value;
      if (field === "audience") ghostStorage.audience = value;
    }
  }

  // Markdown export
  function exportMarkdown() {
    const editor = editorRef.current;
    if (!editor || !currentDoc) return;
    // Simple serialization: walk nodes and convert to markdown
    const lines: string[] = [];
    editor.state.doc.forEach((node) => {
      if (node.type.name === "heading") {
        lines.push(`${"#".repeat(node.attrs.level)} ${node.textContent}`);
      } else if (node.type.name === "blockquote") {
        lines.push(`> ${node.textContent}`);
      } else if (node.type.name === "bulletList") {
        node.forEach((item) => lines.push(`- ${item.textContent}`));
      } else if (node.type.name === "orderedList") {
        let i = 1;
        node.forEach((item) => { lines.push(`${i}. ${item.textContent}`); i++; });
      } else {
        lines.push(node.textContent);
      }
      lines.push("");
    });
    const md = `# ${currentDoc.title}\n\n${lines.join("\n")}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${currentDoc.title || "untitled"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Sign out
  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openTransform();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShelfOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "E") {
        e.preventDefault();
        exportMarkdown();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openTransform, exportMarkdown]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg)", color: "var(--text-muted)" }}
      >
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (notFound || !currentDoc) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen gap-3"
        style={{ background: "var(--bg)", color: "var(--text-muted)" }}
      >
        <p className="text-sm">Document not found.</p>
        <button
          onClick={() => router.push("/")}
          className="text-sm underline"
          style={{ color: "var(--accent)" }}
        >
          Go home
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Sidebar */}
      <aside
        className="flex-shrink-0 overflow-hidden transition-all duration-200 ease-out border-r"
        style={{
          width: sidebarOpen ? "220px" : "0px",
          borderColor: "var(--border)",
          background: "var(--sidebar-bg)",
        }}
      >
        <div className="w-[220px] h-full">
          <DocumentList currentDocId={docId} />
        </div>
      </aside>

      {/* Main editor area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-20 py-16">
            <TitleInput value={currentDoc.title} docId={currentDoc.id} />
            <GhostEditor doc={currentDoc} onEditorReady={(e) => { editorRef.current = e; }} />
          </div>
        </div>

        {/* Status bar */}
        <footer
          className="flex-shrink-0 flex items-center gap-3 px-6 py-2 border-t text-xs"
          style={{
            borderColor: "var(--border)",
            background: "var(--sidebar-bg)",
            color: "var(--text-muted)",
          }}
        >
          <span>{currentDoc.word_count.toLocaleString()} words</span>
          <span className="opacity-30">│</span>

          {/* Document type */}
          <select
            value={currentDoc.document_type}
            onChange={(e) => updateDocMeta("document_type", e.target.value)}
            className="bg-transparent border-none outline-none text-xs cursor-pointer capitalize"
            style={{ color: "var(--text-muted)" }}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: "var(--sidebar-bg)" }}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>

          <span className="opacity-30">│</span>

          {/* Audience */}
          <select
            value={currentDoc.audience}
            onChange={(e) => updateDocMeta("audience", e.target.value)}
            className="bg-transparent border-none outline-none text-xs cursor-pointer capitalize"
            style={{ color: "var(--text-muted)" }}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a} style={{ background: "var(--sidebar-bg)" }}>
                {a}
              </option>
            ))}
          </select>

          <span className="opacity-30">│</span>
          <span style={{ color: saveError ? "#e05555" : "inherit" }}>
            {saveError ? "Save failed" : isSaving ? "Saving…" : "Saved"}
          </span>

          <span className="flex-1" />

          <ThemeToggle />
          <span className="opacity-30">│</span>
          <button
            onClick={signOut}
            className="transition-colors hover:text-[var(--text)]"
            style={{ color: "var(--text-muted)" }}
          >
            Sign out
          </button>
        </footer>
      </main>

      {/* Reference shelf */}
      <aside
        className="flex-shrink-0 overflow-hidden transition-all duration-200 ease-out border-l"
        style={{
          width: shelfOpen ? "260px" : "0px",
          borderColor: "var(--border)",
          background: "var(--sidebar-bg)",
        }}
      >
        <div className="w-[260px] h-full">
          <ReferenceShelf documentId={docId} />
        </div>
      </aside>

      {/* Inline transform floating panel */}
      {transform && (
        <InlineTransform
          editor={editorRef.current!}
          selectedText={transform.selectedText}
          from={transform.from}
          to={transform.to}
          position={transform.position}
          beforeSelection={transform.beforeSelection}
          afterSelection={transform.afterSelection}
          documentType={currentDoc.document_type}
          audience={currentDoc.audience}
          onClose={() => setTransform(null)}
        />
      )}
    </div>
  );
}

// Inline title editor
function TitleInput({ value, docId }: { value: string; docId: string }) {
  const { updateTitle } = useDocumentStore();
  const supabase = createClient();
  const [title, setTitle] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTitle(v);
    updateTitle(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      supabase.from("documents").update({ title: v }).eq("id", docId);
    }, 1500);
  }

  return (
    <input
      type="text"
      value={title}
      onChange={onChange}
      placeholder="Untitled"
      className="w-full bg-transparent border-none outline-none mb-8 font-serif"
      style={{
        fontSize: "2.2em",
        fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
        caretColor: "var(--accent)",
      }}
    />
  );
}
