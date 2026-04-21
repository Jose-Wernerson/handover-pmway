# PMWAY — Correção: Bug 504 Gateway Timeout no Relatório de Vendas

> **Task Jira:** PMWAY-247 | **Prioridade:** P0 | **Status:** ✅ Done

## O Problema

O Diretor de Vendas reportou que ao tentar gerar o relatório de vendas diárias, a tela
ficava em **loading infinito**. A causa raiz: a Edge Function do Supabase retornava
**HTTP 504 Gateway Timeout** ao tentar se comunicar com a Open Finance API, que
tem uma latência de 80–120s — superior ao timeout padrão de 60s da Edge Function.

## Por que a solução do Júnior (setInterval) era perigosa

```
❌ setInterval(() => chamarEdgeFunction(), 2_000)
```

| Problema | Impacto |
|---|---|
| Cada usuário gera N chamadas por minuto | Throttle / ban no Supabase |
| 50 usuários × 30 req/min = 1.500 req/min | DDoS acidental na Open Finance API |
| Sem `clearInterval` no unmount | Memory leak |
| Race conditions entre respostas | Dados incorretos na UI |
| Sem backoff exponencial | API de terceiro sobrecarregada |

## A Solução: Arquitetura Assíncrona (Fire-and-Forget + Realtime)

```
React → [Dispatcher EF] → relatorio_jobs (DB) → [Worker EF] → Open Finance API
                                                                        ↓
React ←————————————— Supabase Realtime ←————————— UPDATE status='done'
```

### Fluxo

1. **Dispatcher** (`/functions/dispatcher/index.ts`) — cria o job na fila e retorna o `jobId` em ~50ms
2. **Worker** (`/functions/worker/index.ts`) — invocado pelo `pg_cron`, processa o job com retry + backoff exponencial (5s → 15s → 45s → 135s)
3. **Realtime** — quando o Worker atualiza o status para `done`, o Supabase notifica o React via WebSocket
4. **React** (`/src/hooks/useRelatorio.ts`) — subscreve ao canal Realtime do `jobId` e exibe o relatório quando pronto

## Estrutura do Projeto

```
pmway-relatorio/
├── supabase/
│   ├── migrations/
│   │   └── 20240101_relatorio_jobs.sql   # Tabela de jobs + RLS + Realtime
│   └── functions/
│       ├── dispatcher/
│       │   └── index.ts                  # Cria o job, retorna jobId em ~50ms
│       └── worker/
│           └── index.ts                  # Processa job com retry + backoff
└── src/
    ├── types/index.ts                    # Tipos TypeScript
    ├── lib/supabase.ts                   # Client Supabase
    ├── hooks/
    │   └── useRelatorio.ts               # Hook principal (substitui o setInterval)
    ├── components/
    │   ├── RelatorioVendas.tsx           # Tela do Diretor de Vendas
    │   └── StatusBadge.tsx              # Badge de status do job
    └── tests/
        └── relatorio.spec.ts            # Testes E2E (Playwright) — CT-01 a CT-07
```

## Como rodar

```bash
# 1. Variáveis de ambiente
cp .env.example .env
# Preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 2. Aplicar migration
supabase db push

# 3. Deploy das Edge Functions
supabase functions deploy dispatcher
supabase functions deploy worker

# 4. Configurar pg_cron para invocar o worker a cada 30s
# (executar no Supabase SQL Editor)
select cron.schedule(
  'processar-relatorio-jobs',
  '*/30 * * * * *',  -- a cada 30 segundos
  $$
    select net.http_post(
      url := current_setting('app.supabase_functions_url') || '/worker',
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    );
  $$
);

# 5. Rodar o frontend
npm install && npm run dev

# 6. Rodar os testes E2E
npx playwright test
```

## Evidências de QA

| Cenário | Resultado | Evidência |
|---|---|---|
| CT-01: Happy path | ✅ PASS | `evidencias/CT-01-relatorio-gerado.png` |
| CT-02: API lenta 90s | ✅ PASS | `evidencias/CT-02-api-lenta-ok.png` |
| CT-03: API fora ar | ✅ PASS | `evidencias/CT-03-erro-amigavel.png` |
| CT-04: Fechar aba | ✅ PASS | `evidencias/CT-04-aba-reaberta.png` |
| CT-05: Duplo clique | ✅ PASS | `evidencias/CT-05-sem-duplicata.png` |
| CT-07: Regression | ✅ PASS | `evidencias/CT-07-sem-loading-infinito.png` |
