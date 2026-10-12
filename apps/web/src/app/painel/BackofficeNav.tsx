"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./backoffice.module.css";
import { signOut } from "../login/actions";

type Props = { canOperate: boolean; canManage: boolean; canDispatch: boolean; canSeeFinance: boolean; name: string };
const groups = [
  { title: "OPERAÇÃO", items: [
    { label: "Coletas e entregas", href: "/painel/paradas", icon: "▣", key: "canOperate" },
    { label: "Despacho de viagens", href: "/painel/despacho", icon: "⇄", key: "canDispatch" },
    { label: "Acompanhamento ao vivo", href: "/painel/ao-vivo", icon: "⌖", key: "canOperate" },
    { label: "Histórico de rotas", href: "/painel/historico-motoristas", icon: "↗", key: "canOperate" },
    { label: "Transbordos", href: "/painel/transbordos", icon: "⇄", key: "canOperate" },
  ] },
  { title: "EQUIPE E SUPORTE", items: [
    { label: "Motoristas", href: "/painel/motoristas", icon: "♙", key: "canManage" },
    { label: "Atendimento ao motorista", href: "/painel/suporte", icon: "◌", key: "canOperate" },
  ] },
  { title: "GESTÃO", items: [
    { label: "Clientes", href: "/painel/clientes", icon: "▤", key: "canManage" },
  ] },
] as const;

export function BackofficeNav(props: Props) {
  const pathname = usePathname();
  const controlHref = "/painel";
  const controlActive = pathname === controlHref;
  return <aside className={styles.sidebar}>
    <Link href={controlHref} className={styles.brand}><span className={styles.brandMark}>X</span><span><strong>MalhaX</strong><small>GESTOR</small></span></Link>
    <div className={styles.account}><span className={styles.accountDot} />{props.name}<small>Ambiente da empresa</small></div>
    <nav aria-label="Navegação do gestor" className={styles.nav}>
      <Link href={controlHref} aria-current={controlActive ? "page" : undefined} className={`${styles.navLink} ${controlActive ? styles.active : ""}`}><span aria-hidden="true">▦</span>Visão de controle</Link>
      {groups.map((group) => { const visibleItems = group.items.filter(({ key }) => props[key]); return visibleItems.length ? <section className={styles.navGroup} key={group.title}><p>{group.title}</p>{visibleItems.map(({ label, href, icon }) => <Link aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} className={`${styles.navLink} ${pathname === href || pathname.startsWith(`${href}/`) ? styles.active : ""}`} href={href} key={href}><span aria-hidden="true">{icon}</span>{label}</Link>)}</section> : null; })}
    </nav>
    {props.canDispatch ? <Link href="/painel/novo-pedido" className={styles.newOrder}>＋ Novo pedido</Link> : null}
    <form action={signOut}><button className={styles.signOut} type="submit">Sair da conta</button></form>
  </aside>;
}



