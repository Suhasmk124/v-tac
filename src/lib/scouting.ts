import { query } from "./db";

export async function resolveSource(requested?: string) {
  const sources = await query<{ slug: string; name: string }>(
    `SELECT d.slug,d.name FROM data_sources d WHERE EXISTS(SELECT 1 FROM matches m WHERE m.data_source=d.slug) ORDER BY (d.slug='vct-reference') DESC,d.slug`,
  );
  return (
    sources.find((s) => s.slug === requested) ??
    sources[0] ?? { slug: "synthetic", name: "Synthetic training fixtures" }
  );
}
export function wilson(wins: number, total: number) {
  if (!total) return { lower: 0, upper: 1 };
  const z = 1.95996398454,
    p = wins / total,
    den = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / den;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    den;
  return {
    lower: wins === 0 ? 0 : Math.max(0, center - margin),
    upper: wins === total ? 1 : Math.min(1, center + margin),
  };
}
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
