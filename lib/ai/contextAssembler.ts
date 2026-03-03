import { EditorState } from "@tiptap/pm/state";

export interface SuggestionRequestBody {
  documentId: string;
  currentParagraph: string;
  cursorOffset: number;
  previousParagraph: string | null;
  nextParagraph: string | null;
  outline: string[];
  sectionType: string;
  documentType: string;
  audience: string;
}

// Token budget: ~2000 input tokens. Truncate aggressively.
const MAX_PARAGRAPH_CHARS = 1500;
const MAX_PREV_CHARS = 400;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return "…" + text.slice(text.length - max + 1);
}

function inferSectionType(
  outline: string[],
  currentText: string,
  positionRatio: number,
  totalTextLength: number
): string {
  // Don't infer position-based section types for short documents
  // (a single paragraph doc is not a "conclusion" just because it's 100% through)
  if (totalTextLength < 300) return "body";

  const combined = outline.join(" ").toLowerCase() + " " + currentText.toLowerCase();
  if (/introduction|overview|background|abstract/.test(combined) || positionRatio < 0.2)
    return "introduction";
  if (/conclusion|summary|discussion|future work/.test(combined) || positionRatio > 0.8)
    return "conclusion";
  if (/method|experiment|data|analysis|result/.test(combined))
    return "evidence";
  if (/argument|claim|thesis|point/.test(combined))
    return "argument";
  return "body";
}

export function assembleContext(
  state: EditorState,
  docMeta: { documentId: string; documentType: string; audience: string }
): SuggestionRequestBody | null {
  const { selection, doc } = state;
  const { from } = selection;

  let currentBlock: { text: string; start: number; end: number } | null = null;
  let prevBlockText: string | null = null;
  let nextBlockText: string | null = null;
  const outline: string[] = [];
  let totalTextLength = 0;
  let textBeforeCursor = 0;

  doc.forEach((node, offset) => {
    const nodeEnd = offset + node.nodeSize;
    const text = node.textContent;

    // Collect headings for outline
    if (node.type.name === "heading") {
      const level = node.attrs.level as number;
      outline.push(`${"#".repeat(level)} ${text}`);
    }

    totalTextLength += text.length;

    // Classify blocks relative to cursor
    if (from > offset && from <= nodeEnd) {
      currentBlock = { text, start: offset, end: nodeEnd };
      textBeforeCursor += from - offset - 1; // approx chars before cursor in doc
    } else if (nodeEnd <= from) {
      prevBlockText = text; // last block before cursor
      textBeforeCursor += text.length;
    } else if (!nextBlockText && offset > from) {
      nextBlockText = text;
    }
  });

  if (!currentBlock) return null;
  const block = currentBlock as { text: string; start: number; end: number };

  const cursorOffset = from - block.start - 1;
  const currentParagraphUpToCursor = block.text.slice(0, Math.max(0, cursorOffset));

  if (!currentParagraphUpToCursor.trim()) return null;

  const positionRatio = totalTextLength > 0 ? textBeforeCursor / totalTextLength : 0;
  const sectionType = inferSectionType(outline, currentParagraphUpToCursor, positionRatio, totalTextLength);

  return {
    documentId: docMeta.documentId,
    currentParagraph: truncate(currentParagraphUpToCursor, MAX_PARAGRAPH_CHARS),
    cursorOffset,
    previousParagraph: prevBlockText
      ? truncate(prevBlockText, MAX_PREV_CHARS)
      : null,
    nextParagraph: nextBlockText ? (nextBlockText as string).slice(0, 200) : null,
    outline: outline.slice(-8), // last 8 headings is plenty
    sectionType,
    documentType: docMeta.documentType,
    audience: docMeta.audience,
  };
}
