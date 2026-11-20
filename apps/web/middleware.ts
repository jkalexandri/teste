// Proteção das páginas: sem cookie de sessão, volta para o login.
// A validação completa da sessão (banco) acontece em cada página.
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_SESSAO = "filapro_sessao";
const PROTEGIDAS = ["/dashboard", "/primeiro-acesso"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protegida = PROTEGIDAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (protegida && !req.cookies.get(COOKIE_SESSAO)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/primeiro-acesso/:path*"] };
