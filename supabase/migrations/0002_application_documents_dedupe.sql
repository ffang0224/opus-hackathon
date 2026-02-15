with ranked as (
  select
    id,
    row_number() over (
      partition by application_id, input_key
      order by created_at desc, id desc
    ) as row_rank
  from public.application_documents
)
delete from public.application_documents d
using ranked r
where d.id = r.id
  and r.row_rank > 1;

create unique index if not exists application_documents_unique_per_input
on public.application_documents (application_id, input_key);
