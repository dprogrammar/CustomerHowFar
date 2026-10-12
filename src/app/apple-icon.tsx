import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon, generated at build time from the logo mark. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#008751",
      }}
    >
      <svg width="120" height="120" viewBox="0 0 32 32">
        <path
          d="M16 4.5c-4.4 0-8 3.4-8 7.8 0 5.7 8 13.7 8 13.7s8-8 8-13.7c0-4.4-3.6-7.8-8-7.8Z"
          fill="#fff"
        />
        <circle cx="16" cy="12.3" r="3.2" fill="#fba224" />
      </svg>
    </div>,
    size,
  );
}
