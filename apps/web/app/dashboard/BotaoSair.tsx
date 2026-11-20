"use client";

export default function BotaoSair() {
  async function sair() {
    await fetch("/api/auth/sair", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button className="btn-ghost mt-3" onClick={sair}>
      Sair
    </button>
  );
}
