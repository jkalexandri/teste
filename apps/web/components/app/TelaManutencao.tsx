"use client";

// Tela "Sistema em atualização" (decisão #103): fica por cima de tudo e impede qualquer ação.
// Confere a cada 10 s se terminou; quando termina, recarrega a página (o texto do chat do suporte fica guardado).
import { useEffect } from "react";

export default function TelaManutencao({ dispensar }: { dispensar?: { rotulo: string; acao: () => void } }) {
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch("/api/manutencao", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (r && r.manutencao === false) window.location.reload();
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" style={{ background: "rgba(6,18,12,.82)", backdropFilter: "blur(3px)" }}
      role="alertdialog" aria-modal="true" aria-label="Sistema em atualização" data-testid="tela-manutencao">
      <div className="w-full max-w-[420px] rounded-2xl p-6 text-center shadow-2xl" style={{ background: "#0b2f1f", color: "#eafff3", border: "1px solid rgba(46,224,127,.35)" }}>
        <div className="mx-auto mb-3 h-10 w-10 rounded-full animate-spin" style={{ border: "3px solid rgba(46,224,127,.25)", borderTopColor: "#2ee07f" }} aria-hidden />
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#2ee07f" }}>FilaPro Leads</p>
        <h2 className="text-[20px] font-extrabold mt-1">Sistema em atualização</h2>
        <p className="text-[13px] mt-2 leading-relaxed" style={{ color: "#bfe8d0" }}>
          Estamos instalando melhorias. Leva poucos minutos e esta tela se atualiza sozinha quando terminar.
          Suas campanhas continuam de onde pararam.
        </p>
        {dispensar && (
          <button type="button" className="mt-4 text-[12px] underline" style={{ color: "#9fdcbc" }} onClick={dispensar.acao}>{dispensar.rotulo}</button>
        )}
      </div>
    </div>
  );
}
