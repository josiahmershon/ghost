import {
  PauseContext,
  shouldTriggerSuggestion,
} from "@/lib/editor/pauseLogic";

type PartialCtx = Omit<
  PauseContext,
  | "msSinceLastKeystroke"
  | "lastActionWasDelete"
  | "lastActionWasAcceptSuggestion"
  | "msSinceLastSuggestionAccepted"
>;

export class PauseDetector {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastContentChangeTime = 0;
  private lastActionWasDelete = false;
  private lastActionWasAcceptSuggestion = false;
  private lastSuggestionAcceptedTime = 0;

  constructor(
    private readonly onPause: () => void,
    private readonly getContext: () => PartialCtx,
    private readonly delay = 800
  ) {}

  recordKeystroke(isDelete: boolean) {
    const now = Date.now();
    this.lastContentChangeTime = now;
    this.lastActionWasDelete = isDelete;
    // Accepting a suggestion followed by typing resets that flag
    if (!isDelete) this.lastActionWasAcceptSuggestion = false;

    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      const elapsed = Date.now() - this.lastContentChangeTime;
      const partial = this.getContext();
      const ctx: PauseContext = {
        ...partial,
        msSinceLastKeystroke: elapsed,
        lastActionWasDelete: this.lastActionWasDelete,
        lastActionWasAcceptSuggestion: this.lastActionWasAcceptSuggestion,
        msSinceLastSuggestionAccepted:
          Date.now() - this.lastSuggestionAcceptedTime,
      };
      if (shouldTriggerSuggestion(ctx)) {
        this.onPause();
      }
    }, this.delay);
  }

  recordAccept() {
    this.lastActionWasAcceptSuggestion = true;
    this.lastSuggestionAcceptedTime = Date.now();
    if (this.timer) clearTimeout(this.timer);
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}
