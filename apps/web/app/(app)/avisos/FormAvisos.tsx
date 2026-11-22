"use client";

// Formulário de Avisos (etapa 10b): número, liga/desliga de cada tipo e aviso de teste.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { salvarAvisos, testarAviso } from "./actions";
import AtivarCelular from "./AtivarCelular";

const TIPOS = [
  { campo: "avisoQuente", rotulo: "Lead qualificado (Quente)", dica: "Quando a IA classifica um lead como Quente." },
  { campo: "avisoAnuncio", rotulo: "Lead novo de anúncio", dica: "Quando chega um lead do Google Ads ou Facebook/Instagram." },
  { campo: "avisoRespondeu", rotulo: "Lead respondeu", dica: "Quando um lead responde (menos SAIR, PARAR, STOP e CANCELAR)." },
] as const;

export default function FormAvisos({ inicial }: {
  inicial: { numeroAvisos: string; whatsapp: string; avisoQuente: boolean; avisoAnuncio: boolean; avisoRespondeu: boolean; avisoCelular: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="card p-4 mt-3 max-w-[640px]"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => { const r = await salvarAvisos(fd); toast(r.mensagem, r.ok ? "ok" : "erro"); router.refresh(); });
      }}
    >
      <label className="label" htmlFor="numeroAvisos">WhatsApp que recebe os avisos</label>
      <input id="numeroAvisos" name="numeroAvisos" className="input" defaultValue={inicial.numeroAvisos} placeholder={inicial.whatsapp || "(11) 98765-4321"} />
      <p className="help mt-0.5">{inicial.whatsapp ? `Em branco: usa o seu WhatsApp do cadastro (${inicial.whatsapp}).` : "Informe DDD + número."}</p>

      <div className="grid gap-2 mt-3">
        {TIPOS.map((t) => (
          <label key={t.campo} className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" name={t.campo} defaultChecked={inicial[t.campo]} className="w-4 h-4 mt-0.5 accent-emerald-600" />
            <span><b className="text-[13px]">{t.rotulo}</b><span className="help block">{t.dica}</span></span>
          </label>
        ))}
      </div>
      {/* Notificações no celular (app — decisão #99) */}
      <label className="flex items-start gap-2 cursor-pointer mt-3">
        <input type="checkbox" name="avisoCelular" defaultChecked={inicial.avisoCelular} className="w-4 h-4 mt-0.5 accent-emerald-600" />
        <span><b className="text-[13px]">Receber também no celular (app)</b><span className="help block">Os mesmos avisos chegam como notificação do FilaPro Leads nos aparelhos ativados abaixo.</span></span>
      </label>
      <AtivarCelular />
      <p className="help mt-3">Muitos avisos juntos viram um resumo: o primeiro chega na hora e os seguintes, em até 10 minutos, chegam juntos.</p>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" className="btn-ghost" disabled={pendente} onClick={() => iniciar(async () => { const r = await testarAviso(); toast(r.mensagem, r.ok ? "ok" : "erro"); })}>Enviar aviso de teste</button>
        <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}
