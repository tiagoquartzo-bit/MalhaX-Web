"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./backoffice.module.css";

type IconName = "dashboard" | "driver" | "fleet" | "route" | "transfer" | "support";

const links: { label: string; href: string; icon: IconName }[] = [
  { label: "Visão de controle", href: "/dev-preview/controle", icon: "dashboard" },
  { label: "Motoristas", href: "/painel/motoristas", icon: "driver" },
  { label: "Frota", href: "/painel/veiculos", icon: "fleet" },
  { label: "Rotas", href: "/painel/historico-motoristas", icon: "route" },
  { label: "Transbordos", href: "/painel/transbordos", icon: "transfer" },
  { label: "Suporte", href: "/painel/suporte", icon: "support" },
];

function NavigationIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
    case "driver":
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
    case "fleet":
      return <svg {...common}><path d="M3 7h11v11H3zM14 11h4l3 4v3h-7z" /><circle cx="7.5" cy="18.5" r="1.8" /><circle cx="17.5" cy="18.5" r="1.8" /></svg>;
    case "route":
      return <svg {...common}><circle cx="5" cy="18.5" r="2" /><circle cx="19" cy="5.5" r="2" /><path d="M7 18.5h3a3 3 0 0 0 3-3v-7a3 3 0 0 1 3-3h1" /><path d="m16 3.5 2 2 2-2" /></svg>;
    case "transfer":
      return <svg {...common}><path d="M4 8h15m-3-3 3 3-3 3M20 16H5m3-3-3 3 3 3" /></svg>;
    case "support":
      return <svg {...common}><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h3v6H6a2 2 0 0 1-2-2zm16 0h-3v6h1a2 2 0 0 0 2-2zM17 19a5 5 0 0 1-5 2h-1" /></svg>;
  }
}

export function OperationsQuickNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.quickNav} aria-label="Navegação MalhaX">
      {links.map(({ label, href, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`${styles.quickNavLink} ${active ? styles.quickNavActive : ""}`}>
            <span className={styles.quickNavIcon} aria-hidden="true"><NavigationIcon name={icon} /></span>{label}
          </Link>
        );
      })}
    </nav>
  );
}
