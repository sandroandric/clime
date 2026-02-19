import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: "https://clime.sh/sitemap.xml",
    host: "https://clime.sh"
  };
}
