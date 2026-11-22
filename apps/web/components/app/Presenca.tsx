"use client";

// Presença e comunicação (decisão #102): sinal de online a cada 45 s, popup das mensagens do Super Admin (fecha com OK)
// e botão Suporte (clientes), que abre sozinho quando o Super Admin chama.
import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ChatSuporte from "./ChatSuporte";
import TelaManutencao from "./TelaManutencao";

type Comunicado = { id: string; titulo: string; texto: string; link: string | null };

export default function Presenca({ cliente, manutencaoInicial = false }: { cliente: boolean; manutencaoInicial?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [comunicado, setComunicado] = useState<Comunicado | null>(null);
  const [suporte, setSuporte] = useState({ naoLidas: 0, chamado: false });
  const [aberto, setAberto] = useState(false);
  // Atualização em andamento (decisão #103): só para clientes; o Super Admin continua usando
  const [manutencao, setManutencao] = useState(manutencaoInicial);

  const sinal = useCallback(async () => {
    const app = window.matchMedia("(display-mode: standalone)").matches;
    const resp = await fetch("/api/presenca", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tela: window.location.pathname, app }) }).catch(() => null);
    // 503 = servidor em atualização (resposta do site ou do Caddy enquanto reinicia)
    if (resp && [502, 503, 504].includes(resp.status) && cliente) { setManutencao(true); return; }
    const r = resp ? await resp.json().catch(() => null) : null;
    if (!r?.ok) return;
    if (r.manutencao && cliente) { setManutencao(true); return; }
    setComunicado((atual) => atual ?? r.comunicado);
    setSuporte(r.suporte);
    if (cliente && r.suporte.chamado) setAberto(true);
  }, [cliente]);

  useEffect(() => { void sinal(); }, [pathname, sinal]);
  useEffect(() => {
    const t = setInterval(() => void sinal(), 45_000);
    const vis = () => { if (document.visibilityState === "visible") void sinal(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [sinal]);
  useEffect(() => { if (cliente && sp.get("suporte") === "1") setAberto(true); }, [cliente, sp]);

  async function ok() {
    if (!comunicado) return;
    const id = comunicado.id;
    setComunicado(null);
    await fetch(`/api/comunicados/${id}`, { method: "POST" }).catch(() => undefined);
    void sinal(); // próxima mensagem pendente, se houver
  }

  return (
    <>
      {manutencao && <TelaManutencao />}
      {comunicado && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(10,20,15,.6)" }} role="alertdialog" aria-modal="true" aria-label="Mensagem do FilaPro Leads" data-testid="popup-comunicado">
          <div className="card w-full max-w-[460px] p-5 text-center">
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--primary)" }}>Mensagem do FilaPro Leads</p>
            <h2 className="font-display font-extrabold text-[19px] mt-1">{comunicado.titulo}</h2>
            <p className="text-[14px] mt-2 whitespace-pre-wrap leading-relaxed text-left">{comunicado.texto}</p>
            {comunicado.link && <a href={comunicado.link} target="_blank" rel="noreferrer noopener" className="underline font-bold text-[13px] mt-2 inline-block" style={{ color: "var(--primary)" }}>Abrir o link</a>}
            <button type="button" className="btn-primary w-full justify-center mt-4" onClick={ok} autoFocus>OK</button>
          </div>
        </div>
      )}
      {cliente && (
        <>
          {aberto && (
            <div className="fixed z-[80] bottom-16 left-3 right-3 sm:right-auto sm:w-[380px] lg:left-[248px] card overflow-hidden shadow-xl" data-testid="janela-suporte">
              <div className="flex items-center justify-between px-3 py-2" style={{ background: "#0b2f1f", color: "#fff" }}>
                <b className="text-[13px]">Suporte FilaPro Leads</b>
                <button type="button" onClick={() => setAberto(false)} aria-label="Fechar o suporte" className="text-[18px] leading-none px-1">×</button>
              </div>
              <ChatSuporte modo="cliente" altura={300} />
            </div>
          )}
          <button type="button" className="fixed z-[80] bottom-3 left-3 lg:left-[248px] btn-primary !rounded-full shadow-lg nao-imprimir" onClick={() => setAberto((a) => !a)} data-testid="botao-suporte">
            💬 Suporte{suporte.naoLidas > 0 && <span className="ml-1 rounded-full px-1.5 text-[11px] font-extrabold" style={{ background: "#e5484d", color: "#fff" }} data-testid="suporte-nao-lidas">{suporte.naoLidas}</span>}
          </button>
        </>
      )}
    </>
  );
}
