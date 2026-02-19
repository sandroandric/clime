import type { Metadata } from "next";

const SITE_URL = "https://clime.sh";
const DEFAULT_IMAGE_PATH = "/opengraph-image";

function asAbsoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `${SITE_URL}/${path}`;
  }
  return `${SITE_URL}${path}`;
}

export function createPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  imagePath?: string;
  absoluteTitle?: boolean;
}): Metadata {
  const canonical = asAbsoluteUrl(input.path);
  const image = asAbsoluteUrl(input.imagePath ?? DEFAULT_IMAGE_PATH);
  const title = input.absoluteTitle ? input.title : `${input.title} | clime`;

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: {
      canonical
    },
    openGraph: {
      title,
      description: input.description,
      url: canonical,
      siteName: "clime",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "clime"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images: [image]
    }
  };
}

