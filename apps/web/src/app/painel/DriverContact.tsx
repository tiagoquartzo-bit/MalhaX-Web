export function DriverContact({ name, phone }: { name: string; phone: string | null }) {
  const localDigits = (phone ?? "").replace(/\D/g, "");
  const digits = localDigits.length === 10 || localDigits.length === 11 ? `55${localDigits}` : localDigits;
  if (!phone || !/^55\d{10,11}$/.test(digits)) return <span style={{ color: "#718096", fontSize: 12 }}>Telefone não cadastrado</span>;
  const text = encodeURIComponent(`Olá, ${name}. Estou acompanhando sua operação pela MalhaX.`);
  return <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
    <a href={`tel:+${digits}`} aria-label={`Ligar para ${name}`}>Ligar</a>
    <a href={`https://wa.me/${digits}?text=${text}`} target="_blank" rel="noreferrer" aria-label={`Enviar mensagem no WhatsApp para ${name}`}>WhatsApp</a>
  </span>;
}
