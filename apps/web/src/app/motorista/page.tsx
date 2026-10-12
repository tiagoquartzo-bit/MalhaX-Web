import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { signOut } from "../login/actions";

const OPS_ROLES = ["admin", "manager", "dispatcher", "support", "finance"];

export default async function DriverAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: roleRows, error } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) redirect("/login");

  const roles = (roleRows ?? []).map((row) => row.role as string);
  if (!roles.includes("driver")) redirect("/acesso-indisponivel");
  if (roles.some((role) => OPS_ROLES.includes(role))) redirect("/acesso-indisponivel");

  return (
    <main style={{ minHeight: "100vh", background: "#070e1a", color: "#f5f8fc", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "100%", maxWidth: 520, border: "1px solid #26364c", borderRadius: 20, background: "#0d1929", padding: 32, textAlign: "center" }}>
        <p style={{ color: "#38e1ff", fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>ACESSO DO MOTORISTA</p>
        <h1 style={{ fontSize: 30, margin: "14px 0" }}>Abra o aplicativo MalhaX</h1>
        <p style={{ color: "#aab6c7", lineHeight: 1.7 }}>
          Sua conta é de motorista. Este endereço é o painel web da operação; use o aplicativo Android MalhaX para consultar viagens, paradas e navegação.
        </p>
        <p style={{ color: "#8092a8", fontSize: 13, lineHeight: 1.6 }}>
          Entre no app com a mesma conta. Se ainda não estiver instalado no celular, peça ao suporte o link do APK de teste.
        </p>
        <form action={signOut}>
          <button type="submit" style={{ marginTop: 12, border: "1px solid #31445c", borderRadius: 10, background: "transparent", color: "#d8e1ed", padding: "11px 18px", cursor: "pointer" }}>
            Sair da conta
          </button>
        </form>
      </section>
    </main>
  );
}
