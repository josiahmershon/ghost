"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
  selectedText: string;
  from: number;
  to: number;
  position: { top: number; left: number };
  beforeSelection: string;
  afterSelection: string;
  documentType: string;
  audience: string;
  onClose: () => void;
}

type Phase = "input" | "streaming" | "review";

export default function InlineTransform({
  editor,
  selectedText,
  from,
  to,
  position,
  beforeSelection,
  afterSelection,
  documentType,
  audience,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [phase, setPhase] = useState<Phase>("input");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    onClose();
  }, [onClose]);

  // Escape closes at any phase
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  async function submit() {
    if (!instruction.trim()) return;
    setPhase("streaming");
    setResult("");

    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          beforeSelection,
          afterSelection,
          instruction,
          documentType,
          audience,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        handleClose();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setResult(accumulated);
      }

      setPhase("review");
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("[InlineTransform]", err);
      }
      handleClose();
    }
  }

  function accept() {
    if (!result.trim()) return handleClose();
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, result)
      .run();
    handleClose();
  }

  function reject() {
    handleClose();
  }

  // Clamp position so the panel doesn't go off-screen
  const top = Math.min(position.top + 28, window.innerHeight - 200);
  const left = Math.max(20, Math.min(position.left, window.innerWidth - 420));

  return (
    <div
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 50,
        width: 400,
        background: "var(--sidebar-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Instruction input */}
      {phase === "input" && (
        <div style={{ padding: "10px 12px" }}>
          <input
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Make more concise, rewrite for clarity…"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        </div>
      )}

      {/* Streaming / review */}
      {(phase === "streaming" || phase === "review") && (
        <div style={{ padding: "10px 12px" }}>
          {/* Original — struck through */}
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 13,
              color: "var(--text-muted)",
              textDecoration: "line-through",
              lineHeight: 1.5,
              fontFamily: "Georgia, serif",
            }}
          >
            {selectedText}
          </p>

          {/* Replacement — streaming in */}
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: phase === "review" ? "var(--text)" : "var(--accent)",
              lineHeight: 1.5,
              fontFamily: "Georgia, serif",
              minHeight: 20,
            }}
          >
            {result || <span style={{ opacity: 0.4 }}>Thinking…</span>}
          </p>

          {/* Accept / reject — only when done */}
          {phase === "review" && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={accept}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Accept ↵
              </button>
              <button
                onClick={reject}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Reject Esc
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
