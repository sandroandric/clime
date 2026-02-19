import { ImageResponse } from "next/og";
import { getCliProfile } from "../../../lib/api";

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630
};

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CliOpenGraphImage({ params }: Props) {
  const { slug } = await params;
  let title = slug;
  let trust = "--";
  let commands = "--";

  try {
    const profile = await getCliProfile(slug);
    title = profile.identity.name;
    trust = profile.identity.trust_score.toFixed(1);
    commands = String(profile.commands.length);
  } catch {
    // Keep fallback values.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#faf7f2",
          color: "#1a1a1a",
          padding: "56px",
          justifyContent: "space-between"
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, fontFamily: "monospace" }}>
          <span>cli</span>
          <span style={{ color: "#0abab5" }}>,</span>
          <span>me</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 28, color: "#5c5549" }}>CLI Commands | clime</div>
        </div>
        <div style={{ display: "flex", gap: "22px", fontSize: 26, color: "#5c5549" }}>
          <span>Trust {trust}</span>
          <span>Commands {commands}</span>
        </div>
      </div>
    ),
    size
  );
}

