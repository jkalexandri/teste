"use client";

// "Receber também no celular (app)" — decisão #99: inscreve este aparelho nas notificações do app.
// No iPhone só funciona com o FilaPro Leads instalado na tela inicial (iOS 16.4 ou mais novo).
import { useEffect, useState } from "react";
import { useToast } from "@/components/app/Toast";

function chaveParaBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bruto = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

export default function AtivarCelular() {
  const toast = useToast();
  const [estado, setEstado] = useState<"carregando" | "sem-suporte" | "bloqueado" | "ativo" | "inativo" | "sem-chave">("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("sem-suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "inativo");
    })().catch(() => setEstado("sem-suporte"));
  }, []);

  async function ativar() {
    setOcupado(true);
    try {
      const { chave } = (await fetch("/api/push").then((r) => r.json())) as { chave: string };
      if (!chave) { setEstado("sem-chave"); return; }
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") { setEstado(permissao === "denied" ? "bloqueado" : "inativo"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
      const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) }).then((x) => x.json());
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) setEstado("ativo");
    } catch {
      toast("Não foi possível ativar neste aparelho.", "erro");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEstado("inativo");
      toast("Notificações desativadas neste aparelho.", "ok");
    } finally {
      setOcupado(false);
    }
  }

  const texto: Record<typeof estado, string> = {
    carregando: "Verificando…",
    "sem-suporte": "Este navegador não recebe notificações. No iPhone, instale o FilaPro Leads na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.",
    bloqueado: "As notificações estão bloqueadas para este site. Libere nas configurações do navegador ou do celular.",
    ativo: "Este aparelho recebe as notificações.",
    inativo: "Este aparelho ainda não recebe as notificações.",
    "sem-chave": "As notificações ainda não foram configuradas no servidor.",
  };
  return (
    <div className="rounded-xl p-3 mt-3" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }} data-testid="ativar-celular">
      <p className="text-[12px]" data-estado={estado}>{texto[estado]}</p>
      {(estado === "inativo" || estado === "ativo") && (
        <button type="button" className={estado === "ativo" ? "btn-ghost mt-2" : "btn-primary mt-2"} disabled={ocupado} onClick={estado === "ativo" ? desativar : ativar}>
          {estado === "ativo" ? "Desativar neste aparelho" : "Ativar notificações neste aparelho"}
        </button>
      )}
    </div>
  );
}
