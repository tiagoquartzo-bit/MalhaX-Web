import { randomUUID } from "node:crypto";
import Link from "next/link";

import { createClient } from "../../../lib/supabase/server";
import { NovoPedidoForm } from "./form-GAMER";
import styles from "./page.module.css";

export default async function NovoPedidoPage() {
  const supabase = await createClient();

  // RLS limita a lista; a criação em si é validada de novo dentro da RPC create_order.
  const { data: clientes } = await supabase
    .from("clients")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <main className={styles.page}>
      <Link href="/painel" className={styles.backLink}>
        <span aria-hidden="true">←</span> Voltar à operação
      </Link>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}><span aria-hidden="true" /> Operação · Pedidos</p>
          <h1>Novo pedido</h1>
          <p className={styles.description}>Organize os volumes, coletas e entregas em um só lugar.</p>
        </div>
        <div className={styles.headingBadge}>
          <span className={styles.badgeDot} aria-hidden="true" />
          <span>Cadastro operacional</span>
        </div>
      </div>
      <NovoPedidoForm clientes={clientes ?? []} requestId={randomUUID()} />
    </main>
  );
}
