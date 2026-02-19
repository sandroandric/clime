import Link from "next/link";
import { blogPosts } from "../../lib/blog";
import { createPageMetadata } from "../../lib/metadata";

export const metadata = createPageMetadata({
  title: "Blog",
  description: "State of CLI reports, workflow breakdowns, and clime product updates.",
  path: "/blog"
});

export default function BlogPage() {
  return (
    <div className="page blog-page grid">
      <section>
        <p className="kicker">Content</p>
        <h1 className="page-title">State of CLI and workflow notes.</h1>
        <p className="page-subtitle">
          Research notes and operator updates for developers building with agent workflows.
        </p>
      </section>

      <section>
        <div className="section-label">Latest Posts</div>
        {blogPosts.length === 0 ? (
          <article className="card">
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              No posts published yet. Check back soon for workflow and registry updates.
            </p>
          </article>
        ) : (
          <div className="blog-grid">
            {blogPosts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="card blog-card-link card-interactive">
                <p className="kicker">{post.date}</p>
                <h2 className="workflow-card-title" style={{ marginTop: "8px" }}>
                  {post.title}
                </h2>
                <p className="workflow-desc">{post.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
