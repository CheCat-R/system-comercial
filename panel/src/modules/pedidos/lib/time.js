/**
 * Fecha de referencia para los mocks de Pedidos. Mismo valor que Inventario/Abastecimiento/CRM
 * para que las reservas sembradas (ej. pedido #10254) y las fechas relativas coincidan entre módulos.
 */
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const TODAY = startOfDay(new Date(2026, 8, 3)); // 2026-09-03

export const daysAgo = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
};

const toDayString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "YYYY-MM-DDTHH:MM:SS" local, útil para sembrar timestamps. */
export const atDaysAgo = (n, hh = "09", mm = "00", ss = "00") =>
  `${toDayString(daysAgo(n))}T${hh}:${mm}:${ss}`;

/** Diferencia en días CALENDARIO (no en bloques de 24hs) — normaliza a medianoche antes de restar,
 * si no un timestamp de las 23:59 comparado contra la medianoche de hoy redondea mal a "Ayer". */
export const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86_400_000);

/** "Hoy, 14:30" / "Ayer, 18:40" / "15 ago, 16:00" — mismo formato que ya mostraba el listado. */
export const orderDateLabel = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const diff = daysBetween(TODAY, d);
  if (diff === 0) return `Hoy, ${time}`;
  if (diff === 1) return `Ayer, ${time}`;
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}, ${time}`;
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

export const money = (n) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`;
