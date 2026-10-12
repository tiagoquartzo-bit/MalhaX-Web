export default function HomePage() {
  return (
    <main className="shell">
      <section className="welcome" aria-labelledby="page-title">
        <p className="eyebrow">MalhaX Logística</p>
        <h1 id="page-title">Central de operação</h1>
        <p className="intro">
          A base do painel está pronta para receber os módulos de despacho,
          acompanhamento e suporte.
        </p>
        <div className="status" role="status">
          <span className="status-dot" aria-hidden="true" />
          Estrutura inicial do projeto
        </div>
      </section>
    </main>
  );
}
