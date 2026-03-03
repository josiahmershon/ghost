-- Enable pgvector
create extension if not exists vector;

-- Documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  content jsonb not null default '{}',
  outline jsonb default '[]',
  audience text default 'general',
  document_type text default 'essay',
  word_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- References
create table doc_references (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  source_type text not null,
  title text,
  original_url text,
  raw_text text,
  created_at timestamptz default now()
);

-- Reference chunks
create table reference_chunks (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid references doc_references(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index on reference_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- User settings
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text default 'dark',
  font_size int default 18,
  font_family text default 'serif',
  autocomplete_enabled boolean default true,
  autocomplete_delay_ms int default 800,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── RLS ──────────────────────────────────────────────────────────
alter table documents enable row level security;
alter table doc_references enable row level security;
alter table reference_chunks enable row level security;
alter table user_settings enable row level security;

create policy "documents_owner" on documents
  for all using (auth.uid() = user_id);

create policy "references_owner" on doc_references
  for all using (auth.uid() = user_id);

create policy "reference_chunks_owner" on reference_chunks
  for all using (
    exists (
      select 1 from doc_references r
      where r.id = reference_chunks.reference_id
        and r.user_id = auth.uid()
    )
  );

create policy "user_settings_owner" on user_settings
  for all using (auth.uid() = user_id);

-- ── updated_at trigger ───────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on documents
  for each row execute function set_updated_at();

create trigger user_settings_updated_at
  before update on user_settings
  for each row execute function set_updated_at();
