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
          className="nav-github-link"
          href="https://github.com/sandroandric/clime"
          target="_blank"
          rel="noreferrer"
          aria-label="clime GitHub repository"
          title="GitHub"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.39v-1.36c-2.24.49-2.71-.95-2.71-.95-.36-.92-.9-1.16-.9-1.16-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.86.87 2.32.66.07-.52.28-.87.52-1.08-1.78-.2-3.64-.88-3.64-3.92 0-.87.31-1.58.82-2.14-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82A7.6 7.6 0 0 1 8 3.87c.68 0 1.36.09 2 .26 1.52-1.03 2.19-.82 2.19-.82.44 1.11.17 1.93.09 2.13.5.56.82 1.27.82 2.14 0 3.05-1.87 3.72-3.65 3.92.28.25.54.74.54 1.5v2.2c0 .22.14.47.55.39A8 8 0 0 0 8 0Z" />
          </svg>
        </a>

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
