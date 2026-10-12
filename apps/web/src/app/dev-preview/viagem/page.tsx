import { notFound } from "next/navigation";

import { TripStopControls } from "../../painel/viagens/[tripId]/controls";
import Link from "next/link";
import styles from "../../painel/viagens/[tripId]/trip.module.css";

const tripId = "e2d0cabc-4ef5-42fc-bc65-faa5310ced12";

const stops = [
  { id: "78c19687-848a-4667-81aa-128120ee3f53", sequence_number: 1, stop_type: "pickup", status: "pending", address_label: "Papelaria Central", address_line: "Rua das Flores, 142", city: "Campo Limpo" },
  { id: "047f4e2c-4f8d-4c9d-b34d-72d6ab466f54", sequence_number: 2, stop_type: "pickup", status: "pending", address_label: "Distribuidora Escolar", address_line: "Av. Carlos Lacerda, 980", city: "Campo Limpo" },
  { id: "14b5f638-dfc8-4f2d-bc8d-520ade1a1faa", sequence_number: 3, stop_type: "delivery", status: "completed", address_label: "Escola Novo Horizonte", address_line: "Rua Monte Azul, 51", city: "Campo Limpo" },
  { id: "b3693189-eebc-4e73-949d-8874ea8e3191", sequence_number: 4, stop_type: "delivery", status: "pending", address_label: "Centro Educacional Vida", address_line: "Rua dos Pinheiros, 220", city: "Campo Limpo" },
];

const tasks = [
  { id: "e3d18671-b254-4738-91ec-85a93f07201b", stop_type: "pickup", address_label: "Armazém São Lucas", address_line: "Estrada do Campo Limpo, 320", city: "Campo Limpo", order_number: 1048 },
  { id: "0f876cad-08d6-4797-b7b0-74476511563c", stop_type: "delivery", address_label: "Colégio Integração", address_line: "Rua Antonio da Silva, 74", city: "Campo Limpo", order_number: 1049 },
];

export default function LocalTripPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.brand}><span className={styles.brandMark}>M<span>X</span></span><span>MalhaX <small>PRÉVIA LOCAL</small></span></span>
        <Link className={styles.backLink} href="/dev-preview/controle">Ver central de controle →</Link>
      </header>
      <div className={styles.content}>
        <div className={styles.pageHeading}>
          <div><p className={styles.eyebrow}>GESTÃO DE ROTAS · PRÉVIA</p><h1>Viagem #2841</h1><p className={styles.subtitle}>Painel do gestor — visualização demonstrativa com dados de exemplo.</p></div>
          <span className={styles.statusPill + " " + styles.statusActive}>Em andamento</span>
        </div>
        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}><span>Motorista</span><strong>Rafael Oliveira</strong></article>
          <article className={styles.summaryCard}><span>Veículo</span><strong>Honda CG 160 · FGH-4J28</strong></article>
          <article className={styles.summaryCard}><span>Início previsto</span><strong>Hoje, 08:30</strong></article>
          <article className={styles.summaryCard}><span>Progresso</span><strong>1 de 4 paradas realizadas</strong></article>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>ROTA</p><h2>Paradas da viagem</h2></div><span className={styles.startedAt}>Última atualização: agora</span></div>
          <ol className={styles.stopList}>
            {stops.map((stop, index) => (
              <li className={styles.stopItem} key={stop.id}>
                <span className={styles.stopNumber}>{index + 1}</span>
                <div className={styles.stopBody}>
                  <div className={styles.stopTitleLine}><div><span className={styles.stopType}>{stop.stop_type === "pickup" ? "Coleta" : "Entrega"}</span><h3>{stop.address_label}</h3></div><span className={styles.statusPill + " " + (stop.status === "completed" ? styles.statusComplete : styles.statusPending)}>{stop.status === "completed" ? "Concluída" : "Pendente"}</span></div>
                  <p className={styles.address}>{stop.address_line} · {stop.city}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CONTROLE DO GESTOR</p><h2>Alterações da rota</h2></div></div>
          <div className={styles.syncNotice}>Prévia visual. Os botões mostram o fluxo planejado; as ações reais dependem da migration 013 e da conexão com o Supabase.</div>
          <TripStopControls tripId={tripId} stops={stops} availableTasks={tasks} canManage canReorder={false} />
        </section>
      </div>
    </main>
  );
}

