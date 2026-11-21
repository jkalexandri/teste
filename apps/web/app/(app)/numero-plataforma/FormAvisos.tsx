"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/app/Toast";
import { enviarTeste, salvarNumeroAvisos } from "./actions";

export default function FormAvisos({ numeroAvisos }: { numeroAvisos: string }) {
  const toast = useToast();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="card p-4 mt-3 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await salvarNumeroAvisos(fd);
          setErro(r.ok ? "" : r.mensagem);
          if (r.ok) toast(r.mensagem);
        });
      }}
    >
      <h2 className="font-display font-bold text-[14px]">Seu WhatsApp para os avisos</h2>
      <div className="max-w-[360px]">
        <label className="label" htmlFor="numeroAvisos">WhatsApp que recebe os avisos de novo pedido</label>
        <input id="numeroAvisos" name="numeroAvisos" className="input" defaultValue={numeroAvisos} placeholder="(11) 99999-9999" />
      </div>
      <p className="help">O número da plataforma (acima) envia para este número um aviso a cada novo pedido. Deixe vazio para não receber.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
        <button
          type="button"
          className="btn-ghost"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await enviarTeste();
              toast(r.mensagem, r.ok ? "ok" : "erro");
            })
          }
        >
          Enviar mensagem de teste
        </button>
        {erro && <span className="text-[12px] font-semibold text-[#b42318]">{erro}</span>}
      </div>
    </form>
  );
}
