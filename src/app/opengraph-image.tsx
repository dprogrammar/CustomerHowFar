import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name} - ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share image (WhatsApp, Facebook, X, LinkedIn), generated at build time. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #005637 0%, #008751 100%)",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="72" height="72" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill="#ffffff" />
          <path
            d="M16 6.5c-3.9 0-7 3-7 6.9 0 5 7 12.1 7 12.1s7-7.1 7-12.1c0-3.9-3.1-6.9-7-6.9Z"
            fill="#008751"
          />
          <circle cx="16" cy="13.4" r="2.8" fill="#fba224" />
        </svg>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
          Customer<span style={{ color: "#fcba4d" }}>HowFar</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, maxWidth: 950 }}>
          Find trusted artisans and businesses near you
        </div>
        <div style={{ fontSize: 32, color: "#c9eedb" }}>
          Tailors, electricians, plumbers, mechanics, caterers and more across Nigeria
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 26 }}>
        {["Reviewed listings", "Real work photos", "Chat on WhatsApp"].map((label) => (
          <div
            key={label}
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
