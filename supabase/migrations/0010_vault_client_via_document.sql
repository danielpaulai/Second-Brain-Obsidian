-- =========================================================================
-- 0010 — vault retrieval keys off the DOCUMENT's client, not the chunk's.
--
-- Single-tenant: there is one client (APP_CLIENT). The vault was first ingested
-- under "default" while the brand kit / knowledge live under "danny"; rather than
-- rewrite 71k HNSW-indexed chunk rows (each update churns the vector index), we
-- migrate only vault_documents.client and have the search + stats filter by the
-- parent document's client via a join. vault_chunks.client becomes vestigial.
-- =========================================================================

create or replace function public.match_vault_chunks (
  query_embedding      vector(1536),
  filter_client        text default 'default',
  match_count          int default 8,
  similarity_threshold float default 0.2
)
returns table (id uuid, document_id uuid, path text, title text, folder text, chunk_index int, content text, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.path, c.title, c.folder, c.chunk_index, c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.vault_chunks c
  join public.vault_documents d on d.id = c.document_id
  where d.client = filter_client
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > similarity_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.vault_stats(filter_client text default 'default')
returns table (documents bigint, chunks bigint, folders bigint)
language sql stable as $$
  select
    (select count(*) from public.vault_documents d where d.client = filter_client),
    (select count(*) from public.vault_chunks c join public.vault_documents d on d.id = c.document_id where d.client = filter_client),
    (select count(distinct d.folder) from public.vault_documents d where d.client = filter_client);
$$;
