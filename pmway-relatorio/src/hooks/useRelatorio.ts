// ============================================================
// PMWAY — Hook: useRelatorio
//
// ❌ ANTES (anti-pattern do Júnior):
//   setInterval(() => chamarAPI(), 2000) — polling cego no frontend
//
// ✅ AGORA:
//   1. Dispara o Dispatcher → recebe jobId em ~50ms
//   2. Subscreve ao Supabase Realtime para aquele jobId
//   3. Quando o Worker atualiza o status → React é notificado
//   Zero polling. Zero setInterval. Zero trava de UI.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { JobStatus, RelatorioVendas, RelatoriJob } from "../types";

interface UseRelatorioState {
  jobId: string | null;
  status: JobStatus | null;
  relatorio: RelatorioVendas | null;
  erro: string | null;
  carregando: boolean;
}

interface UseRelatorioReturn extends UseRelatorioState {
  gerarRelatorio: (clienteId: string) => Promise<void>;
  resetar: () => void;
}

export function useRelatorio(): UseRelatorioReturn {
  const [state, setState] = useState<UseRelatorioState>({
    jobId: null,
    status: null,
    relatorio: null,
    erro: null,
    carregando: false,
  });

  // Ref para limpar o canal Realtime quando o componente desmontar
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (canalRef.current) {
        supabase.removeChannel(canalRef.current);
      }
    };
  }, []);

  const subscreverRealtime = useCallback((jobId: string) => {
    // Remove canal anterior se existir
    if (canalRef.current) {
      supabase.removeChannel(canalRef.current);
    }

    console.log(`[useRelatorio] Subscrevendo Realtime para job: ${jobId}`);

    const canal = supabase
      .channel(`relatorio-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "relatorio_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const job = payload.new as RelatoriJob;
          console.log(`[useRelatorio] Status atualizado: ${job.status}`);

          if (job.status === "done") {
            setState((prev) => ({
              ...prev,
              status: "done",
              relatorio: job.resultado,
              carregando: false,
              erro: null,
            }));
            // Remove o canal — não precisamos mais ouvir
            supabase.removeChannel(canal);
          }

          if (job.status === "failed") {
            setState((prev) => ({
              ...prev,
              status: "failed",
              carregando: false,
              erro: job.erro ?? "Não foi possível gerar o relatório. Tente novamente.",
            }));
            supabase.removeChannel(canal);
          }

          if (job.status === "processing") {
            setState((prev) => ({ ...prev, status: "processing" }));
          }
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") {
          console.log(`[useRelatorio] ✅ Realtime ativo para job: ${jobId}`);
        }
      });

    canalRef.current = canal;
  }, []);

  const gerarRelatorio = useCallback(
    async (clienteId: string) => {
      // Evita duplo clique
      if (state.carregando) return;

      setState({
        jobId: null,
        status: null,
        relatorio: null,
        erro: null,
        carregando: true,
      });

      try {
        // 1. Chama o Dispatcher — retorna em ~50ms com o jobId
        const { data, error } = await supabase.functions.invoke("dispatcher", {
          body: { clienteId },
        });

        if (error) throw new Error(error.message);

        const { jobId } = data as { jobId: string; status: JobStatus };
        console.log(`[useRelatorio] Job criado: ${jobId}`);

        setState((prev) => ({
          ...prev,
          jobId,
          status: "pending",
          // carregando mantém true — aguardando Realtime
        }));

        // 2. Subscreve ao Realtime para receber a atualização quando o Worker terminar
        subscreverRealtime(jobId);
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
        console.error("[useRelatorio] Erro ao criar job:", mensagem);
        setState({
          jobId: null,
          status: "failed",
          relatorio: null,
          erro: mensagem,
          carregando: false,
        });
      }
    },
    [state.carregando, subscreverRealtime]
  );

  const resetar = useCallback(() => {
    if (canalRef.current) {
      supabase.removeChannel(canalRef.current);
      canalRef.current = null;
    }
    setState({
      jobId: null,
      status: null,
      relatorio: null,
      erro: null,
      carregando: false,
    });
  }, []);

  return { ...state, gerarRelatorio, resetar };
}
