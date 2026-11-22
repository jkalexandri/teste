// Proteção das páginas: sem cookie de sessão, volta para o login.
// Também repassa o caminho atual (x-pathname) para o layout conferir
// se o perfil pode abrir a tela. A validação completa da sessão (banco)
// acontece no layout de cada área.
// Modo manutenção (decisão #103): durante a atualização, recusa qualquer ação (formulários, botões e rotas da API)
// de quem não é Super Admin. As páginas abrem, mas mostram a tela "Sistema em atualização".
import { NextResponse, type NextRequest } from "next/server";
import { MSG_MANUTENCAO, emManutencao, tokenDeSuperAdmin } from "@/lib/manutencao";

const COOKIE_SESSAO = "filapro_sessao";
const PUBLICAS = ["/login", "/renovar", "/privacidade", "/termos"];
// Rotas da API liberadas na manutenção: estado, presença (mostra a tela), login (o Super Admin pode entrar),
// sair e leads de anúncios (ficam guardados e são atendidos depois)
const API_LIVRES = ["/api/manutencao", "/api/presenca", "/api/auth/login", "/api/auth/verificar", "/api/auth/sair", "/api/auth/encerrar", "/api/anuncios/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const api = pathname.startsWith("/api/");

  if (await emManutencao()) {
    const acao = req.method !== "GET" && req.method !== "HEAD";
    const livre = API_LIVRES.some((p) => pathname === p || pathname.startsWith(p));
    if ((api && !livre) || (!api && acao)) {
      if (!(await tokenDeSuperAdmin(req.cookies.get(COOKIE_SESSAO)?.value))) {
        return NextResponse.json({ ok: false, manutencao: true, mensagem: MSG_MANUTENCAO, erro: MSG_MANUTENCAO }, { status: 503, headers: { "x-manutencao": "1", "retry-after": "60" } });
      }
    }
  }
  if (api) return NextResponse.next();

  const publica = pathname === "/" || PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!publica && !req.cookies.get(COOKIE_SESSAO)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

// Não passa por arquivos estáticos e internos do Next.
// Arquivos do app no celular (service worker, manifesto e ícones) também ficam livres (decisão #85).
// Roda no Node.js para consultar o banco (estado da manutenção).
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icones/).*)"],
};
