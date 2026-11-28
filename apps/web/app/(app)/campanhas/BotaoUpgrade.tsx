"use client";

// Abre o popup de upgrade do topo (AppShell) — usado na tela de Campanhas do plano só de Redes Sociais (decisão #185).
export default function BotaoUpgrade() {
  return <button type="button" className="btn-primary mt-3" data-testid="ir-upgrade" onClick={() => window.dispatchEvent(new Event("filapro:abrir-upgrade"))}>Fazer upgrade</button>;
}
