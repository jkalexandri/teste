"use client";

// Campo de texto que abre um editor grande em popup, centralizado na tela (decisão #120).
// O campo pequeno só mostra o texto; ao clicar nele, abre o popup para escrever com espaço.
// "Salvar" aplica o texto e envia o formulário da tela; "Cancelar" (ou Esc) descarta o que mudou no popup.
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
};

export default function CampoTextoGrande({ id, name, rotulo, valorInicial, maxLength, placeholder, ajuda, alturaCampo = "min-h-[70px]" }: Props) {
  const [valor, setValor] = useState(valorInicial);
  const [rascunho, setRascunho] = useState(valorInicial);
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);

  // Texto salvo de novo no servidor (ex.: tela atualizada): acompanha
  useEffect(() => { setValor(valorInicial); }, [valorInicial]);

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

  function salvar() {
    setValor(rascunho);
    setAberto(false);
    // Envia o formulário da tela depois de o campo receber o texto novo
    const form = campo.current?.form;
    if (form) setTimeout(() => form.requestSubmit(), 0);
  }

  return (
    <>
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
              <button type="button" className="btn-ghost !p-2" onClick={fechar} aria-label="Fechar sem salvar"><X size={16} /></button>
            </div>
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
