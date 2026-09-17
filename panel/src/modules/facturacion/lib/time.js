/**
 * Fecha de referencia para los mocks de Facturación. Mismo valor que Pedidos / Inventario / CRM /
 * Logística para que los comprobantes sembrados coincidan con las fechas de los pedidos.
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

const pad = (n) => String(n).padStart(2, "0");
const toDayString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DDTHH:MM:SS" local — mismo formato que el resto de los mocks. */
export const atDaysAgo = (n, hh = "09", mm = "00", ss = "00") =>
  `${toDayString(daysAgo(n))}T${hh}:${mm}:${ss}`;

/** Suma días preservando el formato local (evita el corrimiento de huso de `toISOString()`). */
export const addDays = (value, days) => {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const nowStamp = () => {
  const d = new Date();
  return atDaysAgo(0, pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds()));
};

export const formatDate = (value) => {
  if (!value) return "—";
  // Una fecha "pelada" ("YYYY-MM-DD") se parsea como UTC y se corre un día en husos negativos —
  // la anclamos al mediodía local.
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Clave de mes "YYYY-MM" para filtrar el Libro IVA. */
export const monthKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const monthLabel = (key) => {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
};

export const money = (n) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-AR")}`;
