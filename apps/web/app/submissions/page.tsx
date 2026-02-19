import { redirect } from "next/navigation";
import { CopyableCommand } from "../../components/copyable-command";
import { FormSubmitButton } from "../../components/form-submit-button";
import { createSubmission, getSubmissions } from "../../lib/api";
import { createPageMetadata } from "../../lib/metadata";
import { formatRelativeTime } from "../../lib/time";

export const revalidate = 60;
export const metadata = createPageMetadata({
  title: "Submit a CLI",
  description:
    "Submit new CLI listings or edit proposals to the clime moderation queue through web or terminal.",
  path: "/submissions"
});

type Props = {
  searchParams: Promise<{ status?: string; message?: string }>;
};

export default async function SubmissionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const submissions = await getSubmissions();
  const visibleSubmissions = submissions.filter((submission) => {
    const label = String(submission.content.name ?? submission.target_cli_slug ?? "").trim().toLowerCase();
    return label !== "example-cli";
  });
  const nowMs = Date.now();
  const statusType = params.status === "success" ? "success" : params.status === "error" ? "error" : null;
  const statusMessage = params.message ? decodeURIComponent(params.message) : null;

  async function submitFromForm(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const publisher = String(formData.get("publisher") ?? "").trim().slice(0, 200);
    const repository = String(formData.get("repository") ?? "").trim();
    const website = String(formData.get("website") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const install = String(formData.get("install") ?? "").trim().slice(0, 500);
    const authType = String(formData.get("auth_type") ?? "none");
    const categories = String(formData.get("categories") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!name || !repository || !description) {
      console.error("[submissions] Rejected: name, repository, and description are required.");
      redirect("/submissions?status=error&message=Name%2C%20repository%2C%20and%20description%20are%20required.");
    }

    if (name.length > 100) {
      console.error("[submissions] Rejected: CLI name exceeds 100 characters.");
      redirect("/submissions?status=error&message=CLI%20name%20must%20be%20100%20characters%20or%20less.");
    }

    if (description.length > 1000) {
      console.error("[submissions] Rejected: description exceeds 1000 characters.");
      redirect("/submissions?status=error&message=Description%20must%20be%201000%20characters%20or%20less.");
    }

    const urlPattern = /^https?:\/\//;
    if (!urlPattern.test(repository)) {
      console.error("[submissions] Rejected: repository is not a valid URL.");
      redirect("/submissions?status=error&message=Repository%20URL%20must%20start%20with%20http%3A%2F%2F%20or%20https%3A%2F%2F.");
    }

    if (website && !urlPattern.test(website)) {
      console.error("[submissions] Rejected: website is not a valid URL.");
      redirect("/submissions?status=error&message=Website%20URL%20must%20start%20with%20http%3A%2F%2F%20or%20https%3A%2F%2F.");
    }

    try {
      await createSubmission({
        type: "new_cli",
        submitter: "web-form",
        content: {
          name: name.slice(0, 100),
          publisher,
          repository,
          website,
          description: description.slice(0, 1000),
          install,
          auth_type: authType,
          categories
        }
      });
      redirect("/submissions?status=success&message=Submission%20received.%20Moderation%20review%20is%20in%20progress.");
    } catch (error) {
      console.error("[submissions] Submission failed:", error);
      redirect("/submissions?status=error&message=Submission%20failed.%20Please%20try%20again.");
    }
  }

  return (
    <div className="page grid">
      <section>
        <p className="kicker">Community</p>
        <h1 className="page-title">Submit and improve CLI listings.</h1>
        <p className="page-subtitle">
          New listing proposals and edit requests flow into moderation with full audit history.
        </p>
      </section>

      <section className="card">
        <div className="section-label">Submission Guidelines</div>
        <ul className="info-list">
          <li>Include CLI name, repository URL, and clear one-line description.</li>
          <li>Add install method and auth type to speed moderation.</li>
          <li>Review target: 24-72 hours for curated additions.</li>
        </ul>
        <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
          <CopyableCommand value='clime submit --name "mycli" --repo "github.com/org/mycli" --description "What it does"' />
        </div>
      </section>

      <section className="card">
        <div className="section-label">Web Submission Form</div>
        {statusType && statusMessage ? (
          <p className={`form-alert ${statusType}`}>{statusMessage}</p>
        ) : null}
        <form action={submitFromForm} className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="submission-name">
              CLI Name <span className="required">*</span>
            </label>
            <input id="submission-name" className="form-input" name="name" placeholder="mycli" required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="submission-publisher">
              Publisher or Org
            </label>
            <input id="submission-publisher" className="form-input" name="publisher" placeholder="My Company" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="submission-repository">
              Repository URL <span className="required">*</span>
            </label>
            <input id="submission-repository" className="form-input" name="repository" placeholder="https://github.com/org/mycli" required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="submission-website">
              Website URL
            </label>
            <input id="submission-website" className="form-input" name="website" placeholder="https://mycli.dev" />
          </div>
          <div className="form-field full">
            <label className="form-label" htmlFor="submission-description">
              Brief Description <span className="required">*</span>
            </label>
            <textarea
              id="submission-description"
              className="form-textarea"
              name="description"
              placeholder="What the CLI does and why it is useful."
              required
              rows={4}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="submission-install">
              Primary Install Command
            </label>
            <input id="submission-install" className="form-input" name="install" placeholder="npm i -g mycli" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="submission-auth">
              Auth Type
            </label>
            <select id="submission-auth" name="auth_type" className="form-select" defaultValue="none">
              <option value="none">None</option>
              <option value="api_key">API Key</option>
              <option value="oauth">OAuth</option>
              <option value="login_command">Login Command</option>
              <option value="config_file">Config File</option>
            </select>
          </div>
          <div className="form-field full">
            <label className="form-label" htmlFor="submission-categories">
              Category Tags
            </label>
            <input id="submission-categories" className="form-input" name="categories" placeholder="deploy, auth, database" />
            <p className="form-help">Comma-separated. Maximum 10 tags.</p>
          </div>
          <div className="form-actions">
            <FormSubmitButton idleLabel="Submit Proposal" pendingLabel="Submitting Proposal..." />
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-label">Submission Queue</div>
        {visibleSubmissions.length === 0 ? (
          <p className="page-subtitle" style={{ marginTop: 0 }}>
            No pending submissions. Submit the first CLI to grow the registry.
          </p>
        ) : (
          <div className="grid">
            {visibleSubmissions.slice(0, 20).map((submission, index) => {
              const label = String(submission.content.name ?? submission.target_cli_slug ?? submission.id);
              const statusClass =
                submission.status === "approved"
                  ? "up"
                  : submission.status === "rejected"
                    ? "down"
                    : "flat";
              return (
                <article key={submission.id} className="command-row">
                  <div className="badge-row" style={{ justifyContent: "space-between" }}>
                    <span className="badge neutral">#{index + 1}</span>
                    <span className={`ranking-trend ${statusClass}`}>{submission.status}</span>
                  </div>
                  <p className="command-title" style={{ marginTop: "8px" }}>
                    {label}
                  </p>
                  <p className="command-desc">
                    {submission.type} · submitted {formatRelativeTime(submission.created_at, nowMs)}
                  </p>
                  {submission.reviewer ? (
                    <p className="stat-meta">
                      Reviewed by {submission.reviewer}
                      {submission.reviewed_at ? ` ${formatRelativeTime(submission.reviewed_at, nowMs)}` : ""}
                    </p>
                  ) : null}
                  {submission.review_notes ? (
                    <p className="stat-meta">Review notes: {submission.review_notes}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
