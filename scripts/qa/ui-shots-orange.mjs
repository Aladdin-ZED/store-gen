/**
 * The forbidden-orange detector of `ui-shots --scan-orange` (R2 contract step C2-E, the S6 shared need; maintainer,
 * next to scripts/qa/ui-shots.ts): runs in the page (pass it to page.evaluate) and returns the offending (element,
 * property, color, oklch) tuples: OKLCH hue in [25, 75] with chroma > 0.06 (the owner's rule). Images, video, canvas
 * and iframes (photos, landing previews) are skipped. Committed copy of the local qa/admin-visual/scan.mjs (qa/ is
 * git-ignored, so the track worktrees never had it).
 */
export function scanOrange() {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const g = cvs.getContext("2d", { willReadFrequently: true });
  const toRgba = (css) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = "#000";
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data;
    return [r / 255, gg / 255, b / 255, a / 255];
  };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const oklch = ([r, gg, b]) => {
    const R = lin(r), G = lin(gg), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const C = Math.hypot(A, Bb);
    let H = (Math.atan2(Bb, A) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L, C, H };
  };
  const COLOR_RE = /(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|color\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b)/gi;
  const PROPS = ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color", "fill", "stroke", "box-shadow", "background-image", "text-decoration-color", "stop-color", "flood-color"];
  const SKIP = "img,video,canvas,iframe,picture,[data-qa-photo]";
  const hits = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest(SKIP)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (r.width === 0 && r.height === 0 && !(el instanceof SVGElement)) continue;
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (!v || v === "none") continue;
      if (p === "fill" || p === "stroke") {
        if (!(el instanceof SVGElement)) continue;
      }
      if (/^border-/.test(p) && parseFloat(cs.getPropertyValue(p.replace("-color", "-width"))) === 0) continue;
      if (p === "outline-color" && (cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) === 0)) continue;
      if (p === "text-decoration-color" && !/underline|line-through|overline/.test(cs.textDecorationLine)) continue;
      for (const m of v.match(COLOR_RE) ?? []) {
        const rgba = toRgba(m);
        if (rgba[3] < 0.06) continue;
        const { L, C, H } = oklch(rgba);
        if (C > 0.06 && H >= 25 && H <= 75) {
          const label = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".")}`;
          const key = `${label}|${p}|${m}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ el: label.slice(0, 160), prop: p, color: m, oklch: `L${L.toFixed(2)} C${C.toFixed(3)} H${H.toFixed(0)}`, text: (el.textContent ?? "").trim().slice(0, 40) });
        }
      }
    }
  }
  return hits;
}

