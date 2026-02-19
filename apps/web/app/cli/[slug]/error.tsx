"use client";

export default function CliProfileError({ reset }: { reset: () => void }) {
  return (
    <div className="page grid">
      <section className="card" style={{ textAlign: "center" }}>
        <p className="kicker">CLI Profile</p>
        <h1 className="page-title">Unable to load this CLI profile.</h1>
        <p className="page-subtitle" style={{ margin: "12px auto 0", maxWidth: "520px" }}>
          The listing may be unavailable or temporarily unreachable. Try again in a moment.
        </p>
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
          <button type="button" className="button-primary" onClick={reset}>
            Retry
          </button>
        </div>
      </section>
    </div>
  );
}
