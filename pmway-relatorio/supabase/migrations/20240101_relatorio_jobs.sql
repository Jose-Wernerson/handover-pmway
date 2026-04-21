-- ============================================================
-- PMWAY — Migration: relatorio_jobs
-- Criado para resolver o bug de 504 Timeout na geração de
-- relatórios de vendas diárias via Open Finance API
-- ============================================================

create type job_status as enum ('pending', 'processing', 'done', 'failed');

create table relatorio_jobs (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    text        not null,
  status        job_status  not null default 'pending',
  tentativas    int         not null default 0,
  max_tentativas int        not null default 4,
  resultado     jsonb,
  erro          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Index para o worker buscar jobs pendentes rapidamente
create index idx_relatorio_jobs_status on relatorio_jobs (status)
  where status in ('pending', 'processing');

-- Atualiza automaticamente o campo atualizado_em
create or replace function set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_relatorio_jobs_atualizado_em
  before update on relatorio_jobs
  for each row execute procedure set_atualizado_em();

-- Habilitar Realtime para a tabela (necessário para o frontend receber eventos)
alter publication supabase_realtime add table relatorio_jobs;

-- RLS: apenas usuários autenticados podem ver seus próprios jobs
alter table relatorio_jobs enable row level security;

create policy "usuarios veem apenas seus jobs"
  on relatorio_jobs for select
  using (cliente_id = auth.uid()::text);

create policy "usuarios criam apenas seus jobs"
  on relatorio_jobs for insert
  with check (cliente_id = auth.uid()::text);
