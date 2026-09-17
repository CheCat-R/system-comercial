/**
 * Cálculos puros de estado de stock. `available` es siempre derivado
 * (onHand − reserved) — nunca se persiste (ver docs/MODULO-INVENTARIO-ABASTECIMIENTO.md §4.1).
 */
export const available = (level) => Math.max((level.onHand || 0) - (level.reserved || 0), 0);

export const STOCK_STATUS = {
  ok: { key: "ok", label: "OK", tone: "success" },
  bajo_minimo: { key: "bajo_minimo", label: "Bajo mínimo", tone: "warning" },
  critico: { key: "critico", label: "Crítico", tone: "danger" },
  agotado: { key: "agotado", label: "Agotado", tone: "danger" },
};

const RANK = { ok: 0, bajo_minimo: 1, critico: 2, agotado: 3 };

export const stockStatusKey = (level) => {
  if ((level.onHand || 0) <= 0) return "agotado";
  const avail = available(level);
  if (avail <= (level.safetyStock || 0)) return "critico";
  if (avail <= (level.minStock || 0)) return "bajo_minimo";
  return "ok";
};

/** El peor estado entre varias filas de stock (para vistas agrupadas por SKU). */
export const worstStatusKey = (levels) =>
  levels.reduce((worst, l) => {
    const k = stockStatusKey(l);
    return RANK[k] > RANK[worst] ? k : worst;
  }, "ok");
