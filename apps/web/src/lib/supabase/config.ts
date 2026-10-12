// Leitura centralizada das chaves públicas do Supabase.
// Nunca usar a service_role no painel: toda autorização passa por RLS e pelas RPCs.

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em apps/web/.env.local.",
    );
  }

  return { url, anonKey };
}
