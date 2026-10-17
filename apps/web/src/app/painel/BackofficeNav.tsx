"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./backoffice.module.css";
import { signOut } from "../login/actions";
import { NavIcon, type NavIconName } from "./nav-icons";

type Permission = "canOperate" | "canManage" | "canDispatch" | "canSeeFinance";
type Props = Record<Permission, boolean> & { name: string; roleLabel: string };
type Item = { label: string; href: string; icon: NavIconName; key: Permission; hint?: string };

const groups: Array<{ title: string; items: Item[] }> = [
  { title: "Operação do dia", items: [
    { label: "Pedidos", href: "/painel/pedidos", icon: "orders", key: "canOperate", hint: "Cadastro, etiquetas e situação" },
    { label: "Despacho", href: "/painel/despacho", icon: "dispatch", key: "canDispatch", hint: "Montar viagens" },
    { label: "Viagens", href: "/painel/viagens", icon: "trips", key: "canOperate", hint: "Acompanhar e ajustar rotas" },
    { label: "Ao vivo", href: "/painel/ao-vivo", icon: "live", key: "canOperate", hint: "Posição dos motoristas" },
    { label: "Ocorrências", href: "/painel/paradas", icon: "alerts", key: "canOperate", hint: "Coletas, entregas e problemas" },
    { label: "Transbordos", href: "/painel/transbordos", icon: "transfer", key: "canOperate" },
  ] },
  { title: "Cadastros", items: [
    { label: "Clientes", href: "/painel/clientes", icon: "clients", key: "canManage" },
    { label: "Motoristas", href: "/painel/motoristas", icon: "driver", key: "canManage" },
    { label: "Frota", href: "/painel/veiculos", icon: "fleet", key: "canManage" },
  ] },
  { title: "Gestão", items: [
    { label: "Faturamento", href: "/painel/faturamento", icon: "billing", key: "canSeeFinance" },
    { label: "Indicadores", href: "/painel/indicadores", icon: "chart", key: "canOperate" },
    { label: "Histórico de rotas", href: "/painel/historico-motoristas", icon: "route", key: "canOperate" },
    { label: "Suporte aos motoristas", href: "/painel/suporte", icon: "support", key: "canOperate" },
  ] },
];

export function BackofficeNav(props: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/painel" ? pathname === "/painel" : pathname === href || pathname.startsWith(`${href}/`);
  return <aside className={styles.sidebar}>
    <Link href="/painel" className={styles.brand}><span className={styles.brandMark}>X</span><span><strong>MalhaX</strong><small>LOGÍSTICA</small></span></Link>
    {props.canDispatch ? <Link href="/painel/novo-pedido" className={styles.newOrder}><NavIcon name="plus" /> Novo pedido</Link> : null}
    <nav aria-label="Navegação do painel" className={styles.nav}>
      <Link href="/painel" aria-current={isActive("/painel") ? "page" : undefined} className={`${styles.navLink} ${isActive("/painel") ? styles.active : ""}`}><NavIcon name="home" />Início</Link>
      {groups.map((group) => {
        const visible = group.items.filter(({ key }) => props[key]);
        if (!visible.length) return null;
        return <section className={styles.navGroup} key={group.title}>
          <p>{group.title}</p>
          {visible.map(({ label, href, icon, hint }) => (
            <Link key={href} href={href} title={hint} aria-current={isActive(href) ? "page" : undefined} className={`${styles.navLink} ${isActive(href) ? styles.active : ""}`}>
              <NavIcon name={icon} />{label}
            </Link>
          ))}
        </section>;
      })}
    </nav>
    <div className={styles.account}>
      <span className={styles.accountDot} />{props.name}
      <small>{props.roleLabel}</small>
      <form action={signOut}><button className={styles.signOut} type="submit">Sair</button></form>
    </div>
  </aside>;
}
