import { randomUUID } from "node:crypto";
import Link from "next/link";

import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { NovoPedidoForm } from "./form";
import styles from "./page.module.css";

export default async function NovoPedidoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "dispatcher"].includes(role))) redirect("/painel");
  const canSetFreight = roles.some((role) => role === "admin" || role === "manager");

  // RLS limita a lista; a criação em si é validada de novo dentro da RPC create_order.
  const { data: clientes } = await supabase
    .from("clients")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <main className={styles.page}>
      <Link href="/painel/pedidos" className={styles.backLink}>
        <span aria-hidden="true">←</span> Pedidos
      </Link>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}><span aria-hidden="true" /> Operação · Pedidos</p>
          <h1>Novo pedido</h1>
          <p className={styles.description}>Três passos: cliente e volumes, endereços de coleta e entrega, conferência. A ordem da rota é definida depois, no Despacho.</p>
        </div>
      </div>
      {(clientes ?? []).length === 0 ? <p className={styles.description}>Nenhum cliente ativo. <Link href="/painel/clientes">Cadastre o primeiro cliente</Link> para criar pedidos.</p> : null}
      <NovoPedidoForm clientes={clientes ?? []} requestId={randomUUID()} canSetFreight={canSetFreight} />
    </main>
  );
}
