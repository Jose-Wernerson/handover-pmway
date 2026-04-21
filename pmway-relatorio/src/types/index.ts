// ============================================================
// PMWAY — Types
// ============================================================

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface RelatoriJob {
  id: string;
  cliente_id: string;
  status: JobStatus;
  tentativas: number;
  max_tentativas: number;
  resultado: RelatorioVendas | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface RelatorioVendas {
  clienteId: string;
  periodo: string;
  totalVendas: number;
  totalReceita: number;
  transacoes: Transacao[];
}

export interface Transacao {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria: string;
}
