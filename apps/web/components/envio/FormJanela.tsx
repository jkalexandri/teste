"use client";

// Formulário da janela de envio da conta (decisões #6 e #65). Segunda a sábado; feriados nacionais pausam.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { salvarJanelaConta } from "@/app/(app)/configuracoes/actions";

export default function FormJanela({ inicio, fim, faixa, aoSalvar }: { inicio: string; fim: string; faixa: string; aoSalvar?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await salvarJanelaConta(fd);
          setErro(r.ok ? "" : r.mensagem);
          if (r.ok) { toast(r.mensagem); aoSalvar?.(); router.refresh(); }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="janela-inicio">Começa às</label><input id="janela-inicio" name="inicio" type="time" className="input !w-[130px]" defaultValue={inicio} /></div>
        <div><label className="label" htmlFor="janela-fim">Termina às</label><input id="janela-fim" name="fim" type="time" className="input !w-[130px]" defaultValue={fim} /></div>
        <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar janela"}</button>
      </div>
      <p className="help">Segunda a sábado. Domingos e feriados nacionais não enviam. Limite permitido: {faixa}. Fora da janela, a campanha pausa sozinha e continua no próximo horário.</p>
      {erro && <p className="text-[12px] font-semibold text-[#b42318]">{erro}</p>}
    </form>
  );
}
