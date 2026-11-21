// Janela de envio (decisões #6 e #65): conta (Admin da Empresa / usuário Individual) e regras globais (Super Admin).
import "server-only";
import { horaParaMin } from "@filapro/db";

/** Lê "início" e "fim" (HH:MM) do formulário e confere a faixa global. */
export function lerJanela(form: FormData, global: { horaMinima: number; horaMaxima: number }) {
  const inicio = horaParaMin(String(form.get("inicio") ?? ""));
  const fim = horaParaMin(String(form.get("fim") ?? ""));
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return { erro: "Informe os horários no formato HH:MM." } as const;
  if (fim <= inicio) return { erro: "O horário final precisa ser depois do inicial." } as const;
  if (inicio < global.horaMinima || fim > global.horaMaxima) {
    const h = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return { erro: `A janela precisa ficar entre ${h(global.horaMinima)} e ${h(global.horaMaxima)} (limite definido pelo Super Admin).` } as const;
  }
  return { inicio, fim } as const;
}
