"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { salvarRegrasGlobais } from "./actions";

export default function FormRegras(p: { horaMinima: string; horaMaxima: string; feriados: string; inicio: string; fim: string }) {
  const router = useRouter();
  const toast = useToast();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="grid lg:grid-cols-2 gap-3 mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await salvarRegrasGlobais(fd);
          setErro(r.ok ? "" : r.mensagem);
          if (r.ok) { toast(r.mensagem); router.refresh(); }
        });
      }}
    >
      <div className="card p-4 space-y-3">
        <div>
          <h2 className="font-display font-bold text-[14px]">Faixa global de horário</h2>
          <p className="help">Nenhuma conta envia antes do início nem depois do fim desta faixa.</p>
          <div className="flex gap-2 mt-2">
            <div><label className="label" htmlFor="horaMinima">Não antes de</label><input id="horaMinima" name="horaMinima" type="time" className="input !w-[130px]" defaultValue={p.horaMinima} /></div>
            <div><label className="label" htmlFor="horaMaxima">Não depois de</label><input id="horaMaxima" name="horaMaxima" type="time" className="input !w-[130px]" defaultValue={p.horaMaxima} /></div>
          </div>
        </div>
        <div>
          <h2 className="font-display font-bold text-[14px]">Sua janela (campanhas do Super Admin)</h2>
          <div className="flex gap-2 mt-2">
            <div><label className="label" htmlFor="inicio">Começa às</label><input id="inicio" name="inicio" type="time" className="input !w-[130px]" defaultValue={p.inicio} /></div>
            <div><label className="label" htmlFor="fim">Termina às</label><input id="fim" name="fim" type="time" className="input !w-[130px]" defaultValue={p.fim} /></div>
          </div>
        </div>
        <p className="help">Envios só de segunda a sábado (domingo não envia).</p>
      </div>
      <div className="card p-4">
        <h2 className="font-display font-bold text-[14px]">Feriados (não envia)</h2>
        <p className="help">Um por linha: <b>DD/MM</b> (todo ano), <b>DD/MM/AAAA</b> (só naquele ano) ou <b>Sexta-feira Santa</b> (calculada todo ano).</p>
        <textarea name="feriados" className="input min-h-[220px] mt-2 font-mono" defaultValue={p.feriados} aria-label="Feriados" />
      </div>
      <div className="lg:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar regras"}</button>
        {erro && <span className="text-[12px] font-semibold text-[#b42318]">{erro}</span>}
      </div>
    </form>
  );
}
