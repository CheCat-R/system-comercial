/**
 * Exportación a CSV.
 *
 * **La cabecera de contexto no es un adorno** (regla §8.10): un CSV suelto es un
 * número esperando ser mal citado. Cada archivo dice qué métrica es, de qué
 * período, con qué filtros y cuándo se extrajo — y, para las métricas del corte,
 * su fórmula.
 */
import { formatValue } from "./format";
import { getMetric } from "./metrics";

const escape = (value) => {
  const s = value == null ? "" : String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const line = (cells) => cells.map(escape).join(";");

const describeFilters = (filters = {}) => {
  const parts = Object.entries(filters)
    .filter(([, v]) => v != null && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`);
  return parts.length ? parts.join(" · ") : "sin filtros";
};

/**
 * Arma el CSV de un resultado de `query()`.
 * Se usa `;` como separador: es lo que espera Excel en configuración regional
 * es-AR, donde la coma es el separador decimal.
 */
export const buildCsv = (result, { filters = {}, title = "Consulta" } = {}) => {
  const rows = [];
  const metrics = (result.rows[0]?.values || result.totals).map((v) => v.key);

  // --- cabecera de contexto ---
  rows.push(line(["# CheCAT Panel · Analytics", title]));
  rows.push(line(["# Período", `${result.period.label} (${result.period.from.toLocaleDateString("es-AR")} a ${result.period.to.toLocaleDateString("es-AR")})`]));
  if (result.period.isPartial) rows.push(line(["# Aviso", "Período parcial: incluye el día de hoy, todavía sin cerrar."]));
  rows.push(line(["# Cortado por", result.dimension?.label || "Total del período"]));
  rows.push(line(["# Comparación", result.comparison?.label || "sin comparación"]));
  rows.push(line(["# Filtros", describeFilters(filters)]));
  rows.push(line(["# Origen de datos", result.sources.text]));
  rows.push(line(["# Extraído", new Date().toLocaleString("es-AR")]));
  rows.push(line(["#"]));

  // --- fórmula de cada métrica exportada ---
  metrics.forEach((key) => {
    const m = getMetric(key);
    if (m) rows.push(line([`# ${m.label}`, m.formula, `no incluye: ${(m.excludes || []).join(", ") || "—"}`]));
  });
  rows.push(line(["#"]));

  // --- encabezado de la tabla ---
  const header = [result.dimension?.label || "Total"];
  metrics.forEach((key) => {
    const m = getMetric(key);
    header.push(m?.label || key);
    if (result.comparison) header.push(`${m?.label || key} (comparación)`);
  });
  header.push("n");
  rows.push(line(header));

  // --- filas ---
  const source = result.rows.length ? result.rows : [{ label: "Total", values: result.totals }];
  source.forEach((r) => {
    const cells = [r.label];
    metrics.forEach((key) => {
      const v = r.values.find((x) => x.key === key);
      cells.push(v?.restricted ? "sin acceso" : formatValue(v?.value, v?.unit));
      if (result.comparison) cells.push(v?.restricted ? "sin acceso" : formatValue(v?.reference, v?.unit));
    });
    cells.push(r.values[0]?.sample ?? "");
    rows.push(line(cells));
  });

  // --- totales, cuando hay corte ---
  if (result.rows.length) {
    const cells = ["TOTAL"];
    metrics.forEach((key) => {
      const v = result.totals.find((x) => x.key === key);
      cells.push(v?.restricted ? "sin acceso" : formatValue(v?.value, v?.unit));
      if (result.comparison) cells.push(v?.restricted ? "sin acceso" : formatValue(v?.reference, v?.unit));
    });
    cells.push(result.totals[0]?.sample ?? "");
    rows.push(line(cells));
  }

  return rows.join("\n");
};

/** Dispara la descarga en el navegador. */
export const downloadCsv = (csv, filename) => {
  // El BOM hace que Excel abra el archivo en UTF-8 y no rompa los acentos.
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const csvFilename = (title, period) =>
  `checat-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${period.from.toISOString().slice(0, 10)}.csv`;
