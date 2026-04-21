// ============================================================
// PMWAY — Component: RelatorioVendas
// Tela que o Diretor de Vendas usa para gerar o relatório
//
// ❌ ANTES: loading infinito por 504 na Edge Function
// ✅ AGORA: fire-and-forget + Realtime, UI nunca trava
// ============================================================

import { useState } from "react";
import { useRelatorio } from "../hooks/useRelatorio";
import { StatusBadge } from "./StatusBadge";
import type { RelatorioVendas as RelatorioVendasType } from "../types";

// Formata moeda em BRL
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function TabelaTransacoes({ relatorio }: { relatorio: RelatorioVendasType }) {
  return (
    <div className="relatorio-container">
      <div className="relatorio-header">
        <h2>Relatório de Vendas Diárias</h2>
        <p className="relatorio-cliente">Cliente: {relatorio.clienteId}</p>
        <p className="relatorio-periodo">Período: {relatorio.periodo}</p>
      </div>

      <div className="relatorio-resumo">
        <div className="card-resumo">
          <span className="card-label">Total de Vendas</span>
          <span className="card-valor">{relatorio.totalVendas}</span>
        </div>
        <div className="card-resumo destaque">
          <span className="card-label">Receita Total</span>
          <span className="card-valor">{formatarMoeda(relatorio.totalReceita)}</span>
        </div>
      </div>

      <table className="tabela-transacoes">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {relatorio.transacoes.map((t) => (
            <tr key={t.id}>
              <td>{new Date(t.data).toLocaleDateString("pt-BR")}</td>
              <td>{t.descricao}</td>
              <td>
                <span className="badge-categoria">{t.categoria}</span>
              </td>
              <td className="valor-positivo">{formatarMoeda(t.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- COMPONENTE PRINCIPAL ----

export function RelatorioVendas() {
  const [clienteId, setClienteId] = useState("");
  const { jobId, status, relatorio, erro, carregando, gerarRelatorio, resetar } =
    useRelatorio();

  const handleGerar = async () => {
    if (!clienteId.trim()) return;
    await gerarRelatorio(clienteId.trim());
  };

  const processandoOuPendente = status === "pending" || status === "processing";

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1>Relatório de Vendas Diárias</h1>
        <p className="pagina-sub">
          Geração assíncrona via Open Finance API — a tela não trava enquanto processamos
        </p>
      </div>

      {/* Formulário de geração */}
      {!relatorio && (
        <div className="form-card">
          <label htmlFor="clienteId" className="form-label">
            ID do Cliente
          </label>
          <div className="form-row">
            <input
              id="clienteId"
              type="text"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              placeholder="ex: cliente-x-001"
              className="form-input"
              disabled={carregando}
              onKeyDown={(e) => e.key === "Enter" && handleGerar()}
            />
            <button
              onClick={handleGerar}
              disabled={carregando || !clienteId.trim()}
              className="btn-primary"
            >
              {carregando ? "Gerando..." : "Gerar Relatório"}
            </button>
          </div>

          {/* Status do job */}
          {status && (
            <div className="status-row">
              <StatusBadge status={status} />
              {jobId && (
                <span className="job-id">job: {jobId.slice(0, 8)}...</span>
              )}
            </div>
          )}

          {/* Mensagem de progresso — usuário não fica sem feedback */}
          {processandoOuPendente && (
            <div className="info-box">
              <span>📡</span>
              <p>
                Seu relatório está sendo gerado. Você pode navegar para outras
                telas — <strong>avisaremos quando estiver pronto</strong>.
              </p>
            </div>
          )}

          {/* Erro com opção de tentar novamente */}
          {erro && (
            <div className="erro-box">
              <span>⚠️</span>
              <div>
                <p className="erro-titulo">Não foi possível gerar o relatório</p>
                <p className="erro-detalhe">{erro}</p>
                <button onClick={resetar} className="btn-secondary">
                  Tentar novamente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Relatório gerado com sucesso */}
      {relatorio && (
        <>
          <TabelaTransacoes relatorio={relatorio} />
          <button onClick={resetar} className="btn-secondary btn-novo">
            ← Gerar outro relatório
          </button>
        </>
      )}
    </div>
  );
}
