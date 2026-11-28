"use client";

// Campo de texto que abre um editor grande em popup, centralizado na tela (decisão #120).
// O campo pequeno só mostra o texto; ao clicar nele, abre o popup para escrever com espaço.
// "Salvar" aplica o texto e envia o formulário da tela; "Cancelar" (ou Esc) descarta o que mudou no popup.
// Com "sugestao" (decisão #121): botão "Texto sugestão" preenche o texto padrão e uma faixa amarela pede para trocar
// os textos entre colchetes [ ] pelas informações reais.
import { useEffect, useRef, useState } from "react";
import { X } from "@/components/icons";

type Props = {
  id: string;
  name: string;
  rotulo: string;
  valorInicial: string;
  maxLength: number;
  placeholder?: string;
  ajuda?: string;
  /** Altura do campo pequeno (classe do Tailwind) */
  alturaCampo?: string;
  /** Texto sugestão (botão "Texto sugestão" no popup) */
  sugestao?: string;
  /** Nome do botão da sugestão (padrão: "Texto sugestão") */
  rotuloSugestao?: string;
  /** Faixa amarela e confirmação quando há colchetes (padrão: sim). O Super Admin, editando a sugestão, não precisa. */
  avisarColchetes?: boolean;
  /** Guarda uma cópia do que foi escrito NESTE navegador (decisão #182): se o texto salvo sumir, oferece restaurar. */
  guardarRascunho?: boolean;
};

import { colchetesPendentes } from "@/lib/colchetes";
const resumo = (l: string[]) => l.slice(0, 3).map((c) => (c.length > 40 ? c.slice(0, 40) + "…]" : c)).join("  ") + (l.length > 3 ? `  (+${l.length - 3})` : "");

export default function CampoTextoGrande({ id, name, rotulo, valorInicial, maxLength, placeholder, ajuda, alturaCampo = "min-h-[70px]", sugestao, rotuloSugestao = "Texto sugestão", avisarColchetes = true, guardarRascunho = false }: Props) {
  const [valor, setValor] = useState(valorInicial);
  const [rascunho, setRascunho] = useState(valorInicial);
  const [aberto, setAberto] = useState(false);
  const pendentes = avisarColchetes ? colchetesPendentes(rascunho, sugestao) : [];
  const campo = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);

  // Texto salvo de novo no servidor (ex.: tela atualizada): acompanha
  // Decisão #182: uma atualização atrasada da tela (texto antigo/vazio) NÃO pode zerar o que a pessoa acabou de escrever e ainda não foi confirmado como salvo.
  const pendente = useRef(false);
  useEffect(() => {
    if (pendente.current && !valorInicial.trim()) return; // chegou "vazio" enquanto há texto novo aguardando salvar: ignora
    pendente.current = false;
    setValor(valorInicial);
  }, [valorInicial]);

  // Cópia no navegador (decisão #182): guardada a cada "Salvar" do editor. Se a tela abrir com o texto do servidor VAZIO e houver cópia aqui, oferece restaurar.
  const chaveCopia = `filapro-copia-${id}`;
  const [copia, setCopia] = useState("");
  useEffect(() => {
    if (!guardarRascunho) return;
    try { const c = localStorage.getItem(chaveCopia) ?? ""; setCopia(!valorInicial.trim() && c.trim() ? c : ""); } catch { /* sem armazenamento */ }
  }, [guardarRascunho, chaveCopia, valorInicial]);

  function abrir() {
    setRascunho(valor);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    campo.current?.blur();
  }

  // Foco no fim do texto ao abrir; Esc fecha sem aplicar
  useEffect(() => {
    if (!aberto) return;
    const t = editor.current;
    if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  /** Preenche com o texto sugestão (pergunta antes de apagar o que já foi escrito) */
  function usarSugestao() {
    if (!sugestao) return;
    if (rascunho.trim() && rascunho !== sugestao && !window.confirm("Substituir o texto atual pela sugestão?")) return;
    setRascunho(sugestao.slice(0, maxLength));
    editor.current?.focus();
    editor.current?.setSelectionRange(0, 0);
    if (editor.current) editor.current.scrollTop = 0;
  }

  function salvar() {
    const pend = avisarColchetes ? colchetesPendentes(rascunho, sugestao) : [];
    if (pend.length && !window.confirm(`Ainda há ${pend.length} texto(s) do modelo entre colchetes para trocar:\n${resumo(pend)}\n\nSalvar mesmo assim?`)) return;
    setValor(rascunho);
    pendente.current = rascunho.trim() !== valorInicial.trim();
    if (guardarRascunho) { try { if (rascunho.trim()) localStorage.setItem(chaveCopia, rascunho); } catch { /* sem armazenamento */ } }
    setAberto(false);
    // Envia o formulário da tela depois de o campo receber o texto novo
    const form = campo.current?.form;
    if (form) setTimeout(() => form.requestSubmit(), 0);
  }

  return (
    <>
      {copia && (
        <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ background: "#fff7e0", color: "#8a5a00", border: "1px solid #f5d48a" }} data-testid={`copia-${name}`}>
          O texto salvo está vazio, mas há uma <b>cópia de {copia.length.toLocaleString("pt-BR")} caracteres neste navegador</b>.{" "}
          <button type="button" className="underline font-bold" data-testid={`restaurar-copia-${name}`} onClick={() => { setValor(copia); setCopia(""); }}>Restaurar no campo</button>{" "}
          (depois clique em Salvar) ·{" "}
          <button type="button" className="underline" onClick={() => { try { localStorage.removeItem(chaveCopia); } catch { /* sem armazenamento */ } setCopia(""); }}>Descartar a cópia</button>
        </div>
      )}
      <textarea
        ref={campo}
        id={id}
        name={name}
        className={`input ${alturaCampo} cursor-pointer`}
        value={valor}
        readOnly
        placeholder={placeholder}
        onClick={abrir}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } }}
        aria-haspopup="dialog"
        data-testid={`campo-${name}`}
      />
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }}
          role="dialog" aria-modal="true" aria-label={rotulo} onClick={fechar} data-testid={`editor-${name}`}>
          <div className="card w-full max-w-[960px] p-4 flex flex-col" style={{ height: "min(80vh, 720px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display font-extrabold text-[16px]">{rotulo}</h2>
                {ajuda && <p className="help mt-0.5">{ajuda}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {sugestao && (
                  <button type="button" className="btn-ghost !py-1.5 !px-3 !text-[12px]" onClick={usarSugestao} data-testid={`sugestao-${name}`}>{rotuloSugestao}</button>
                )}
                <button type="button" className="btn-ghost !p-2" onClick={fechar} aria-label="Fechar sem salvar"><X size={16} /></button>
              </div>
            </div>
            {avisarColchetes && pendentes.length > 0 && (
              <div className="mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "#fff7e0", color: "#8a5a00", border: "1px solid #f5d48a" }} data-testid={`aviso-colchetes-${name}`}>
                Troque os textos entre colchetes [ ] pelas informações reais. Exemplo: [NOME DA IA] → Sofia.
                <span className="block font-normal mt-0.5" data-testid={`colchetes-achados-${name}`}>Ainda faltam trocar ({pendentes.length}): {resumo(pendentes)}</span>
              </div>
            )}
            <textarea
              ref={editor}
              className="input flex-1 mt-3 !text-[14px] leading-relaxed resize-none"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              maxLength={maxLength}
              placeholder={placeholder}
              aria-label={rotulo}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>{rascunho.length} de {maxLength} caracteres</span>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={fechar}>Cancelar</button>
                <button type="button" className="btn-primary" onClick={salvar} data-testid={`salvar-${name}`}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
