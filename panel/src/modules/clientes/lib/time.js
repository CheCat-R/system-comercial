/**
 * Fecha de referencia para todos los cálculos del CRM (recencia, ventanas RFM).
 * Fijada para que los mocks sean deterministas. En producción: `startOfDay(new Date())`.
 */
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const TODAY = startOfDay(new Date(2026, 8, 3)); // 2026-09-03

/** Parsea "YYYY-MM-DD" (o un Date) a medianoche LOCAL — evita el corrimiento de zona horaria. */
export const parseDay = (v) => {
  if (v instanceof Date) return startOfDay(v);
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** "YYYY-MM-DD" local a partir de un Date. */
export const toDayString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const daysBetween = (a, b) => {
  const ms = parseDay(a).getTime() - parseDay(b).getTime();
  return Math.round(Math.abs(ms) / 86_400_000);
};

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

export const formatDate = (value) => {
  if (!value) return "—";
  return parseDay(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

export const money = (n) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`;
