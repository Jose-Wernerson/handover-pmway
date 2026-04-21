// ============================================================
// PMWAY — Edge Function: worker
// Responsabilidade: processar jobs pendentes chamando a
// Open Finance API com retry + backoff exponencial.
//
// Invocado por: Supabase pg_cron a cada 30s
// Timeout: configurado para 300s no supabase.toml
//
// Backoff: 5s → 15s → 45s → 135s → falha definitiva (status: failed)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_TENTATIVAS = 4;
const BACKOFF_BASE_MS = 5_000; // 5 segundos

// Calcula o delay de backoff exponencial
function calcularBackoff(tentativa: number): number {
  return BACKOFF_BASE_MS * Math.pow(3, tentativa - 1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chama a Open Finance API com timeout próprio
async function chamarOpenFinance(clienteId: string): Promise<object> {
  const OPEN_FINANCE_URL = Deno.env.get("OPEN_FINANCE_URL")!;
  const OPEN_FINANCE_KEY = Deno.env.get("OPEN_FINANCE_API_KEY")!;

  const controller = new AbortController();
  // Timeout de 120s para a chamada à API de terceiro
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${OPEN_FINANCE_URL}/relatorio/vendas-diarias`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPEN_FINANCE_KEY}`,
      },
      body: JSON.stringify({ clienteId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Open Finance API retornou ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Busca um job pendente (ou que falhou mas ainda tem tentativas restantes)
  const { data: job, error: fetchError } = await supabase
    .from("relatorio_jobs")
    .select("*")
    .eq("status", "pending")
    .lt("tentativas", MAX_TENTATIVAS)
    .order("criado_em", { ascending: true })
    .limit(1)
    .single();

  if (fetchError || !job) {
    console.log("[worker] Nenhum job pendente encontrado.");
    return new Response(JSON.stringify({ processados: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[worker] Processando job: ${job.id} | Cliente: ${job.cliente_id} | Tentativa: ${job.tentativas + 1}/${MAX_TENTATIVAS}`);

  // Marca como 'processing' para evitar processamento duplo
  await supabase
    .from("relatorio_jobs")
    .update({ status: "processing", tentativas: job.tentativas + 1 })
    .eq("id", job.id);

  try {
    // Aplica backoff se não for a primeira tentativa
    if (job.tentativas > 0) {
      const delay = calcularBackoff(job.tentativas);
      console.log(`[worker] Backoff de ${delay / 1000}s antes da tentativa ${job.tentativas + 1}`);
      await sleep(delay);
    }

    const resultado = await chamarOpenFinance(job.cliente_id);

    // Sucesso — atualiza o job com o resultado
    await supabase
      .from("relatorio_jobs")
      .update({ status: "done", resultado })
      .eq("id", job.id);

    console.log(`[worker] ✅ Job ${job.id} concluído com sucesso.`);
    return new Response(JSON.stringify({ processados: 1, jobId: job.id, status: "done" }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const mensagemErro = err instanceof Error ? err.message : String(err);
    console.error(`[worker] ❌ Tentativa ${job.tentativas + 1} falhou: ${mensagemErro}`);

    const tentativasUsadas = job.tentativas + 1;
    const esgotouTentativas = tentativasUsadas >= MAX_TENTATIVAS;

    await supabase
      .from("relatorio_jobs")
      .update({
        // Se esgotou tentativas → 'failed', senão volta para 'pending' para nova tentativa
        status: esgotouTentativas ? "failed" : "pending",
        erro: mensagemErro,
      })
      .eq("id", job.id);

    if (esgotouTentativas) {
      console.error(`[worker] 💀 Job ${job.id} marcado como FAILED após ${MAX_TENTATIVAS} tentativas.`);
    }

    return new Response(
      JSON.stringify({ processados: 0, jobId: job.id, status: esgotouTentativas ? "failed" : "pending" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
