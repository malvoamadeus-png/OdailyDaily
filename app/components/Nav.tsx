"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Nav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "全部快讯" },
    { href: "/star", label: "星球统计" },
    { href: "/star/schedule", label: "星球值班日历" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-4">
      <div className="flex gap-2">
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                "rounded-md border-2 border-black px-3 py-2 text-sm font-bold",
                active ? "bg-[rgb(175,237,137)]" : "bg-white",
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

