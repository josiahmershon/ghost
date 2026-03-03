import { create } from "zustand";

export interface Reference {
  id: string;
  title: string;
  source_type: "pdf" | "url" | "note";
  original_url: string | null;
  chunk_count?: number;
  status: "processing" | "ready" | "error";
  errorMessage?: string;
}

interface ReferenceState {
  references: Reference[];
  addReference: (ref: Reference) => void;
  updateReference: (id: string, updates: Partial<Reference>) => void;
  removeReference: (id: string) => void;
  setReferences: (refs: Reference[]) => void;
}

export const useReferenceStore = create<ReferenceState>((set) => ({
  references: [],
  addReference: (ref) => set((s) => ({ references: [ref, ...s.references] })),
  updateReference: (id, updates) =>
    set((s) => ({
      references: s.references.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),
  removeReference: (id) =>
    set((s) => ({ references: s.references.filter((r) => r.id !== id) })),
  setReferences: (refs) => set({ references: refs }),
}));
