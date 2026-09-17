/**
 * Fecha de referencia para los mocks de Marketing. Mismo valor que el resto de los módulos.
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

/** "YYYY-MM-DDTHH:MM:SS" local. `n` negativo = futuro. */
export const atDaysAgo = (n, hh = "09", mm = "00", ss = "00") =>
  `${toDayString(daysAgo(n))}T${hh}:${mm}:${ss}`;

export const nowStamp = () => {
  const d = new Date();
  return atDaysAgo(0, pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds()));
};

/** Suma minutos preservando el formato local "YYYY-MM-DDTHH:MM:SS". */
export const addMinutes = (value, mins) => {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() + mins);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Suma meses preservando el formato local "YYYY-MM-DDTHH:MM:SS". */
export const addMonths = (value, months) => {
  const d = new Date(value);
  d.setMonth(d.getMonth() + Number(months || 0));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const monthKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
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

/** "hoy" / "ayer" / "hace N días" respecto de la fecha de referencia. */
export const relativeFromToday = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  const days = Math.floor((TODAY - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30);
  return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
};

export const money = (n) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-AR")}`;

export const percent = (ratio) => {
  if (ratio == null || !isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1).replace(".", ",")} %`;
};
