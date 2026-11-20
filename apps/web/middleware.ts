// Proteção das páginas: sem cookie de sessão, volta para o login.
// Também repassa o caminho atual (x-pathname) para o layout conferir
// se o perfil pode abrir a tela. A validação completa da sessão (banco)
// acontece no layout de cada área.
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_SESSAO = "filapro_sessao";
const PUBLICAS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publica = pathname === "/" || PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!publica && !req.cookies.get(COOKIE_SESSAO)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

// Não passa por API, arquivos estáticos e internos do Next.
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
