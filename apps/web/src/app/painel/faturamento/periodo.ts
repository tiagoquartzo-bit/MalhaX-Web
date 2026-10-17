// Períodos de faturamento sempre no fuso de São Paulo (datas AAAA-MM-DD).
export type Periodo = { inicio: string; fim: string; rotulo: string };

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const formato = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
export const dataBR = (data: string) => formato.format(new Date(`${data}T12:00:00Z`));

export function periodosRapidos(): Array<Periodo & { chave: string }> {
  const hoje = hojeSP();
  const [ano, mes] = hoje.split("-").map(Number);
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMesAnterior = somarDias(inicioMes, -1);
  const inicioMesAnterior = `${fimMesAnterior.slice(0, 7)}-01`;
  const dia = Number(hoje.slice(8, 10));
  const inicioQuinzena = dia <= 15 ? inicioMes : `${hoje.slice(0, 7)}-16`;
  return [
    { chave: "mes", inicio: inicioMes, fim: hoje, rotulo: "Este mês" },
    { chave: "quinzena", inicio: inicioQuinzena, fim: hoje, rotulo: "Quinzena atual" },
    { chave: "semana", inicio: somarDias(hoje, -6), fim: hoje, rotulo: "Últimos 7 dias" },
    { chave: "mes-anterior", inicio: inicioMesAnterior, fim: fimMesAnterior, rotulo: "Mês anterior" },
  ];
}

export function lerPeriodo(params: { inicio?: string; fim?: string }): Periodo {
  const padrao = periodosRapidos()[0];
  const inicio = params.inicio && DATA.test(params.inicio) ? params.inicio : padrao.inicio;
  const fim = params.fim && DATA.test(params.fim) && params.fim >= inicio ? params.fim : (inicio > padrao.fim ? inicio : padrao.fim);
  return { inicio, fim, rotulo: `${dataBR(inicio)} a ${dataBR(fim)}` };
}

export const reais = (valor: number | string | null | undefined) =>
  Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
