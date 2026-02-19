import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630
};

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background: "#faf7f2",
          color: "#1a1a1a"
        }}
      >
        <div style={{ display: "flex", fontSize: 52, fontWeight: 700, fontFamily: "monospace" }}>
          <span>cli</span>
          <span style={{ color: "#0abab5" }}>,</span>
          <span>me</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ fontSize: 74, fontWeight: 500, lineHeight: 1.05 }}>
            One CLI for agents to know all CLIs
          </div>
          <div style={{ fontSize: 30, color: "#5c5549" }}>
            Search, install, authenticate, and chain CLIs with confidence.
          </div>
        </div>
      </div>
    ),
    size
  );
}
