import { create } from "zustand";

interface SuggestionState {
  suggestion: string;
  isStreaming: boolean;
  setSuggestion: (text: string) => void;
  appendSuggestion: (chunk: string) => void;
  clearSuggestion: () => void;
  setIsStreaming: (v: boolean) => void;
}

export const useSuggestionStore = create<SuggestionState>((set) => ({
  suggestion: "",
  isStreaming: false,
  setSuggestion: (text) => set({ suggestion: text }),
  appendSuggestion: (chunk) =>
    set((s) => ({ suggestion: s.suggestion + chunk })),
  clearSuggestion: () => set({ suggestion: "", isStreaming: false }),
  setIsStreaming: (v) => set({ isStreaming: v }),
}));
