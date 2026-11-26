"use client";

// Conexão do WhatsApp por QR Code (API própria — decisões #1, #18 e #51).
// Mostra o estado, o QR Code enquanto aguarda a leitura e o número conectado.
// O estado é consultado a cada 3 s enquanto a tela estiver aberta.
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleDashed, MessageCircle, TriangleAlert } from "@/components/icons";
import { useToast } from "./Toast";

type Estado = {
  status: "DESCONECTADO" | "CONECTANDO" | "AGUARDANDO_QR" | "CONECTADO" | "RECONECTANDO";
  numero: string | null;
  qrImagem: string | null;
  erro: string | null;
  conectadoEm: string | null;
  /** Reconexão automática (decisão #139) */
  quedaEm?: string | null;
  tentativaReconexao?: number;
  proximaTentativaEm?: string | null;
};

const CHIP: Record<Estado["status"], { texto: string; estilo: React.CSSProperties }> = {
  CONECTADO: { texto: "Conectado", estilo: { background: "var(--primary-soft)", color: "#087a44" } },
  AGUARDANDO_QR: { texto: "Aguardando leitura do QR Code", estilo: { background: "#fff7e0", color: "#8a5a00" } },
  CONECTANDO: { texto: "Conectando…", estilo: { background: "#fff7e0", color: "#8a5a00" } },
  RECONECTANDO: { texto: "Reconectando…", estilo: { background: "#fff7e0", color: "#8a5a00" } },
  DESCONECTADO: { texto: "Desconectado", estilo: { background: "#f1f3f2", color: "#5b6b62" } },
};

function formatar(n: string | null) {
  if (!n) return "";
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${n}`;
}

export default function ConexaoWhatsapp({ alvo, inicial, titulo, semAjuda }: { alvo: string; inicial: Estado; titulo?: string; semAjuda?: boolean }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado>(inicial);
  const [enviando, setEnviando] = useState(false);

  const atualizar = useCallback(async () => {
    const r = await fetch(`/api/whatsapp/${alvo}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setEstado(await r.json());
  }, [alvo]);

  useEffect(() => {
    const t = window.setInterval(atualizar, 3000);
    return () => window.clearInterval(t);
  }, [atualizar]);

  // Relógio da contagem "próxima em X s" da reconexão (decisão #139)
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (estado.status !== "RECONECTANDO") return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [estado.status]);

  async function agir(acao: "conectar" | "desconectar") {
    if (acao === "desconectar" && !window.confirm(estado.status === "RECONECTANDO"
      ? "Desconectar este WhatsApp? Ele está voltando sozinho. Se desconectar, para usar de novo será preciso ler o QR Code."
      : "Desconectar este WhatsApp? Para usar de novo será preciso ler o QR Code.")) return;
    setEnviando(true);
    const r = await fetch(`/api/whatsapp/${alvo}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false, mensagem: "Não foi possível falar com o servidor." }));
    setEnviando(false);
    if (!r.ok || acao === "desconectar") toast(r.mensagem, r.ok ? "ok" : "erro");
    await atualizar();
  }

  // Fora há mais de 2 h (decisão #142): selo vermelho "Com problema"
  const comProblema = estado.status === "RECONECTANDO" && !!estado.quedaEm && agora - new Date(estado.quedaEm).getTime() >= 2 * 60 * 60_000;
  const chip = comProblema ? { texto: "Com problema", estilo: { background: "#ffeef0", color: "#9e1d2f" } as React.CSSProperties } : CHIP[estado.status];
  const conectado = estado.status === "CONECTADO";
  const emAndamento = estado.status === "CONECTANDO" || estado.status === "AGUARDANDO_QR";
  const reconectando = estado.status === "RECONECTANDO";
  const hora = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
  const faltam = estado.proximaTentativaEm ? Math.ceil((new Date(estado.proximaTentativaEm).getTime() - agora) / 1000) : 0;

  return (
    <div className={semAjuda ? "grid gap-3 mt-3" : "grid lg:grid-cols-[1fr_320px] gap-3 mt-3"}>
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <MessageCircle size={18} style={{ color: "var(--primary)" }} />
          <h2 className="font-display font-bold text-[14px]">{titulo ?? (alvo === "plataforma" ? "Número da plataforma" : "Meu WhatsApp")}</h2>
          <span className="chip" data-testid="status-whatsapp" style={chip.estilo}>{chip.texto}</span>
        </div>

        {conectado && (
          <div className="mt-3 flex items-center gap-2.5 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
            <CircleCheck size={22} style={{ color: "var(--primary)" }} />
            <div>
              <div className="font-bold text-[14px]">{formatar(estado.numero)}</div>
              {estado.conectadoEm && (
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Conectado desde {new Date(estado.conectadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>
        )}

        {estado.status === "AGUARDANDO_QR" && estado.qrImagem && (
          <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={estado.qrImagem} alt="QR Code para conectar o WhatsApp" width={264} height={264} className="rounded-xl bg-white p-2" style={{ border: "1px solid var(--border)" }} />
            <ol className="text-[12px] leading-relaxed list-decimal pl-4 space-y-1" style={{ color: "var(--muted)" }}>
              <li>Abra o WhatsApp no celular.</li>
              <li>Toque em <b>Mais opções</b> (⋮) ou <b>Configurações</b>.</li>
              <li>Toque em <b>Dispositivos conectados</b> e depois em <b>Conectar dispositivo</b>.</li>
              <li>Aponte o celular para este QR Code.</li>
              <li>O QR Code muda sozinho a cada poucos segundos — use sempre o que está na tela.</li>
            </ol>
          </div>
        )}

        {(estado.status === "CONECTANDO" || (estado.status === "AGUARDANDO_QR" && !estado.qrImagem)) && (
          <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: "var(--muted)" }}>
            <CircleDashed size={16} className="animate-spin" /> Preparando a conexão…
          </div>
        )}

        {/* Reconexão automática (decisão #139): explica o que acontece; o login continua salvo */}
        {reconectando && (
          <div className="mt-3 rounded-xl p-3 text-[12px] leading-relaxed" style={{ background: "#fff7e0", color: "#8a5a00" }} data-testid="reconectando">
            <div className="flex items-center gap-2 font-bold">
              <CircleDashed size={16} className="animate-spin shrink-0" />
              {estado.quedaEm ? `A conexão caiu às ${hora(estado.quedaEm)} e está voltando sozinha.` : "A conexão está voltando sozinha."}
            </div>
            <p className="mt-0.5">
              {(estado.tentativaReconexao ?? 0) > 0 ? `Tentativa ${estado.tentativaReconexao} — ` : ""}
              {faltam > 0 ? `próxima em ${faltam >= 60 ? `${Math.ceil(faltam / 60)} min` : `${faltam} s`}.` : "tentando agora…"}
            </p>
            {comProblema && (
              <p className="mt-0.5 font-bold" style={{ color: "#9e1d2f" }} data-testid="com-problema">
                Está fora há mais de 2 horas. Toque em Tentar agora; se não voltar, confira o celular (internet ligada e WhatsApp aberto).
              </p>
            )}
            <p className="mt-0.5" style={{ color: "var(--muted)" }}>
              Não precisa ler o QR Code: o login continua salvo. Campanhas e respostas da IA esperam e continuam quando voltar.
            </p>
          </div>
        )}

        {estado.status === "DESCONECTADO" && estado.erro && (
          <div className="mt-3 flex gap-2 rounded-xl p-3 text-[12px]" style={{ background: "#ffeef0", color: "#9e1d2f" }}>
            <TriangleAlert size={16} className="shrink-0" /> {estado.erro}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          {reconectando && (
            <>
              <button className="btn-primary" disabled={enviando} onClick={() => agir("conectar")} data-testid="tentar-agora">
                {enviando ? "Aguarde…" : "Tentar agora"}
              </button>
              <button className="btn-ghost" style={{ color: "#b42318" }} disabled={enviando} onClick={() => agir("desconectar")}>Desconectar</button>
            </>
          )}
          {!conectado && !emAndamento && !reconectando && (
            <button className="btn-primary" disabled={enviando} onClick={() => agir("conectar")}>
              {enviando ? "Aguarde…" : "Conectar WhatsApp"}
            </button>
          )}
          {(conectado || emAndamento) && (
            <button className="btn-ghost" style={{ color: "#b42318" }} disabled={enviando} onClick={() => agir("desconectar")}>
              {emAndamento ? "Cancelar" : "Desconectar"}
            </button>
          )}
        </div>
      </div>

      {/* Com vários números, a ajuda aparece só no primeiro (etapa 10c) */}
      {!semAjuda && <div className="card p-4 self-start">
        <h3 className="font-display font-bold text-[13px]">Como funciona</h3>
        <ul className="text-[12px] leading-relaxed mt-1.5 space-y-1.5" style={{ color: "var(--muted)" }}>
          {alvo === "plataforma" ? (
            <>
              <li>Este é o número que envia os avisos do sistema: novos pedidos para você e links de renovação para os clientes.</li>
              <li>Use um número só para isso, de preferência um chip dedicado.</li>
            </>
          ) : (
            <>
              <li>Suas mensagens saem do seu próprio número. Ninguém mais usa a sua conexão.</li>
              <li>A conexão continua ativa mesmo com o site fechado.</li>
            </>
          )}
          <li>Mantenha o celular com internet de vez em quando — se ficar muitos dias desligado, o WhatsApp desconecta.</li>
          <li>Se desconectar pelo celular, volte aqui e leia o QR Code de novo.</li>
        </ul>
      </div>}
    </div>
  );
}
