"use client";

// Texto do botão "Sobre" do login (decisão #189) — só o Super Admin. Vazio = texto padrão.
import { useTransition } from "react";
import { useToast } from "@/components/app/Toast";
import CampoTextoGrande from "@/components/app/CampoTextoGrande";
import { MAX_SOBRE, SOBRE_PADRAO } from "@/lib/sobre";
import { salvarSobre } from "./actions";

export default function EditorSobre({ inicial }: { inicial: string }) {
  const toast = useToast();
  const [salvando, salvar] = useTransition();
  return (
    <div className="card p-4 mt-3" data-testid="editor-sobre">
      <h2 className="font-display font-extrabold text-[16px]">Texto do “Sobre” do login</h2>
      <p className="help">É o que aparece quando o visitante clica em <b>Sobre</b> na barra de menu do login. Separe os parágrafos com uma linha em branco; endereços que começam com https:// viram links. Os links de Termos e Privacidade e a versão aparecem sempre embaixo. Vazio = texto padrão.</p>
      <form className="mt-2" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        salvar(async () => { const r = await salvarSobre(f); toast(r.mensagem, r.ok ? "ok" : "erro"); });
      }}>
        <CampoTextoGrande id="ev-sobre" name="sobreTexto" rotulo="Texto do Sobre" valorInicial={inicial} maxLength={MAX_SOBRE} sugestao={SOBRE_PADRAO} rotuloSugestao="Texto padrão" avisarColchetes={false}
          placeholder="Vazio = texto padrão. Ex.: quem somos, o que o FilaPro Leads faz, contato…" ajuda="Aparece para quem ainda não é cliente." />
        <div className="flex items-center justify-between gap-2 mt-2">
          <p className="text-[12px] font-bold" style={{ color: inicial.trim() ? "#087a44" : "#8a5a00" }} data-testid="estado-sobre">
            {inicial.trim() ? `Texto salvo: ${inicial.trim().length.toLocaleString("pt-BR")} caracteres` : "Usando o texto padrão."}
          </p>
          <button type="submit" className="btn-primary" disabled={salvando} data-testid="salvar-sobre">Salvar texto do Sobre</button>
        </div>
      </form>
    </div>
  );
}
