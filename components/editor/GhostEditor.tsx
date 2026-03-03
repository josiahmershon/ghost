"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { GhostExtension } from "./GhostExtension";
import { useDocumentStore, Document } from "@/stores/documentStore";
import { createClient } from "@/lib/supabase/client";

const AUTOSAVE_DELAY = 3000;

interface GhostEditorProps {
  doc: Document;
  onEditorReady?: (editor: import("@tiptap/react").Editor) => void;
}

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

export default function GhostEditor({ doc, onEditorReady }: GhostEditorProps) {
  const { updateContent, setIsSaving, setSaveError } =
    useDocumentStore();
  const supabase = createClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContent = useRef(doc.content);
  const latestTitle = useRef(doc.title);

  const save = useCallback(async () => {
    setIsSaving(true);
    setSaveError(false);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          content: latestContent.current,
          title: latestTitle.current,
          word_count: countWords(
            editor?.getText() ?? ""
          ),
        })
        .eq("id", doc.id);
      if (error) throw error;
    } catch {
      setSaveError(true);
      // Retry once after 5s
      setTimeout(save, 5000);
    } finally {
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, AUTOSAVE_DELAY);
  }, [save]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
      CharacterCount,
      GhostExtension.configure({
        documentId: doc.id,
        documentType: doc.document_type,
        audience: doc.audience,
        enabled: true,
        delayMs: 800,
      }),
    ],
    content: doc.content && Object.keys(doc.content).length > 0
      ? doc.content
      : undefined,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
      },
    },
    onCreate({ editor }) {
      onEditorReady?.(editor);
    },
    onUpdate({ editor }) {
      const json = editor.getJSON();
      const text = editor.getText();
      const words = countWords(text);
      latestContent.current = json;
      updateContent(json, words);
      scheduleSave();
    },
  });

  // Cmd+S → manual save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        save();
      }
    };
  }, [save]);

  return (
    <div className="w-full">
      <EditorContent editor={editor} />
    </div>
  );
}
