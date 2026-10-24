"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/today", label: "Сегодня" },
  { href: "/history", label: "История" },
  { href: "/settings", label: "Настройки" },
];

export function TopNav() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={isLogin ? "/login" : "/today"} className="brand">
          <span className="brand-mark">C</span>
          <span>CHIRON</span>
        </Link>
        {!isLogin ? (
          <nav className="nav" aria-label="Основная навигация">
            {ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  pathname === item.href ||
                  (item.href !== "/today" && pathname.startsWith(item.href))
                    ? "active"
                    : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
