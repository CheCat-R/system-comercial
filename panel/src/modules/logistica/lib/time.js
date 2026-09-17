/**
 * Fecha de referencia para los mocks de Logística. Mismo valor que Pedidos/Inventario/Abastecimiento
 * para que los envíos sembrados y las fechas relativas coincidan entre módulos.
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

/** Suma días a una fecha ya sembrada/generada, preservando el formato local "YYYY-MM-DDTHH:MM:SS"
 * (evita el corrimiento de huso horario de `toISOString()`). Usada para la ETA de entrega. */
export const addDays = (value, days) => {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

export const money = (n) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`;
