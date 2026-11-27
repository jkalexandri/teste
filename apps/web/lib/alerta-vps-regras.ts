// Regras puras dos avisos da VPS (decisão #171): quando avisar, lembrar e resolver. Sem banco e sem e-mail (testável à parte).
export type Nivel = "ok" | "aviso" | "critico";
export type ItemRelatorio = { id: string; nivel: Nivel; valor?: string };

type Regra = { titulo: string; oQueFazer: string; persistencia: number; lembreteHoras?: number };
const H = 3600_000;

/** Verificações conhecidas. Qualquer outro código recebido é ignorado (não cria linhas no banco). */
export const REGRAS: Record<string, Regra> = {
  backup: { titulo: "backup completo diário atrasado ou com falha", persistencia: 1,
    oQueFazer: 'Na VPS: "tail -n 20 /var/log/filapro-backup.log" e "bash /opt/filapro/app/deploy/backup-completo.sh completo". Confira também "bash /opt/filapro/app/deploy/diagnostico-vps.sh | grep -E \'ATENCAO|FALHA\'".' },
  backup6h: { titulo: "dump do banco (a cada 6 horas) atrasado ou com falha", persistencia: 1,
    oQueFazer: 'Na VPS: "tail -n 20 /var/log/filapro-backup.log" e "bash /opt/filapro/app/deploy/backup-completo.sh banco".' },
  backupExterno: { titulo: "cópia do backup fora da VPS (Backblaze B2) atrasada ou com falha", persistencia: 1,
    oQueFazer: 'Na VPS: "tail -n 20 /var/log/filapro-backup-externo.log" e "bash /opt/filapro/app/deploy/backup-externo.sh --conferir". Se o B2 recusou a chave, crie outra e rode "bash /opt/filapro/app/deploy/backup-externo-config.sh --trocar-chave". Sem essa cópia, perder a VPS é perder tudo.' },
  dependencias: { titulo: "vulnerabilidade alta/crítica em dependência do sistema", persistencia: 1, lembreteHoras: 24 * 7,
    oQueFazer: 'Na VPS: "bash /opt/filapro/app/deploy/auditar-dependencias.sh" mostra qual pacote. Peça ao desenvolvedor para atualizá-lo; se for uma exceção justificada, ela é registrada em deploy/dependencias-aceitas.txt com prazo de reavaliação.' },
  ensaio: { titulo: "ensaio do desastre falhou ou está atrasado", persistencia: 1,
    oQueFazer: 'Na VPS: "bash /opt/filapro/app/deploy/ensaio-desastre.sh" e leia qual passo falhou (baixar do B2, abrir as chaves, restaurar o banco). Um backup que não restaura é a falha mais perigosa: trate com prioridade.' },
  restauracao: { titulo: "teste de restauração do backup falhou ou está atrasado", persistencia: 1,
    oQueFazer: 'Na VPS: "bash /opt/filapro/app/deploy/restaurar-backup.sh --so-testar" (só confere, não altera o banco real) e leia a mensagem de erro.' },
  disco: { titulo: "pouco espaço livre no disco da VPS", persistencia: 1,
    oQueFazer: 'Na VPS: "df -h /" e "du -xh /opt/filapro /var/log --max-depth=2 | sort -h | tail -15". Disco cheio derruba o banco e o backup.' },
  memoria: { titulo: "memória da VPS no limite", persistencia: 2,
    oQueFazer: 'Na VPS: "free -h" e "pm2 status". Se persistir, os processos podem ser encerrados pelo sistema.' },
  reinicio: { titulo: "a VPS precisa ser reiniciada (atualização de segurança)", persistencia: 1, lembreteHoras: 24 * 7,
    oQueFazer: "Faça o reinício controlado quando houver pouco movimento: veja o passo a passo em docs/publicacao-vps.md (Reinício controlado da VPS)." },
  relogio: { titulo: "relógio da VPS sem sincronização", persistencia: 1,
    oQueFazer: 'Na VPS: "timedatectl" e "systemctl restart systemd-timesyncd". Com o relógio errado, os códigos da verificação em duas etapas são recusados.' },
  certificado: { titulo: "certificado HTTPS perto de vencer", persistencia: 1,
    oQueFazer: 'Na VPS: "systemctl status caddy" e "journalctl -u caddy -n 40 --no-pager". O Caddy renova sozinho: se está perto de vencer, a renovação está falhando.' },
};

/** Limpa o valor vindo da VPS: só letras, números e pontuação simples, até 60 caracteres. */
export function limparValor(v: unknown): string {
  return typeof v === "string" ? v.replace(/[^\p{L}\p{N} ,.:%/()+-]/gu, "").slice(0, 60).trim() : "";
}

export type EstadoItem = { avisouEm: Date | null; foraDesde: Date | null; ultimoAvisoEm: Date | null; contagem: number; nivel: string | null };
export type Decisao = { acao: "avisar" | "lembrar" | "resolver" | "nada"; novo: EstadoItem };

/** Regra pura (testada à parte): dado o item do relatório e o estado guardado, o que fazer agora? */
export function decidir(item: { nivel: Nivel }, regra: Pick<Regra, "persistencia" | "lembreteHoras">, e: EstadoItem, agora: Date): Decisao {
  if (item.nivel === "ok") {
    const novo: EstadoItem = { avisouEm: null, foraDesde: null, ultimoAvisoEm: null, contagem: 0, nivel: null };
    return { acao: e.avisouEm ? "resolver" : "nada", novo };
  }
  const contagem = e.contagem + 1;
  const base: EstadoItem = { ...e, contagem, nivel: item.nivel };
  if (!e.avisouEm) {
    if (contagem < regra.persistencia) return { acao: "nada", novo: base };
    return { acao: "avisar", novo: { ...base, avisouEm: agora, foraDesde: e.foraDesde ?? agora, ultimoAvisoEm: agora } };
  }
  // Já avisado: piorou (aviso → crítico) avisa na hora; senão lembra a cada 24 h (6 h se crítico; ou o prazo próprio da regra)
  if (item.nivel === "critico" && e.nivel !== "critico") return { acao: "avisar", novo: { ...base, ultimoAvisoEm: agora } };
  const intervalo = (item.nivel === "critico" ? 6 : (regra.lembreteHoras ?? 24)) * H;
  if (!e.ultimoAvisoEm || agora.getTime() - e.ultimoAvisoEm.getTime() >= intervalo) return { acao: "lembrar", novo: { ...base, ultimoAvisoEm: agora } };
  return { acao: "nada", novo: base };
}

