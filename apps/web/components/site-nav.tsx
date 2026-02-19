"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { emitCopyToast } from "./copy-toast";

const links: ReadonlyArray<{ href: "/explore" | "/categories" | "/workflows" | "/rankings" | "/publishers" | "/submissions" | "/blog"; label: string }> = [
  { href: "/explore", label: "Explore" },
  { href: "/categories", label: "Categories" },
  { href: "/workflows", label: "Workflows" },
  { href: "/rankings", label: "Rankings" },
  { href: "/publishers", label: "Publishers" },
  { href: "/submissions", label: "Submit" },
  { href: "/blog", label: "Blog" }
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function copyInstallCommand() {
    try {
      await navigator.clipboard.writeText("npm i -g @cli-me/cli");
      emitCopyToast("Copied install command!");
    } catch {
      // no-op
    }
  }

  return (
    <div className="site-nav-wrap">
      <div className="site-nav">
        <Link href="/" className="logo" aria-label="clime home">
          <span>cli</span>
          <span className="logo-comma">,</span>
          <span>me</span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-nav-links"
        >
          Menu
        </button>

        <nav
          id="site-nav-links"
          className={`site-nav-links${open ? " open" : ""}`}
          aria-label="Main navigation"
        >
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href as string}
                className={`site-nav-link${active ? " active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <a
          className="nav-cta"
          href="https://www.npmjs.com/package/@cli-me/cli"
          target="_blank"
          rel="noreferrer"
          onClick={copyInstallCommand}
        >
          npm i -g @cli-me/cli
        </a>
      </div>
    </div>
  );
}
