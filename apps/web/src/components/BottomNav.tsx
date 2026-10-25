"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Glyph({ name }: { name: "today" | "history" | "mentees" | "settings" }) {
  if (name === "today") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "history") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 19V5M4 19h16M8 15v-4M12 15V7M16 15v-6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "mentees") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20c0-3 2.7-5 6-5s6 2 6 5M15 15.5c2.8.2 5 2.2 5 4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m19.4 13.5 1.1.8-1.7 2.9-1.3-.5a7.7 7.7 0 0 1-1.7 1l-.2 1.4h-3.4l-.2-1.4a7.7 7.7 0 0 1-1.7-1l-1.3.5-1.7-2.9 1.1-.8a7.3 7.3 0 0 1 0-2l-1.1-.8 1.7-2.9 1.3.5a7.7 7.7 0 0 1 1.7-1l.2-1.4h3.4l.2 1.4a7.7 7.7 0 0 1 1.7 1l1.3-.5 1.7 2.9-1.1.8a7.3 7.3 0 0 1 0 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  const items = [
    { href: "/today", label: "Сегодня", glyph: "today" as const },
    { href: "/history", label: "История", glyph: "history" as const },
    { href: "/mentees", label: "Люди", glyph: "mentees" as const },
    { href: "/settings", label: "Настройки", glyph: "settings" as const },
  ];

  return (
    <nav className="bottom-nav" aria-label="Мобильная навигация">
      {items.map((item) => (
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
          <span className="nav-glyph">
            <Glyph name={item.glyph} />
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
