export default function CliProfileLoading() {
  return (
    <div className="page grid">
      <section className="card">
        <p className="kicker">CLI Profile</p>
        <h1 className="page-title profile-title">Loading CLI profile...</h1>
        <p className="page-subtitle">Fetching install matrix, auth flow, command map, and compatibility data.</p>
      </section>
      <section className="card">
        <div className="section-label">Loading</div>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Please wait while clime prepares the listing details.
        </p>
      </section>
    </div>
  );
}
