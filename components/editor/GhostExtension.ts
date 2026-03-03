import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DecorationSet, Decoration } from "@tiptap/pm/view";
import { PauseDetector } from "./PauseDetector";
import { assembleContext } from "@/lib/ai/contextAssembler";

// ── Plugin state ──────────────────────────────────────────────────────────────

interface GhostState {
  suggestion: string;
  pos: number; // document position where suggestion is anchored
}

const ghostKey = new PluginKey<GhostState>("ghost");

function emptyState(): GhostState {
  return { suggestion: "", pos: -1 };
}

// ── Extension options ─────────────────────────────────────────────────────────

export interface GhostOptions {
  documentId: string;
  documentType: string;
  audience: string;
  enabled: boolean;
  delayMs: number;
}

// ── Extension ─────────────────────────────────────────────────────────────────

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghost: {
      requestSuggestion: () => ReturnType;
      acceptSuggestion: () => ReturnType;
      acceptWord: () => ReturnType;
      dismissSuggestion: () => ReturnType;
    };
  }
}

export const GhostExtension = Extension.create<GhostOptions>({
  name: "ghost",

  addOptions() {
    return {
      documentId: "",
      documentType: "essay",
      audience: "general",
      enabled: true,
      delayMs: 800,
    };
  },

  addStorage() {
    return {
      pauseDetector: null as PauseDetector | null,
      abortController: null as AbortController | null,
      // Mutable so the editor page can update these without remounting
      documentType: "" as string,
      audience: "" as string,
    };
  },

  onCreate() {
    this.storage.documentType = this.options.documentType;
    this.storage.audience = this.options.audience;
    if (!this.options.enabled) return;

    this.storage.pauseDetector = new PauseDetector(
      () => {
        this.editor.commands.requestSuggestion();
      },
      () => {
        const { state } = this.editor;
        const { selection, doc } = state;
        const { from } = selection;

        // cursorMidWord: non-space chars on BOTH sides of cursor (e.g. "ty|ping")
        // Being at the END of a word ("time|") is not mid-word
        const charBefore = doc.textBetween(Math.max(0, from - 1), from);
        const charAfter = doc.textBetween(from, Math.min(doc.content.size, from + 1));
        const cursorMidWord =
          /\S/.test(charBefore) && /\S/.test(charAfter);

        // cursorAtEndOfBlock: cursor is at end of its containing block
        const $pos = state.doc.resolve(from);
        const cursorAtEndOfBlock = $pos.parentOffset === $pos.parent.content.size;

        const docText = doc.textContent;
        const documentIsEmpty = docText.trim().length === 0;

        const blockText = $pos.parent.textContent;
        const currentBlockIsEmpty = blockText.trim().length === 0;

        return {
          cursorAtEndOfBlock,
          cursorMidWord,
          documentIsEmpty,
          currentBlockIsEmpty,
        };
      },
      this.options.delayMs
    );
  },

  onUpdate({ transaction }) {
    if (!this.options.enabled) return;
    if (!transaction.docChanged) return;

    // Abort any in-flight request immediately — the context it was built from
    // is now stale. recordKeystroke will schedule a fresh one after the pause.
    this.storage.abortController?.abort();
    this.storage.abortController = null;

    const isDelete =
      transaction.doc.nodeSize < transaction.before.nodeSize;

    this.storage.pauseDetector?.recordKeystroke(isDelete);
  },

  onDestroy() {
    this.storage.pauseDetector?.destroy();
    this.storage.abortController?.abort();
  },

  addCommands() {
    return {
      requestSuggestion:
        () =>
        ({ editor }) => {
          if (!this.options.enabled) return false;

          // Abort any in-flight request
          this.storage.abortController?.abort();

          const context = assembleContext(editor.state, {
            documentId: this.options.documentId,
            documentType: this.storage.documentType || this.options.documentType,
            audience: this.storage.audience || this.options.audience,
          });

          if (!context) return false;

          const cursorPos = editor.state.selection.from;
          const charBefore = editor.state.doc.textBetween(
            Math.max(0, cursorPos - 1),
            cursorPos
          );
          const needsSpace = charBefore.length > 0 && !/\s/.test(charBefore);

          const ac = new AbortController();
          this.storage.abortController = ac;

          // Stream chunks in — fire and forget (errors are silent)
          streamSuggestion(
            context,
            ac.signal,
            (accumulated) => {
              if (ac.signal.aborted) return;
              const display = needsSpace ? " " + accumulated : accumulated;
              const tr = editor.view.state.tr.setMeta(ghostKey, {
                suggestion: display,
                pos: cursorPos,
              });
              editor.view.dispatch(tr);
            },
            () => {
              // Stream complete — nothing extra needed
              this.storage.abortController = null;
            }
          );

          return true;
        },

      acceptSuggestion:
        () =>
        ({ editor }) => {
          const state = ghostKey.getState(editor.state);
          if (!state?.suggestion) return false;
          this.storage.abortController?.abort();
          this.storage.abortController = null;
          this.storage.pauseDetector?.recordAccept();

          editor.view.dispatch(
            editor.view.state.tr.insertText(state.suggestion, state.pos)
          );
          return true;
        },

      acceptWord:
        () =>
        ({ editor }) => {
          const state = ghostKey.getState(editor.state);
          if (!state?.suggestion) return false;

          // First word + any trailing whitespace
          const match = state.suggestion.match(/^(\S+\s*)/);
          if (!match) return false;
          const word = match[1];
          const remaining = state.suggestion.slice(word.length);

          // Insert word, and either show remaining ghost text or clear
          const newGhostState: GhostState = remaining
            ? { suggestion: remaining, pos: state.pos + word.length }
            : emptyState();

          editor.view.dispatch(
            editor.view.state.tr
              .insertText(word, state.pos)
              .setMeta(ghostKey, newGhostState)
          );
          return true;
        },

      dismissSuggestion:
        () =>
        ({ editor }) => {
          this.storage.abortController?.abort();
          this.storage.abortController = null;
          editor.view.dispatch(
            editor.view.state.tr.setMeta(ghostKey, emptyState())
          );
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    const plugin = new Plugin<GhostState>({
      key: ghostKey,

      state: {
        init: () => emptyState(),
        apply(tr, prev) {
          const meta = tr.getMeta(ghostKey) as GhostState | undefined;
          // Explicit meta always wins (streaming updates, word-accept, dismiss)
          if (meta !== undefined) return meta;
          // Any doc change or cursor move clears ghost text
          if (tr.docChanged || tr.selectionSet) return emptyState();
          return prev;
        },
      },

      props: {
        decorations(state) {
          const { suggestion, pos } = ghostKey.getState(state) ?? emptyState();
          if (!suggestion || pos === -1) return DecorationSet.empty;

          const widget = Decoration.widget(
            pos,
            () => {
              const span = document.createElement("span");
              span.className = "ghost-text visible";
              span.textContent = suggestion;
              return span;
            },
            { side: 1 } // render after the cursor
          );

          return DecorationSet.create(state.doc, [widget]);
        },

        handleKeyDown(view, event) {
          const state = ghostKey.getState(view.state);
          if (!state?.suggestion) return false;

          if (event.key === "Tab") {
            event.preventDefault();
            storage.abortController?.abort();
            storage.abortController = null;
            view.dispatch(
              view.state.tr.insertText(state.suggestion, state.pos)
            );
            return true;
          }

          if (event.key === "Escape") {
            storage.abortController?.abort();
            storage.abortController = null;
            view.dispatch(view.state.tr.setMeta(ghostKey, emptyState()));
            return true;
          }

          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === "ArrowRight"
          ) {
            event.preventDefault();
            const match = state.suggestion.match(/^(\S+\s*)/);
            if (!match) return true;
            const word = match[1];
            const remaining = state.suggestion.slice(word.length);
            const newGhostState: GhostState = remaining
              ? { suggestion: remaining, pos: state.pos + word.length }
              : emptyState();
            view.dispatch(
              view.state.tr
                .insertText(word, state.pos)
                .setMeta(ghostKey, newGhostState)
            );
            return true;
          }

          return false;
        },
      },
    });

    return [plugin];
  },
});

// ── Streaming helper ──────────────────────────────────────────────────────────

async function streamSuggestion(
  context: object,
  signal: AbortSignal,
  onChunk: (accumulated: string) => void,
  onDone: () => void
): Promise<void> {
  try {
    const response = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
      signal,
    });

    if (!response.ok || !response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;
      if (accumulated.trim()) {
        onChunk(accumulated);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== "AbortError") {
      console.error("[GhostExtension] stream error:", err.message);
    }
  } finally {
    onDone();
  }
}
