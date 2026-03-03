import { create } from "zustand";
import { JSONContent } from "@tiptap/react";

export interface Document {
  id: string;
  title: string;
  content: JSONContent;
  outline: OutlineItem[];
  audience: string;
  document_type: string;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface OutlineItem {
  level: number;
  text: string;
}

interface DocumentState {
  currentDoc: Document | null;
  documents: Document[];
  isSaving: boolean;
  saveError: boolean;
  setCurrentDoc: (doc: Document) => void;
  setDocuments: (docs: Document[]) => void;
  updateContent: (content: JSONContent, wordCount: number) => void;
  updateTitle: (title: string) => void;
  setIsSaving: (v: boolean) => void;
  setSaveError: (v: boolean) => void;
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  currentDoc: null,
  documents: [],
  isSaving: false,
  saveError: false,

  setCurrentDoc: (doc) => set({ currentDoc: doc }),
  setDocuments: (docs) => set({ documents: docs }),

  updateContent: (content, wordCount) =>
    set((s) =>
      s.currentDoc
        ? { currentDoc: { ...s.currentDoc, content, word_count: wordCount } }
        : {}
    ),

  updateTitle: (title) =>
    set((s) =>
      s.currentDoc ? { currentDoc: { ...s.currentDoc, title } } : {}
    ),

  setIsSaving: (v) => set({ isSaving: v }),
  setSaveError: (v) => set({ saveError: v }),

  addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
  removeDocument: (id) =>
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
}));
