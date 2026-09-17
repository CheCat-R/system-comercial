/**
 * Fecha de referencia para Finanzas. Mismo valor que el resto de los módulos.
 */
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const TODAY = startOfDay(new Date(2026, 8, 3)); // 2026-09-03

const pad = (n) => String(n).padStart(2, "0");

export const daysAgo = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
};

const toDayString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DDTHH:MM:SS" local — mismo formato que el resto de los mocks. */
export const atDaysAgo = (n, hh = "09", mm = "00", ss = "00") =>
  `${toDayString(daysAgo(n))}T${hh}:${mm}:${ss}`;

export const nowStamp = () => {
  const d = new Date();
  return atDaysAgo(0, pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds()));
};

export const monthKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const currentMonthKey = () => monthKey(TODAY);

export const prevMonthKey = (key) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const monthLabel = (key) => {
  if (!key) return "Todos los períodos";
  const [y, m] = key.split("-");
  const s = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const formatDate = (value) => {
  if (!value) return "—";
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const money = (n) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-AR")}`;

/** Porcentaje con un decimal: 0.534 → "53,4 %". */
export const percent = (ratio) => {
  if (ratio == null || !isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1).replace(".", ",")} %`;
};
