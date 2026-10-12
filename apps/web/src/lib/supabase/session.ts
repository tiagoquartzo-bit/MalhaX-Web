// Renova a sessão do Supabase a cada requisição e protege as rotas do painel.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "./config";

const PUBLIC_PATHS = ["/login"];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isDevPreview = process.env.NODE_ENV !== "production" && pathname.startsWith("/dev-preview/");
  const hasSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // Sem backend, mantém o login público visível e nega acesso às rotas internas.
  if (!hasSupabaseConfig) {
    if (isPublic || isDevPreview) return NextResponse.next();
    return NextResponse.redirect(new URL('/login?setup=supabase', request.url));
  }

  const { url, anonKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida o token no servidor do Supabase; não confiar em getSession() aqui.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  
  const redirectTo = (target: string): NextResponse => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Preserva cookies de sessão renovados durante esta requisição.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  // Prévia em desenvolvimento usa dados fictícios e deve continuar acessível
  // para revisão visual, mesmo quando o Supabase está configurado.
  if (!user && !isPublic && !isDevPreview) return redirectTo("/login");
  if (user && pathname === "/login") {
    const { data: roleRows } = await supabase
      .from("organization_member_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleRows ?? []).map(({ role }) => String(role));
    const isDriverOnly = roles.includes("driver") && !roles.some((role) => ["admin", "manager", "dispatcher", "support", "finance"].includes(role));
    return redirectTo(isDriverOnly ? "/motorista" : "/acesso-indisponivel");
  }

  return response;
}

