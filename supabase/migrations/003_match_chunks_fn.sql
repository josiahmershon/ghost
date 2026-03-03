create or replace function match_reference_chunks(
  p_document_id uuid,
  p_embedding vector(768),
  p_top_k int default 3
)
returns table (
  chunk_text text,
  similarity float
)
language sql stable
as $$
  select
    rc.chunk_text,
    1 - (rc.embedding <=> p_embedding) as similarity
  from reference_chunks rc
  join doc_references dr on dr.id = rc.reference_id
  where dr.document_id = p_document_id
    and rc.embedding is not null
  order by rc.embedding <=> p_embedding
  limit p_top_k;
$$;
