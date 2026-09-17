/**
 * Las dimensiones: **por qué se corta** una métrica.
 *
 * Cerradas, como los bloques de la Tienda. Cada una declara de dónde sale su
 * valor y sobre qué grano agrupa (`order` o `line`), porque cortar "unidades
 * vendidas" por categoría sólo tiene sentido a nivel línea.
 *
 * Ver docs/MODULO-ANALYTICS.md §3.
 */
import { bucketsOf, granularityFor } from "./periods";

export const DIMENSIONS = {
  tiempo: {
    label: "Tiempo",
    hint: "El grano se ajusta solo al largo del período",
    source: "paidAt del pedido",
    level: "order",
    special: "time",
  },
  producto: {
    label: "Producto",
    source: "productos.catalogApi",
    level: "line",
    keyOf: (l) => l.skuId,
    labelOf: (l) => l.productName,
  },
  categoria: {
    label: "Categoría",
    source: "productos.catalogApi",
    level: "line",
    keyOf: (l) => l.categoryId || "sin",
    labelOf: (l) => l.categoryName,
  },
  marca: {
    label: "Marca",
    source: "productos.catalogApi",
    level: "line",
    keyOf: (l) => l.brandId || "sin",
    labelOf: (l) => l.brandName,
  },
  cliente: {
    label: "Cliente",
    source: "clientes.listAccounts",
    level: "order",
    keyOf: (o) => o.accountId,
    labelOf: (o) => o.customerName,
  },
  canal: {
    label: "Canal de venta",
    hint: "⚠ Proxy: se deriva del tipo de cuenta. No es canal de adquisición",
    source: "finanzas.channelOf (account.type)",
    level: "order",
    keyOf: (o) => o.channel,
    labelOf: (o) => o.channel,
  },
  zona: {
    label: "Zona",
    hint: "Única geografía del sistema",
    source: "logistica.listZones (keyword de la dirección)",
    level: "order",
    keyOf: (o) => o.zone,
    labelOf: (o) => o.zone,
  },
  deposito: {
    label: "Depósito",
    source: "inventario.listWarehouses",
    level: "order",
    keyOf: (o) => o.warehouseId,
    labelOf: (o) => o.warehouseName || o.warehouseId,
  },
  medioPago: {
    label: "Medio de pago",
    source: "pedidos.listOrders",
    level: "order",
    // Se agrupa por la marca del medio, no por los últimos 4 dígitos.
    keyOf: (o) => (o.paymentMethod || "").split(" (")[0],
    labelOf: (o) => (o.paymentMethod || "").split(" (")[0],
  },
  transportista: {
    label: "Transportista",
    source: "logistica.listCarriers",
    level: "order",
    keyOf: (o) => o.carrierId || "sin",
    labelOf: (o) => o.carrierName || "Sin transportista",
  },
};

export const listDimensions = () =>
  Object.entries(DIMENSIONS).map(([key, d]) => ({ key, ...d }));

export const getDimension = (key) => (DIMENSIONS[key] ? { key, ...DIMENSIONS[key] } : null);

/**
 * Parte la foto en grupos según la dimensión.
 * Devuelve `[{ key, label, facts }]`, donde `facts` es una foto recortada que
 * cada métrica puede calcular tal cual — así una métrica no necesita saber que
 * está siendo agrupada.
 */
export const groupFacts = (facts, dimensionKey) => {
  const dim = getDimension(dimensionKey);
  if (!dim) return [{ key: "total", label: "Total", facts }];

  if (dim.special === "time") {
    const granularity = granularityFor(facts.period);
    return bucketsOf(facts.period, granularity).map((bucket) => {
      const inBucket = (date) => {
        const t = new Date(date).getTime();
        return t >= bucket.from.getTime() && t <= bucket.to.getTime();
      };
      const orders = facts.orders.filter((o) => inBucket(o.date));
      const orderIds = new Set(orders.map((o) => o.id));
      return {
        key: bucket.key,
        label: bucket.label,
        from: bucket.from,
        to: bucket.to,
        facts: {
          ...facts,
          orders,
          lines: facts.lines.filter((l) => orderIds.has(l.orderId)),
          period: { ...facts.period, from: bucket.from, to: bucket.to, days: Math.max(1, Math.round((bucket.to - bucket.from) / 86400000)) },
        },
      };
    });
  }

  const groups = new Map();

  if (dim.level === "line") {
    facts.lines.forEach((l) => {
      const key = dim.keyOf(l);
      if (!groups.has(key)) groups.set(key, { key, label: dim.labelOf(l), lines: [], orderIds: new Set() });
      const g = groups.get(key);
      g.lines.push(l);
      g.orderIds.add(l.orderId);
    });
    return [...groups.values()].map((g) => ({
      key: g.key,
      label: g.label,
      facts: { ...facts, lines: g.lines, orders: facts.orders.filter((o) => g.orderIds.has(o.id)) },
    }));
  }

  facts.orders.forEach((o) => {
    const key = dim.keyOf(o);
    if (!groups.has(key)) groups.set(key, { key, label: dim.labelOf(o), orders: [] });
    groups.get(key).orders.push(o);
  });

  return [...groups.values()].map((g) => {
    const orderIds = new Set(g.orders.map((o) => o.id));
    return {
      key: g.key,
      label: g.label,
      facts: { ...facts, orders: g.orders, lines: facts.lines.filter((l) => orderIds.has(l.orderId)) },
    };
  });
};
