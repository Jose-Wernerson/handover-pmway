// ============================================================
// PMWAY — Component: StatusBadge
// ============================================================

import type { JobStatus } from "../types";

const CONFIG: Record<
  JobStatus,
  { label: string; className: string; icon: string }
> = {
  pending: {
    label: "Aguardando na fila...",
    className: "badge-pending",
    icon: "⏳",
  },
  processing: {
    label: "Processando dados...",
    className: "badge-processing",
    icon: "⚙️",
  },
  done: {
    label: "Relatório pronto!",
    className: "badge-done",
    icon: "✅",
  },
  failed: {
    label: "Falha ao gerar",
    className: "badge-failed",
    icon: "❌",
  },
};

interface Props {
  status: JobStatus;
}

export function StatusBadge({ status }: Props) {
  const { label, className, icon } = CONFIG[status];
  return (
    <span className={`status-badge ${className}`}>
      {icon} {label}
    </span>
  );
}
