// Original illustrated sample guides for the ID check (no real people, no photos). Brand colours.

const BRAND = "#008751";
const BRAND_DARK = "#005637";
const BRAND_50 = "#e9f8f0";
const BRAND_100 = "#c9eedb";
const ACCENT = "#fba224";
const SKIN = "#9a6239";
const SKIN_SHADE = "#7d4c2b";
const HAIR = "#2a1a10";

function Frame() {
  // Camera viewfinder corners.
  const c = { stroke: BRAND, strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };
  return (
    <g {...c}>
      <path d="M14 40V20a6 6 0 0 1 6-6h20" />
      <path d="M226 40V20a6 6 0 0 0-6-6h-20" />
      <path d="M14 160v20a6 6 0 0 0 6 6h20" />
      <path d="M226 160v20a6 6 0 0 1-6 6h-20" />
    </g>
  );
}

function Tick({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="13" fill={BRAND} stroke="#fff" strokeWidth="3" />
      <path
        d={`M${x - 6} ${y}l4 4.5 8-9`}
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Tiny ID card (used inside both guides). */
function MiniCard({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const band = h * 0.22;
  const photoW = w * 0.28;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h * 0.1}
        fill="#fff"
        stroke={BRAND_DARK}
        strokeWidth="2"
      />
      <path
        d={`M${x + 1} ${y + band}V${y + h * 0.1}a${h * 0.09} ${h * 0.09} 0 0 1 ${h * 0.09}-${h * 0.09}H${x + w - h * 0.1}a${h * 0.09} ${h * 0.09} 0 0 1 ${h * 0.09} ${h * 0.09}V${y + band}z`}
        fill={BRAND}
      />
      <rect
        x={x + w * 0.07}
        y={y + band + h * 0.1}
        width={photoW}
        height={h * 0.55}
        rx="2"
        fill={BRAND_100}
      />
      <circle
        cx={x + w * 0.07 + photoW / 2}
        cy={y + band + h * 0.27}
        r={photoW * 0.2}
        fill={SKIN}
      />
      <path
        d={`M${x + w * 0.07 + photoW * 0.15} ${y + band + h * 0.65}a${photoW * 0.35} ${photoW * 0.3} 0 0 1 ${photoW * 0.7} 0z`}
        fill={BRAND_DARK}
      />
      {[0.18, 0.34, 0.5].map((dy, i) => (
        <rect
          key={dy}
          x={x + w * 0.42}
          y={y + band + h * dy}
          width={w * (i === 1 ? 0.38 : 0.48)}
          height={h * 0.07}
          rx={h * 0.035}
          fill="#9ca3af"
        />
      ))}
    </g>
  );
}

/** A person holding their ID card beside the chin, face fully visible. */
export function SelfieGuide({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      role="img"
      aria-labelledby="selfie-guide-title"
      className={className}
    >
      <title id="selfie-guide-title">
        Sample: a person looking at the camera, holding their ID card beside their chin. The face
        and the ID are both clearly visible.
      </title>
      <rect width="240" height="200" rx="16" fill={BRAND_50} />
      <circle cx="40" cy="44" r="10" fill={ACCENT} opacity="0.5" />
      {/* Body and shoulders */}
      <path d="M44 200c4-38 34-58 76-58s72 20 76 58z" fill={BRAND_DARK} />
      <path d="M106 142h28l-14 16z" fill="#fff" opacity="0.9" />
      {/* Neck */}
      <rect x="109" y="116" width="22" height="30" rx="8" fill={SKIN_SHADE} />
      {/* Head */}
      <ellipse cx="120" cy="88" rx="30" ry="36" fill={SKIN} />
      <ellipse cx="90" cy="92" rx="5" ry="8" fill={SKIN_SHADE} />
      <ellipse cx="150" cy="92" rx="5" ry="8" fill={SKIN_SHADE} />
      {/* Short hair */}
      <path d="M90 82c-2-26 14-40 30-40s34 12 30 40c-4-12-14-20-30-20s-26 8-30 20z" fill={HAIR} />
      {/* Face */}
      <circle cx="108" cy="90" r="3.2" fill={HAIR} />
      <circle cx="132" cy="90" r="3.2" fill={HAIR} />
      <path
        d="M103 81q5-3 10 0M127 81q5-3 10 0"
        stroke={HAIR}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M118 96q2 6 4 0"
        stroke={SKIN_SHADE}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M110 107q10 8 20 0"
        stroke="#4a2614"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arm up to the card, card beside the chin (not covering the face) */}
      <path d="M216 200c0-26-6-44-14-58l-16 6c6 14 10 32 10 52z" fill={BRAND_DARK} />
      <MiniCard x={156} y={98} w={66} h={42} />
      {/* Thumb and fingers hold the card's lower edge only */}
      <rect x="188" y="132" width="20" height="18" rx="8" fill={SKIN} />
      <rect x="204" y="134" width="8" height="12" rx="4" fill={SKIN_SHADE} />
      <Frame />
      <Tick x={214} y={32} />
    </svg>
  );
}

/** A well-framed photo of an ID card: all corners in view, flat, sharp, no glare. */
export function IdCardGuide({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-labelledby="id-guide-title" className={className}>
      <title id="id-guide-title">
        Sample: an ID card photographed flat and straight, filling most of the frame, with all four
        corners visible and every detail readable.
      </title>
      <rect width="240" height="200" rx="16" fill={BRAND_50} />
      <rect x="30" y="44" width="180" height="116" rx="12" fill={BRAND_100} />
      <g transform="translate(0 0)">
        <MiniCard x={40} y={52} w={160} h={100} />
      </g>
      {/* Corner markers show all four corners are in view */}
      {[
        [40, 52],
        [200, 52],
        [40, 152],
        [200, 152],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill={ACCENT} />
      ))}
      <Frame />
      <Tick x={214} y={32} />
    </svg>
  );
}
