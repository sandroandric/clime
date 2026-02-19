import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { blogPosts } from "../../../lib/blog";
import { createPageMetadata } from "../../../lib/metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((entry) => entry.slug === slug);
  if (!post) {
    return { title: "Post Not Found" };
  }

  return createPageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = blogPosts.find((entry) => entry.slug === slug);
  if (!post) {
    notFound();
  }

  return (
    <div className="page blog-page grid">
      <section>
        <p className="kicker">{post.date}</p>
        <h1 className="page-title">{post.title}</h1>
        <p className="page-subtitle">{post.description}</p>
      </section>
      <section className="card">
        <div className="section-label">Article</div>
        <div className="grid">
          {post.content.map((paragraph, index) => (
            <p key={`${post.slug}-${index}`} className="prose">
              {paragraph}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
