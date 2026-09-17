/**
 * Fecha de referencia para los mocks de Abastecimiento (órdenes de compra, recepciones).
 * Mismo valor que usan Inventario y el CRM, para que las fechas relativas coincidan entre módulos.
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

export const toDayString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "YYYY-MM-DDTHH:MM:SS" local, útil para sembrar timestamps. */
export const atDaysAgo = (n, hh = "09", mm = "00", ss = "00") =>
  `${toDayString(daysAgo(n))}T${hh}:${mm}:${ss}`;

export const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

export const daysBetween = (a, b) => Math.round(Math.abs(new Date(a) - new Date(b)) / 86_400_000);

/** "Hace 3 días", "Hoy", "Ayer", "Hace 2 meses" */
export const relativeFromToday = (value) => {
  if (!value) return "—";
  const d = daysBetween(TODAY, value);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d < 30) return `Hace ${d} días`;
  const months = Math.round(d / 30);
  if (months < 12) return `Hace ${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.round(d / 365);
  return `Hace ${years} ${years === 1 ? "año" : "años"}`;
};

export const money = (n) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`;
