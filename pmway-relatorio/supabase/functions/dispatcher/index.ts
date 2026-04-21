// ============================================================
// PMWAY — Edge Function: dispatcher
// Responsabilidade: criar um job na fila e retornar o ID
// imediatamente (~50ms). NÃO chama a Open Finance API aqui.
//
// ❌ PROBLEMA ANTERIOR: chamava a API diretamente → 504 Timeout
// ✅ SOLUÇÃO: fire-and-forget, o worker processa em background
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { clienteId } = await req.json();

    if (!clienteId) {
      return new Response(
        JSON.stringify({ error: "clienteId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Idempotência: verifica se já existe job pending/processing para este cliente
    const { data: jobExistente } = await supabase
      .from("relatorio_jobs")
      .select("id, status")
      .eq("cliente_id", clienteId)
      .in("status", ["pending", "processing"])
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();

    if (jobExistente) {
      // Retorna o job existente em vez de criar duplicata
      return new Response(
        JSON.stringify({ jobId: jobExistente.id, status: jobExistente.status, existente: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cria o job na fila — retorna em ~50ms
    const { data: job, error } = await supabase
      .from("relatorio_jobs")
      .insert({ cliente_id: clienteId, status: "pending" })
      .select()
      .single();

    if (error) throw error;

    console.log(`[dispatcher] Job criado: ${job.id} para cliente: ${clienteId}`);

    return new Response(
      JSON.stringify({ jobId: job.id, status: "pending" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[dispatcher] Erro:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao criar job" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
