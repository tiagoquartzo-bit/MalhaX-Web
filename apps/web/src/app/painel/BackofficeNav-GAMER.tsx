"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./backoffice.module.css";
import { signOut } from "../login/actions";

type Props = { canOperate: boolean; canManage: boolean; canDispatch: boolean; canSeeFinance: boolean; name: string };
const groups = [
  { title: "OPERAÇÃO", items: [
    { label: "Coletas e entregas", href: "/painel/paradas", key: "canOperate" },
    { label: "Despacho de viagens", href: "/painel/despacho", key: "canDispatch" },
    { label: "Acompanhamento ao vivo", href: "/painel/ao-vivo", key: "canOperate" },
    { label: "Histórico de rotas", href: "/painel/historico-motoristas", key: "canOperate" },
  ] },
  { title: "EQUIPE", items: [
    { label: "Motoristas", href: "/painel/motoristas", key: "canManage" },
    { label: "Frota", href: "/painel/veiculos", key: "canManage" },
    { label: "Atendimento ao motorista", href: "/painel/suporte", key: "canOperate" },
  ] },
  { title: "GESTÃO", items: [
    { label: "Visão gerencial · indicadores", href: "/painel/indicadores", key: "canSeeFinance" },
    { label: "Clientes", href: "/painel/clientes", key: "canManage" },
  ] },
] as const;

export function BackofficeNav(props: Props) {
  const pathname = usePathname();
  return <aside className={styles.sidebar}>
    <Link href="/painel" className={styles.brand}><span className={styles.brandMark}>X</span><span><strong>MalhaX</strong><small>BACKOFFICE</small></span></Link>
    <div className={styles.account}><span className={styles.accountDot} />{props.name}<small>Ambiente da empresa</small></div>
    <nav aria-label="Navegação do backoffice" className={styles.nav}>
      <Link href="/painel" className={`${styles.navLink} ${pathname === "/painel" ? styles.active : ""}`}><span>⌂</span>Início</Link>
      {groups.map((group) => { const visibleItems = group.items.filter(({ key }) => props[key]); return visibleItems.length ? <section className={styles.navGroup} key={group.title}><p>{group.title}</p>{visibleItems.map(({ label, href }) => <Link aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} className={`${styles.navLink} ${pathname === href || pathname.startsWith(`${href}/`) ? styles.active : ""}`} href={href} key={href}>{label}</Link>)}</section> : null; })}
    </nav>
    {props.canDispatch ? <Link href="/painel/novo-pedido" className={styles.newOrder}>＋ Novo pedido</Link> : null}
    <form action={signOut}><button className={styles.signOut} type="submit">Sair do backoffice</button></form>
  </aside>;
}





