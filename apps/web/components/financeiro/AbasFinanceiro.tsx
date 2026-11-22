// Abas da gestão financeira (decisão #106).
import Link from "next/link";

const ABAS = [
  { href: "/financeiro", rotulo: "Painel" },
  { href: "/financeiro/lancamentos", rotulo: "Lançamentos" },
  { href: "/financeiro/contas", rotulo: "Contas a pagar e receber" },
  { href: "/financeiro/fixas", rotulo: "Despesas fixas" },
  { href: "/financeiro/relatorios", rotulo: "Relatórios" },
  { href: "/financeiro/configuracoes", rotulo: "Configurações" },
];

export default function AbasFinanceiro({ atual }: { atual: string }) {
  return (
    <nav className="flex flex-wrap gap-1.5 mt-3 nao-imprimir" aria-label="Financeiro">
      {ABAS.map((a) => (
        <Link key={a.href} href={a.href} className={a.href === atual ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"} aria-current={a.href === atual ? "page" : undefined}>{a.rotulo}</Link>
      ))}
    </nav>
  );
}
