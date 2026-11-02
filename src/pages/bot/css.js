// Parse a CSS declaration string into a React style object.
// e.g. css("padding:8px;background:#fff") -> { padding: "8px", background: "#fff" }
export function css(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split(";")) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i < 0) continue;
    const key = t.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = t.slice(i + 1).trim();
  }
  return out;
}
