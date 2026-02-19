import type { Metadata } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import { CopyToast } from "../components/copy-toast";
import { SiteNav } from "../components/site-nav";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono"
});
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

export const metadata: Metadata = {
  title: {
    default: "clime | The CLI Registry for AI Agents",
    template: "%s | clime"
  },
  description:
    "The CLI landscape, mapped. Search, discover, and chain command-line tools for humans and agents.",
  metadataBase: new URL("https://clime.sh"),
  alternates: {
    canonical: "https://clime.sh"
  },
  openGraph: {
    title: "clime | One CLI for agents to know all CLIs",
    description:
      "Search, discover, and chain command-line tools for humans and agents with curated workflows and rankings.",
    url: "https://clime.sh",
    siteName: "clime",
    type: "website",
    images: [
      {
        url: "https://clime.sh/opengraph-image",
        width: 1200,
        height: 630,
        alt: "clime"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "clime | One CLI for agents to know all CLIs",
    description:
      "Search, discover, and chain command-line tools for humans and agents with curated workflows and rankings.",
    images: ["https://clime.sh/opengraph-image"]
  },
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml"
      }
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <head>
        {gaMeasurementId ? (
          <>
            {/* Google tag (gtag.js) */}
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaMeasurementId}');
                `
              }}
            />
          </>
        ) : null}
      </head>
      <body>
        <div className="site-shell">
          <SiteNav />
          <main>{children}</main>
          <footer className="page-footer">
            <div className="page-footer-inner">
              <div className="footer-links">
                <a href="https://github.com/clime-registry/clime" target="_blank" rel="noreferrer">
                  GitHub
                </a>
                <a href="https://www.npmjs.com/package/@cli-me/cli" target="_blank" rel="noreferrer">
                  npm
                </a>
                <a href="/blog">Blog</a>
                <a href="https://github.com/clime-registry/clime#readme" target="_blank" rel="noreferrer">
                  Docs
                </a>
              </div>
              <div className="footer-tagline">NAVIGATE THE CLIME.</div>
            </div>
          </footer>
          <CopyToast />
        </div>
      </body>
    </html>
  );
}
