"use client";

import Link from "next/link";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page grid" style={{ textAlign: "center", paddingTop: "64px", paddingBottom: "64px" }}>
      <section>
        <p className="kicker">Error</p>
        <h1 className="page-title">Something went wrong</h1>
        <p className="page-subtitle" style={{ maxWidth: "520px", margin: "8px auto 0" }}>
          An unexpected error occurred while loading this page. Please try again.
        </p>
        <div style={{ marginTop: "16px", display: "flex", gap: "8px", justifyContent: "center" }}>
          <button type="button" className="button-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="copy-button" style={{ display: "inline-flex", alignItems: "center" }}>
            Back to homepage
          </Link>
        </div>
      </section>
    </div>
  );
}
