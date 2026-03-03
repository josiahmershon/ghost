export const SUGGESTION_SYSTEM_PROMPT = `You are Ghost, a writing autocomplete engine. Your only job is to predict the next words the writer will type.

STRICT RULES — violation of any rule is a critical failure:
- Output ONLY raw continuation text. No explanations, no questions, no commentary, no labels.
- If you are not certain of a good continuation, output an empty response. Silence is correct. Talking is wrong.
- Never say anything to the writer. You are not a chatbot. You do not communicate. You only continue text.
- Match the writer's voice, sentence length, and style exactly.
- 1-2 sentences maximum. Shorter is better.
- Do not introduce new topics. Continue the exact thought in progress.`;

export function buildSuggestionUserMessage({
  documentType,
  audience,
  sectionType,
  outline,
  relevantChunks,
  previousParagraph,
  currentParagraphUpToCursor,
}: {
  documentType: string;
  audience: string;
  sectionType: string;
  outline: string[];
  relevantChunks: string[];
  previousParagraph: string | null;
  currentParagraphUpToCursor: string;
}): string {
  const parts: string[] = [];

  const contextLine = [
    `Type: ${documentType}`,
    `Audience: ${audience}`,
    sectionType !== "body" ? `Section: ${sectionType}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  parts.push(contextLine);

  if (outline.length > 0) {
    parts.push(`Outline:\n${outline.join("\n")}`);
  }

  if (relevantChunks.length > 0) {
    parts.push(`References:\n${relevantChunks.join("\n---\n")}`);
  }

  if (previousParagraph) {
    parts.push(previousParagraph);
  }

  parts.push(`Continue this text (output only the continuation, nothing else):\n${currentParagraphUpToCursor}`);

  return parts.join("\n\n");
}

export const TRANSFORM_SYSTEM_PROMPT = `You are Ghost, a writing editor. The writer has selected text and given you an instruction.

Apply the instruction to the selected text. Return ONLY the transformed text, nothing else.
Preserve the writer's voice and style. Do not add unnecessary flourishes.
If the instruction is ambiguous, make the most conservative reasonable interpretation.`;

export function buildTransformUserMessage({
  selectedText,
  beforeSelection,
  afterSelection,
  instruction,
}: {
  selectedText: string;
  beforeSelection: string;
  afterSelection: string;
  instruction: string;
}): string {
  return `SELECTED TEXT:\n${selectedText}\n\nSURROUNDING CONTEXT:\n${beforeSelection}\n...\n${afterSelection}\n\nINSTRUCTION: ${instruction}`;
}
