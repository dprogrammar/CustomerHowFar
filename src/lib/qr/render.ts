import QRCode from "qrcode";

// Builds our QR codes in the browser with the open-source "qrcode" library: no third-party QR
// service and no redirect, so printed codes never expire. High error correction ("H", ~30%) lets
// the CustomerHowFar logo sit in the middle and the code still scans.

const MARGIN = 4; // Quiet zone, in modules (the QR standard asks for 4).
const BRAND = "#008751";
const ACCENT = "#fba224";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The QR code as an SVG document (logo in the centre, optional caption underneath). */
export function qrSvg(url: string, caption: string | null) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const dark = (x: number, y: number) => qr.modules.data[y * n + x] === 1;

  // Logo area: about 22% of the code's width, centred, with a one-module white border. Covers
  // well under the ~30% of the code that "H" error correction can rebuild.
  let logo = Math.round(n * 0.22);
  if ((n - logo) % 2 !== 0) logo += 1;
  const start = (n - logo) / 2;
  const inLogo = (x: number, y: number) =>
    x >= start - 1 && x < start + logo + 1 && y >= start - 1 && y < start + logo + 1;

  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dark(x, y) && !inLogo(x, y)) path += `M${x + MARGIN} ${y + MARGIN}h1v1h-1z`;
    }
  }

  const size = n + MARGIN * 2;
  const captionHeight = caption ? Math.round(size * 0.12) : 0;
  const height = size + captionHeight;
  // The logo mark (src/components/layout/logo.tsx), drawn on a 32-unit grid and scaled to fit.
  const scale = logo / 32;
  const lx = start + MARGIN;
  const logoSvg = `<g transform="translate(${lx} ${lx}) scale(${scale})"><rect width="32" height="32" rx="8" fill="${BRAND}"/><path d="M16 6.5c-3.9 0-7 3-7 6.9 0 5 7 12.1 7 12.1s7-7.1 7-12.1c0-3.9-3.1-6.9-7-6.9Z" fill="#fff"/><circle cx="16" cy="13.4" r="2.8" fill="${ACCENT}"/></g>`;
  const captionSvg = caption
    ? `<text x="${size / 2}" y="${size + captionHeight * 0.45}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${(size * 0.042).toFixed(2)}" font-weight="700" fill="#111827">${escapeXml(caption)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${height}" width="${size * 24}" height="${height * 24}" shape-rendering="crispEdges"><title>${escapeXml(`QR code: ${url}`)}</title><rect width="${size}" height="${height}" fill="#ffffff"/><path d="${path}" fill="#000000"/>${logoSvg}${captionSvg}</svg>`;
}

/** The same code as a print-quality PNG (default 2400px wide). */
export async function qrPng(url: string, caption: string | null, width = 2400): Promise<Blob> {
  const svg = qrSvg(url, caption);
  const img = new Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const ratio = img.naturalHeight / img.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
