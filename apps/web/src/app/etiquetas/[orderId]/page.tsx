import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { createClient } from "../../../lib/supabase/server";
import { getOrganizationAccess, hasBackofficeAccess } from "../../../lib/auth/organization-access";
import { PrintButton } from "./print-button";
import styles from "./labels.module.css";

type OrderRow = { id: string; order_number: number; external_reference: string | null; clients: { name: string } | null };
type PackageRow = { id: string; package_code: string; description: string | null; weight_kg: number | null; created_at: string };
type LinkRow = { package_id: string; expected_action: string; order_stops: { address_label: string; address_line: string; district: string | null; city: string | null; state: string | null } | null };

const peso = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function endereco(stop: NonNullable<LinkRow["order_stops"]>) {
  return [stop.address_line, stop.district, [stop.city, stop.state].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}

export default async function EtiquetasPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getOrganizationAccess(supabase, user.id);
  if (!access.loaded || !hasBackofficeAccess(access.roles)) redirect("/acesso-motorista");

  const [{ data: order }, { data: packages }, { data: links }] = await Promise.all([
    supabase.from("orders").select("id, order_number, external_reference, clients(name)").eq("id", orderId).maybeSingle().overrideTypes<OrderRow, { merge: false }>(),
    supabase.from("packages").select("id, package_code, description, weight_kg, created_at").eq("order_id", orderId).order("created_at").overrideTypes<PackageRow[], { merge: false }>(),
    supabase.from("order_stop_packages").select("package_id, expected_action, order_stops(address_label, address_line, district, city, state)").eq("order_id", orderId).overrideTypes<LinkRow[], { merge: false }>(),
  ]);
  if (!order) notFound();
  const volumes = packages ?? [];
  // O QR contém apenas o código aleatório do volume — nenhum dado pessoal.
  const labels = await Promise.all(volumes.map(async (pkg, index) => {
    const pickup = (links ?? []).find((link) => link.package_id === pkg.id && link.expected_action === "load")?.order_stops ?? null;
    const delivery = (links ?? []).find((link) => link.package_id === pkg.id && link.expected_action === "unload")?.order_stops ?? null;
    const svg = await QRCode.toString(pkg.package_code, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { pkg, index, pickup, delivery, svg };
  }));

  return <main className={styles.page}>
    <div className={styles.toolbar}>
      <div>
        <p className={styles.eyebrow}>MalhaX · Etiquetas</p>
        <h1>Pedido #{order.order_number} · {volumes.length} {volumes.length === 1 ? "volume" : "volumes"}</h1>
        <p>Cole uma etiqueta em cada volume. O motorista lê o QR na coleta e na entrega para conferir.</p>
      </div>
      <div className={styles.actions}>
        <Link href="/painel/pedidos" className={styles.secondary}>← Pedidos</Link>
        <PrintButton className={styles.primary} />
      </div>
    </div>
    {labels.length === 0 ? <p className={styles.empty}>Este pedido não tem volumes.</p> : null}
    <section className={styles.sheet}>
      {labels.map(({ pkg, index, pickup, delivery, svg }) => (
        <article className={styles.label} key={pkg.id}>
          <header className={styles.labelHeader}>
            <strong>MalhaX</strong>
            <span>Pedido #{order.order_number}{order.external_reference ? ` · ${order.external_reference}` : ""}</span>
          </header>
          <div className={styles.labelBody}>
            <div className={styles.qr} dangerouslySetInnerHTML={{ __html: svg }} />
            <div className={styles.info}>
              <p className={styles.volume}>Volume {index + 1}/{volumes.length}</p>
              {pkg.description ? <p className={styles.description}>{pkg.description}</p> : null}
              <p>{pkg.weight_kg !== null ? `${peso.format(Number(pkg.weight_kg))} kg` : "Peso não informado"}</p>
              {order.clients?.name ? <p className={styles.muted}>Cliente: {order.clients.name}</p> : null}
            </div>
          </div>
          {delivery ? <p className={styles.destination}><b>Entrega:</b> {delivery.address_label} — {endereco(delivery)}</p> : null}
          {pickup ? <p className={styles.origin}><b>Coleta:</b> {pickup.address_label}</p> : null}
          <p className={styles.code}>{pkg.package_code.toUpperCase()}</p>
        </article>
      ))}
    </section>
  </main>;
}
