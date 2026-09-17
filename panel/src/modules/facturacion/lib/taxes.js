/**
 * Descomposición impositiva de un comprobante — ver docs/MODULO-FINANZAS-FACTURACION.md §3.3.
 * Puro, sin estado. El IVA se calcula sobre el neto **agregado por alícuota** (no por línea) para
 * que el total del comprobante coincida al peso con el total del pedido (§7.1).
 */

export const VAT_RATE_LABELS = {
  "0": "No gravado",
  "0.105": "10,5 %",
  "0.21": "21 %",
  "0.27": "27 %",
};

export const vatRateLabel = (rate) => VAT_RATE_LABELS[String(rate)] || `${(rate * 100).toFixed(1)} %`;

/**
 * Arma las líneas del comprobante a partir de las líneas del pedido (ya enriquecidas por
 * `pedidosApi`) + una línea de "Envío" no gravada para que el total cuadre con lo cobrado.
 */
export const buildLines = (order, skuResolver) => {
  const lines = order.items.map((it) => {
    const sku = skuResolver(it.skuId);
    const taxRate = sku?.taxRate ?? 0.21;
    const lineNet = it.qty * it.unitPrice;
    return {
      skuId: it.skuId,
      sku: sku?.sku || "",
      description: it.name || sku?.name || it.skuId,
      qty: it.qty,
      unitNetPrice: it.unitPrice,
      taxRate,
      lineNet,
      lineVat: Math.round(lineNet * taxRate),
    };
  });

  // Descuento de Marketing (§7.1) — línea negativa que reduce la base gravada. En la Fase 1 el
  // catálogo es uniforme al 21 %, así que el descuento va a la alícuota del primer producto.
  if (order.discount > 0) {
    const rate = lines.find((l) => l.skuId)?.taxRate ?? 0.21;
    lines.push({
      skuId: null,
      sku: "",
      description: order.couponCode ? `Descuento (cupón ${order.couponCode})` : "Descuento promocional",
      qty: 1,
      unitNetPrice: -order.discount,
      taxRate: rate,
      lineNet: -order.discount,
      lineVat: -Math.round(order.discount * rate),
    });
  }

  if (order.shipping) {
    lines.push({
      skuId: null,
      sku: "",
      description: "Envío",
      qty: 1,
      unitNetPrice: order.shipping,
      taxRate: 0,
      lineNet: order.shipping,
      lineVat: 0,
    });
  }
  return lines;
};

/** Neto e IVA por alícuota + totales. El IVA de cada alícuota se redondea sobre el neto agregado. */
export const buildBreakdown = (lines, { perceptions = [] } = {}) => {
  const netByRate = {};
  for (const l of lines) {
    const k = String(l.taxRate);
    netByRate[k] = (netByRate[k] || 0) + l.lineNet;
  }
  const vatByRate = {};
  for (const k of Object.keys(netByRate)) {
    const rate = Number(k);
    if (rate > 0) vatByRate[k] = Math.round(netByRate[k] * rate);
  }
  const totalNet = Object.values(netByRate).reduce((a, b) => a + b, 0);
  const totalVat = Object.values(vatByRate).reduce((a, b) => a + b, 0);
  const totalPerceptions = perceptions.reduce((a, p) => a + p.amount, 0);
  return {
    netByRate,
    vatByRate,
    perceptions,
    totalNet,
    totalVat,
    totalPerceptions,
    total: totalNet + totalVat + totalPerceptions,
  };
};
