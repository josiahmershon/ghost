-- Update embedding column to 768 dimensions (gemini-embedding-001 with outputDimensionality=768)
alter table reference_chunks drop column if exists embedding;
alter table reference_chunks add column embedding vector(768);

-- Recreate index with new dimensions
drop index if exists reference_chunks_embedding_idx;
create index reference_chunks_embedding_idx
  on reference_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
