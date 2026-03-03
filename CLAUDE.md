# CLAUDE.md — Ghost: The Writing IDE

You are building **Ghost**, a web-based writing editor with intelligent AI autocomplete for prose. Think "Cursor for writing." The core experience: you write, gray ghost text appears ahead of your cursor predicting what you'll write next, you hit Tab to accept or keep typing to dismiss. The AI is invisible infrastructure, not a chatbot.

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Editor:** TipTap v2 (built on ProseMirror) — this is non-negotiable, it's the best rich text framework for this use case
- **Styling:** Tailwind CSS — minimal, clean, no component library. The UI should feel like iA Writer meets Linear.
- **State:** Zustand for global state (document, settings, reference shelf)
- **Database:** Supabase (auth, document storage, user settings)
- **AI Inference:** Anthropic API (Claude Haiku for autocomplete, Claude Sonnet for inline transforms)
- **File Processing:** PDF parsing with pdf-parse, URL content extraction with mozilla/readability
- **Embeddings:** Voyage AI or OpenAI embeddings for reference shelf RAG
- **Vector Store:** Supabase pgvector extension (keeps infra simple)
- **Deployment:** Vercel

---

## Project Structure

```
ghost/
├── app/
│   ├── layout.tsx                 # Root layout, font loading, theme provider
│   ├── page.tsx                   # Landing/marketing page
│   ├── editor/
│   │   └── [docId]/
│   │       └── page.tsx           # Main editor view
│   ├── api/
│   │   ├── suggest/
│   │   │   └── route.ts           # Autocomplete endpoint (streaming)
│   │   ├── transform/
│   │   │   └── route.ts           # Cmd+K inline transform endpoint
│   │   ├── references/
│   │   │   ├── upload/
│   │   │   │   └── route.ts       # PDF/URL ingestion + chunking + embedding
│   │   │   └── query/
│   │   │       └── route.ts       # RAG retrieval for context assembly
│   │   └── documents/
│   │       └── route.ts           # CRUD for documents
│   └── auth/
│       └── ...                    # Supabase auth routes
├── components/
│   ├── editor/
│   │   ├── GhostEditor.tsx        # Main TipTap editor wrapper
│   │   ├── GhostExtension.ts      # Custom TipTap extension for ghost text
│   │   ├── PauseDetector.ts       # Keystroke timing + pause detection logic
│   │   ├── SuggestionRenderer.tsx  # Renders ghost text decorations
│   │   └── InlineTransform.tsx    # Cmd+K modal + diff view
│   ├── shelf/
│   │   ├── ReferenceShelf.tsx     # Collapsible reference panel
│   │   ├── PDFUploader.tsx        # Drag-and-drop PDF upload
│   │   └── URLImporter.tsx        # URL paste + content extraction
│   ├── sidebar/
│   │   ├── DocumentList.tsx       # Document browser
│   │   └── OutlineView.tsx        # Auto-generated document outline
│   └── ui/
│       ├── CommandBar.tsx         # Cmd+L command bar (future, stub it)
│       ├── DiffView.tsx           # Before/after diff for transforms
│       └── ThemeToggle.tsx        # Dark/light mode
├── lib/
│   ├── ai/
│   │   ├── contextAssembler.ts    # Builds the prompt from document state
│   │   ├── suggestionClient.ts    # Calls /api/suggest with streaming
│   │   ├── transformClient.ts     # Calls /api/transform
│   │   └── prompts.ts             # All system prompts in one place
│   ├── references/
│   │   ├── pdfProcessor.ts        # PDF → text chunks
│   │   ├── urlProcessor.ts        # URL → cleaned text chunks
│   │   └── embeddings.ts          # Chunk → vector embedding
│   ├── editor/
│   │   ├── documentParser.ts      # Extracts outline, section types from doc
│   │   └── pauseLogic.ts          # Pure function pause detection rules
│   └── supabase/
│       ├── client.ts              # Supabase browser client
│       ├── server.ts              # Supabase server client
│       └── types.ts               # Generated DB types
├── stores/
│   ├── documentStore.ts           # Current document state
│   ├── suggestionStore.ts         # Active suggestion state
│   └── referenceStore.ts          # Reference shelf state
└── supabase/
    └── migrations/
        └── 001_initial.sql        # Documents, references, embeddings tables
```

---

## Database Schema

```sql
-- Users managed by Supabase Auth

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  content jsonb not null default '{}',  -- TipTap JSON document format
  outline jsonb default '[]',            -- Extracted outline/structure
  audience text default 'general',       -- Audience context for suggestions
  document_type text default 'essay',    -- essay, research_paper, blog_post, technical_doc, speech
  word_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table doc_references (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  source_type text not null,             -- 'pdf', 'url', 'note'
  title text,
  original_url text,
  raw_text text,
  created_at timestamptz default now()
);

create table reference_chunks (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid references references(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,
  embedding vector(1024),                -- Voyage AI dimension
  created_at timestamptz default now()
);

-- Enable vector similarity search
create index on reference_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text default 'dark',
  font_size int default 18,
  font_family text default 'serif',      -- serif, sans, mono
  autocomplete_enabled boolean default true,
  autocomplete_delay_ms int default 800,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## The Ghost Text Extension (CRITICAL — get this right)

This is the heart of the product. Build a custom TipTap extension that:

1. **Listens for pause events** from `PauseDetector`
2. **Requests a suggestion** from the API via streaming
3. **Renders ghost text** as a ProseMirror Decoration (NOT as actual document content) — gray, italic, positioned immediately after the cursor
4. **Handles acceptance:**
   - `Tab` → insert the full ghost text into the document as real content
   - `Escape` → dismiss the ghost text
   - `Cmd+→` / `Ctrl+→` → accept one word at a time
   - Any other typing → dismiss ghost text and continue with user's input
5. **Handles streaming:** Ghost text should appear token by token as the API streams, creating a fluid "writing ahead of you" feel
6. **Cancellation:** If the user starts typing while a suggestion is streaming, immediately abort the fetch and clear any partial ghost text

### ProseMirror Decoration approach:
```typescript
// Ghost text is rendered as a widget decoration at the cursor position
// NOT as actual document content — this is crucial
// The decoration renders a span with class "ghost-text" styled as:
//   color: var(--ghost-text-color)  (gray, ~40% opacity)
//   font-style: italic
//   pointer-events: none
//   user-select: none
```

### Key TipTap extension structure:
```typescript
// GhostExtension.ts should:
// - Register a plugin that manages ghost text state
// - Use Plugin.props.decorations to render ghost text
// - Listen for keydown events (Tab, Escape, Cmd+→) at the editor level
// - Manage an AbortController for in-flight suggestion requests
// - Expose commands: acceptSuggestion, dismissSuggestion, acceptWord
```

---

## Pause Detection Rules

This is the second most important thing. The AI should feel helpful, not intrusive.

```typescript
// lib/editor/pauseLogic.ts

interface PauseContext {
  msSinceLastKeystroke: number;
  cursorAtEndOfBlock: boolean;       // End of paragraph/sentence
  cursorMidWord: boolean;            // In the middle of typing a word
  lastActionWasDelete: boolean;      // User is editing, not writing
  lastActionWasAcceptSuggestion: boolean;
  msSinceLastSuggestionAccepted: number;
  documentIsEmpty: boolean;
  currentBlockIsEmpty: boolean;      // Just started a new paragraph
}

function shouldTriggerSuggestion(ctx: PauseContext): boolean {
  // NEVER suggest if:
  if (ctx.cursorMidWord) return false;
  if (ctx.lastActionWasDelete) return false;
  if (ctx.documentIsEmpty) return false;
  if (ctx.msSinceLastKeystroke < 800) return false;
  if (ctx.msSinceLastKeystroke > 5000) return false;  // They're thinking, leave them alone
  if (ctx.lastActionWasAcceptSuggestion && ctx.msSinceLastSuggestionAccepted < 2000) return false;

  // HIGH confidence triggers:
  if (ctx.cursorAtEndOfBlock && ctx.msSinceLastKeystroke >= 800) return true;

  // MEDIUM confidence — cursor at end of sentence (period, question mark)
  // but not at end of block — they might be continuing the paragraph
  // Still suggest, but maybe with a slightly longer delay

  return true;
}
```

---

## Context Assembly (The Prompt Engineering)

This is where Ghost becomes more than a toy. The suggestion model needs smart, compact context.

```typescript
// lib/ai/contextAssembler.ts

interface SuggestionContext {
  // Always included:
  systemPrompt: string;               // Writer's copilot persona + rules
  currentParagraph: string;            // Full text of current paragraph
  cursorPosition: number;              // Character offset within paragraph

  // Surrounding context (truncated to fit budget):
  previousParagraph: string | null;    // Paragraph before current
  nextParagraph: string | null;        // Paragraph after current (if editing mid-doc)

  // Structural context:
  documentOutline: string;             // Heading structure as compact text
  currentSectionType: string;          // "introduction" | "argument" | "evidence" | "conclusion" | etc.
  documentType: string;                // "research_paper" | "essay" | "blog_post" | etc.
  audience: string;                    // "academic reviewers" | "general readers" | etc.

  // Reference context (RAG):
  relevantChunks: string[];            // Top 2-3 most relevant reference chunks

  // TOTAL BUDGET: ~2,000 tokens input. Be ruthless about compression.
}
```

### System prompt for suggestions (put in lib/ai/prompts.ts):

```
You are Ghost, an invisible writing copilot. You predict what the writer will write next.

RULES:
- Continue the writer's current thought naturally. Do not introduce new topics.
- Match the writer's voice exactly: their sentence length, vocabulary level, tone, and style.
- Output ONLY the continuation text. No quotes, no labels, no explanation.
- Keep suggestions to 1-3 sentences maximum. Shorter is better.
- If in a section that makes claims, ground them in the provided reference material where possible.
- Never be flowery or verbose unless the writer's style is flowery and verbose.
- If you're not confident in a good continuation, output nothing (empty response).
- Respect the document type and section context. An introduction needs hooks. A conclusion needs synthesis. Evidence sections need specifics.

CONTEXT:
Document type: {documentType}
Audience: {audience}
Current section: {currentSectionType}

DOCUMENT OUTLINE:
{documentOutline}

REFERENCE MATERIAL:
{relevantChunks}

CURRENT WRITING:
{previousParagraph}

{currentParagraph_up_to_cursor}
```

### System prompt for inline transforms (Cmd+K):

```
You are Ghost, a writing editor. The writer has selected text and given you an instruction.

Apply the instruction to the selected text. Return ONLY the transformed text, nothing else.
Preserve the writer's voice and style. Do not add unnecessary flourishes.
If the instruction is ambiguous, make the most conservative reasonable interpretation.

SELECTED TEXT:
{selectedText}

SURROUNDING CONTEXT:
{beforeSelection}
...
{afterSelection}

INSTRUCTION: {userInstruction}
```

---

## API Route: /api/suggest

```typescript
// app/api/suggest/route.ts
// 
// POST request with:
// {
//   documentId: string,
//   currentParagraph: string,
//   cursorOffset: number,
//   previousParagraph: string | null,
//   nextParagraph: string | null,
//   outline: string[],
//   sectionType: string,
//   documentType: string,
//   audience: string
// }
//
// 1. Assemble context using contextAssembler
// 2. Query reference_chunks via pgvector for relevant references
//    (embed the current paragraph, find top 3 nearest chunks)
// 3. Call Anthropic API with model: claude-haiku-4-5-20251001, stream: true
// 4. Return streaming response (text/event-stream)
//
// IMPORTANT: Set max_tokens to 150. Suggestions should be SHORT.
// IMPORTANT: Set temperature to 0.7 — some creativity but not chaos.
// IMPORTANT: Add a stop sequence for double newlines to prevent runaway generation.
```

---

## API Route: /api/transform

```typescript
// app/api/transform/route.ts
//
// POST request with:
// {
//   documentId: string,
//   selectedText: string,
//   beforeSelection: string,   // ~200 chars before
//   afterSelection: string,    // ~200 chars after
//   instruction: string,       // User's natural language instruction
//   documentType: string,
//   audience: string
// }
//
// 1. Call Anthropic API with model: claude-sonnet-4-5-20250929, stream: true
// 2. Return streaming response
//
// max_tokens: 1000
// temperature: 0.5 — transforms should be more precise than suggestions
```

---

## UI Design Spec

### Philosophy
The editor is the entire screen. Everything else is hidden until needed. Think iA Writer's focus, but with invisible intelligence underneath.

### Layout
```
┌──────────────────────────────────────────────────┐
│  ┌─ Sidebar (hidden by default, toggle Cmd+\) ─┐ │
│  │ Document list                                │ │
│  │ ─────────────                                │ │
│  │ Outline view                                 │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌─ Editor (center, max-width 720px) ───────────┐ │
│  │                                              │ │
│  │  Title (large, contenteditable)              │ │
│  │                                              │ │
│  │  Body text with ghost text suggestions       │ │
│  │  appearing inline as gray italic text        │ │
│  │  ahead of the cursor...                      │ │
│  │                                              │ │
│  │                                              │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌─ Reference Shelf (right, toggle Cmd+/) ──────┐ │
│  │ Drag PDFs here                               │ │
│  │ ─────────────                                │ │
│  │ paper_on_semiconductors.pdf  ✕               │ │
│  │ nytimes.com/article/...      ✕               │ │
│  │ ─────────────                                │ │
│  │ + Add URL                                    │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌─ Status Bar ─────────────────────────────────┐ │
│  │ 1,247 words  │  Essay  │  Ghost: on  │  ☾/☀  │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Typography
- Body: Georgia or Charter (serif) at 18px, line-height 1.7
- Alternative: Inter (sans) if user prefers
- Max content width: 720px, centered
- Generous padding: 80px+ on sides on desktop

### Colors

**Dark mode (default):**
- Background: #0a0a0a
- Text: #e0e0e0
- Ghost text: #555555 (italic)
- Accent: #7c6ff7 (subtle purple, used sparingly — cursor, links)
- Selection: rgba(124, 111, 247, 0.2)

**Light mode:**
- Background: #fafaf8
- Text: #1a1a1a
- Ghost text: #b0b0b0 (italic)
- Accent: #5b4ed4
- Selection: rgba(91, 78, 212, 0.15)

### Animations
- Ghost text fades in with opacity transition (150ms)
- Ghost text fades out when dismissed (100ms)
- Sidebar and shelf slide in/out (200ms, ease-out)
- No other animations. This is a writing tool, not a playground.

### Keyboard Shortcuts
```
Tab             → Accept ghost suggestion
Escape          → Dismiss ghost suggestion
Cmd+→           → Accept one word of suggestion
Cmd+K           → Open inline transform on selection
Cmd+L           → Open command bar (stub for MVP)
Cmd+\           → Toggle sidebar
Cmd+/           → Toggle reference shelf
Cmd+S           → Save (autosave is on, but muscle memory matters)
Cmd+Shift+E     → Export as Markdown
Cmd+D           → Toggle dark/light mode
```

---

## Inline Transform UX (Cmd+K)

1. User selects text
2. User hits Cmd+K
3. A small floating input appears just below the selection (like Notion's slash command, not a modal)
4. User types instruction: "make more concise" / "add a source" / "rewrite for clarity"
5. Hit Enter → the selected text gets a strikethrough treatment and the new text streams in below/beside it in a diff view
6. User sees before (struck through) and after (highlighted) side by side
7. `Enter` or `Tab` to accept → old text replaced with new
8. `Escape` to reject → revert to original

The floating input should feel effortless. No loading screens. The diff should stream in.

---

## Build Order

Execute in this order. Each step should be fully working before moving to the next.

### Phase 1: Editor Foundation
1. Set up Next.js project with Tailwind, Zustand, Supabase
2. Build the TipTap editor with basic rich text (headings, bold, italic, lists, blockquotes)
3. Style it: dark mode, serif typography, centered max-width layout
4. Add autosave to Supabase (debounced, save TipTap JSON)
5. Add the document list sidebar
6. Add word count in status bar

### Phase 2: Ghost Text Autocomplete
7. Build the PauseDetector class
8. Build the GhostExtension TipTap extension with decoration-based ghost text rendering
9. Build /api/suggest with context assembly and Haiku streaming
10. Wire it all together: pause → request → stream → render → Tab/Escape/Cmd+→
11. Test obsessively. Tune the pause timing. Make it feel right.

### Phase 3: Inline Transform
12. Build the Cmd+K floating input UI
13. Build the DiffView component
14. Build /api/transform with Sonnet
15. Wire selection → instruction → stream → diff → accept/reject

### Phase 4: Reference Shelf
16. Build the reference shelf UI (collapsible right panel)
17. Build PDF upload → text extraction → chunking → embedding pipeline
18. Build URL import → readability extraction → chunking → embedding pipeline
19. Build RAG query into the suggestion context assembly
20. Test: upload a paper, write about its topic, see if suggestions reference it

### Phase 5: Polish
21. Light mode
22. Markdown/plain text export
23. Document type selector (essay, research paper, blog post, etc.)
24. Audience selector
25. Outline view in sidebar (auto-extracted from headings)
26. Settings: font, font size, autocomplete delay, autocomplete on/off
27. Auth flow (Supabase email/password + Google OAuth)
28. Landing page

### Phase 6: Plagiarism Checker
29. Build plagiarism check panel and trigger (Cmd+Shift+P or toolbar button)
30. Build /api/plagiarism route
31. Integrate results into the editor with inline highlights

---

## Plagiarism Checker

### UX
- Trigger: `Cmd+Shift+P` on selected text, or a "Check" button in the status bar for the full document
- A right-side panel slides in (similar to Reference Shelf) showing results
- Suspicious passages are highlighted in the editor with a soft amber underline decoration (ProseMirror decoration, not real content — same pattern as ghost text)
- Each highlighted passage links to the matched source

### How it works
Two-layer approach:

**Layer 1 — AI pattern detection (fast, always runs):**
Send the text to Claude Sonnet with a prompt asking it to flag any passages that:
- Sound like they were copied verbatim from a known source
- Use phrasing, sentence structures, or idioms atypical of the surrounding voice
- Make specific claims, statistics, or quotes that should have citations

Sonnet returns a JSON list of flagged spans with a reason and confidence score. This is not a true database check — it's voice-consistency analysis. Fast and surprisingly effective.

**Layer 2 — Web search verification (slower, on demand):**
For each flagged span, run a Google Custom Search API query for the exact phrase in quotes. Return the top 3 matching URLs with similarity score. The user can click to verify the source.

### API route: /api/plagiarism
```typescript
// POST with:
// { text: string, mode: 'ai-only' | 'full' }
//
// Returns JSON (not streaming):
// {
//   flags: Array<{
//     text: string,           // the flagged span
//     startIndex: number,     // char offset in original text
//     endIndex: number,
//     reason: string,         // why it was flagged
//     confidence: 'low' | 'medium' | 'high',
//     sources?: Array<{ url: string, title: string, snippet: string }>
//   }>
// }
```

### Prompt for Layer 1 (in lib/ai/prompts.ts):
```
You are a plagiarism detection assistant. Analyze the provided text and identify passages that may be:
1. Copied or closely paraphrased from external sources
2. Voice-inconsistent with the surrounding writing (suggesting a paste-in)
3. Making specific statistics, quotes, or claims without attribution

Return ONLY valid JSON in this format:
{"flags": [{"text": "...", "startIndex": 0, "endIndex": 0, "reason": "...", "confidence": "medium"}]}

If nothing is suspicious, return: {"flags": []}
Do not include any explanation outside the JSON.
```

### Status bar indicator
When a check has been run, show: `⚠ 3 flags` in amber in the status bar. Clicking it reopens the panel.

### Environment variable needed
```
GOOGLE_SEARCH_API_KEY=    # For Layer 2 web verification
GOOGLE_SEARCH_CX=         # Custom Search Engine ID
```
Layer 2 is optional — Layer 1 works without it.

---

## Critical Implementation Notes

- **Streaming is everything.** Every AI response must stream. No loading spinners. The ghost text appears word by word. The transform diff appears word by word. This is the difference between feeling fast and feeling slow.

- **AbortController on every request.** If the user starts typing while a suggestion is in flight, abort immediately. Stale suggestions appearing after the user has moved on is the #1 way to make this feel broken.

- **The ghost text is a decoration, not content.** This is the most important TipTap implementation detail. If you insert ghost text as real document content and then try to remove it, you'll fight ProseMirror's transaction system endlessly. Decorations are the right abstraction — they're visual only and don't affect the document state.

- **Keep the suggestion prompt under 2K tokens.** Haiku is fast, but only if you're not stuffing 8K tokens of context into every request. Be aggressive about truncation. The current paragraph + outline + 2-3 reference chunks is plenty.

- **Empty responses are valid.** If the model isn't confident, it should return nothing. The extension should handle empty/whitespace-only responses gracefully by simply not showing ghost text. Not every pause needs a suggestion.

- **Autosave should not trigger re-renders.** Debounce saves to 3 seconds after last edit. Save in the background. Never block the editor.

- **Test with real writing.** Don't just test with lorem ipsum. Open the editor and actually write an essay. You'll immediately feel what's wrong with the timing, the suggestion quality, and the UX. This is a product you can only build by using.

---

## Environment Variables

All secrets live in `.env.local` (never committed). Required:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-only. Never expose to client.

# Anthropic
ANTHROPIC_API_KEY=                  # Server-only.

# Embeddings (pick one)
VOYAGE_API_KEY=                     # Preferred — voyage-3-lite model
OPENAI_API_KEY=                     # Fallback — text-embedding-3-small

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Rules:**
- `NEXT_PUBLIC_` prefix = safe to expose to browser. Never put secrets here.
- `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are only ever read in route handlers (`app/api/`), never in client components or lib files that run client-side.
- Validate that required env vars are present at startup. Fail loudly in dev if missing.

---

## Row Level Security (RLS)

Enable RLS from day one — even before auth is wired up. Add to `001_initial.sql`:

```sql
-- Enable RLS on all tables
alter table documents enable row level security;
alter table references enable row level security;
alter table reference_chunks enable row level security;
alter table user_settings enable row level security;

-- Documents: users can only see and modify their own
create policy "documents_owner" on documents
  for all using (auth.uid() = user_id);

-- References: scoped to owner
create policy "references_owner" on references
  for all using (auth.uid() = user_id);

-- Reference chunks: access via parent reference ownership
create policy "reference_chunks_owner" on reference_chunks
  for all using (
    exists (
      select 1 from references r
      where r.id = reference_chunks.reference_id
        and r.user_id = auth.uid()
    )
  );

-- User settings: strictly personal
create policy "user_settings_owner" on user_settings
  for all using (auth.uid() = user_id);
```

**API routes must use the service role client sparingly.** Prefer the user-scoped Supabase client (which respects RLS) in route handlers. Only use service role for admin operations (e.g., embedding inserts that need to bypass RLS during ingestion — and even then, validate document ownership first in application code).

---

## Error Handling

Define behavior for every failure mode. Silence is the wrong default.

### /api/suggest failures
| Failure | Behavior |
|---|---|
| Anthropic API timeout (>8s) | Abort, return empty stream. Ghost extension shows nothing. No user-visible error. |
| Anthropic API error (5xx) | Log server-side. Return empty stream. Do not surface to user. |
| Anthropic API rate limit (429) | Backoff silently. Disable autocomplete for 30s, then re-enable. |
| Supabase vector query failure | Skip RAG, assemble context without reference chunks, continue. |
| Request body invalid | Return 400. Extension logs and suppresses ghost text. |

### /api/transform failures
| Failure | Behavior |
|---|---|
| Anthropic API error | Show subtle inline error: "Transform failed. Try again." with Escape to dismiss. |
| Timeout | Same as above. |
| Empty response | Treat as rejection — revert to original, show "No changes suggested." |

### Autosave failures
- First failure: retry after 5s silently.
- Second failure: show subtle status bar indicator "Save failed" in muted red. Keep retrying every 30s.
- Never block the editor or show a blocking modal for save failures.

### PDF/URL ingestion failures
- Show inline error in the reference shelf item with a retry button.
- Do not remove the item from the shelf on failure — keep it so the user can retry.

### General principles
- **Never crash the editor.** Every error boundary wraps the editor. If something throws, log it and keep writing.
- **Log everything server-side.** Use `console.error` with structured context (documentId, userId hash, error message). In production, pipe to a logging service.
- **Surface nothing to the user unless they need to act.** Autocomplete failures are silent. Save failures are whispered. Only ingestion failures need user attention.

---

## Rate Limiting

Protect `/api/suggest` and `/api/transform` from hammering, both from bugs and abuse.

### Strategy: in-memory sliding window (no Redis needed for MVP)

Use the `@upstash/ratelimit` library with Vercel KV, or a simple in-memory approach for dev:

```typescript
// lib/rateLimit.ts
// Per-user limits (keyed by user ID from Supabase session):
// /api/suggest:   30 requests per minute  (one every 2s — generous for normal use)
// /api/transform: 10 requests per minute  (manual action, shouldn't be rapid-fire)

// If limit exceeded: return 429 with Retry-After header
// Client behavior on 429: disable ghost text for the retry window, then re-enable silently
```

**Client-side guard:** The `PauseDetector` and `GhostExtension` should maintain their own minimum interval between requests (never fire more than once every 2s regardless of pause logic). This is the first line of defense. Server rate limiting is the second.

---

## Streaming + Word-by-Word Acceptance

The `Cmd+→` / `Ctrl+→` "accept one word" feature requires care when the stream is still in flight.

### Buffer strategy:
```typescript
// GhostExtension maintains:
// - streamBuffer: string     — full text received so far from the stream
// - displayedText: string    — what's currently shown as ghost text (same as streamBuffer during streaming)
// - isStreaming: boolean      — stream still open

// On Cmd+→:
// 1. Take the first word from displayedText (split on /\s+/, take index 0 + trailing space)
// 2. Insert that word as real document content
// 3. Remove that word from displayedText
// 4. Update the decoration with remaining displayedText
// 5. If displayedText is now empty but isStreaming, show nothing until more tokens arrive
//    (do NOT cancel the stream — more text is coming)

// On stream chunk received:
// 1. Append to streamBuffer
// 2. If a mid-word accept happened and displayedText was cleared waiting for more,
//    resume displaying from the new chunk onward

// On Tab (accept all):
// 1. Abort the stream immediately
// 2. Insert the full streamBuffer (everything received so far) as real content
// 3. Clear ghost text
```

The key insight: **`streamBuffer` and `displayedText` diverge only during word-by-word acceptance.** During streaming with no user interaction, they are identical.

---

## Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in values from Supabase dashboard + Anthropic console

# Run Supabase locally (optional but recommended)
npx supabase start
npx supabase db push   # applies migrations including RLS

# Start dev server
npm run dev
```

### Supabase local setup
The project uses Supabase's local dev stack (`supabase start`). This runs Postgres + pgvector locally via Docker. All migrations in `supabase/migrations/` apply automatically.

Generate TypeScript types after schema changes:
```bash
npx supabase gen types typescript --local > lib/supabase/types.ts
```

### Recommended dev workflow
1. Run `supabase start` + `npm run dev` in parallel terminals
2. Open http://localhost:3000
3. Use Supabase Studio at http://localhost:54323 to inspect DB state during development
