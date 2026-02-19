import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page grid" style={{ textAlign: "center", paddingTop: "64px", paddingBottom: "64px" }}>
      <section>
        <p className="kicker">404</p>
        <h1 className="page-title">Page not found</h1>
        <p className="page-subtitle" style={{ maxWidth: "520px", margin: "12px auto 0" }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <div style={{ marginTop: "16px" }}>
          <Link href="/" className="button-primary" style={{ display: "inline-block" }}>
            Back to homepage
          </Link>
        </div>
      </section>
    </div>
  );
}
