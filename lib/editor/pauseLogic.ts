export interface PauseContext {
  msSinceLastKeystroke: number;
  cursorAtEndOfBlock: boolean;
  cursorMidWord: boolean;
  lastActionWasDelete: boolean;
  lastActionWasAcceptSuggestion: boolean;
  msSinceLastSuggestionAccepted: number;
  documentIsEmpty: boolean;
  currentBlockIsEmpty: boolean;
}

export function shouldTriggerSuggestion(ctx: PauseContext): boolean {
  if (ctx.cursorMidWord) return false;
  if (ctx.lastActionWasDelete) return false;
  if (ctx.documentIsEmpty) return false;
  if (ctx.currentBlockIsEmpty) return false;
  if (ctx.msSinceLastKeystroke < 800) return false;
  if (ctx.msSinceLastKeystroke > 5000) return false;
  if (
    ctx.lastActionWasAcceptSuggestion &&
    ctx.msSinceLastSuggestionAccepted < 2000
  )
    return false;
  return true;
}
