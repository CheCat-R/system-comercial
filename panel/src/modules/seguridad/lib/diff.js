/**
 * ⭐ El registro de cambios, campo a campo (§2.9).
 *
 * La unidad es el **campo**, no la entidad: `precio: 12.500 → 14.900`, no
 * "se editó el producto". Un diff automático sobre el objeto entero registraría
 * ruido (`updatedAt`) y filtraría campos internos, así que **cada módulo declara
 * qué campos suyos son auditables** y con qué etiqueta se leen.
 *
 * Hoja sin imports.
 *
 * @sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
 *                    este archivo NO puede tener ni un `import`.
 */

/** Formatos de lectura. El valor se guarda crudo; esto es sólo para mostrarlo. */
const FORMATTERS = {
  money: (v) => (v == null ? "—" : `$${Number(v).toLocaleString("es-AR")}`),
  number: (v) => (v == null ? "—" : String(v)),
  text: (v) => (v == null || v === "" ? "—" : String(v)),
  date: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "—"),
  boolean: (v) => (v ? "sí" : "no"),
  percent: (v) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)} %`),
  list: (v) => (Array.isArray(v) ? `${v.length} ítem(s)` : "—"),
};

export const formatValue = (value, type = "text") => (FORMATTERS[type] || FORMATTERS.text)(value);

/**
 * Campos auditables declarados, por tipo de sujeto.
 *
 * Vive acá y no en cada módulo porque también es **cómo se lee** el cambio, y esa
 * es una decisión de presentación compartida. Un módulo que necesite los suyos
 * puede pasar su propia lista a `diffOf`.
 */
export const AUDITABLE = {
  order: [
    { field: "paymentStatus", label: "Estado de pago", type: "text" },
    { field: "fulfillmentStatus", label: "Estado logístico", type: "text" },
    { field: "total", label: "Total", type: "money" },
    { field: "discount", label: "Descuento", type: "money" },
    { field: "couponCode", label: "Cupón", type: "text" },
    { field: "rejectionReason", label: "Motivo del rechazo", type: "text" },
  ],
  sku: [
    { field: "onHand", label: "Stock físico", type: "number" },
    { field: "available", label: "Disponible", type: "number" },
    { field: "minStock", label: "Mínimo", type: "number" },
    { field: "safetyStock", label: "Stock de seguridad", type: "number" },
    { field: "price", label: "Precio", type: "money" },
    { field: "cost", label: "Costo", type: "money" },
  ],
  shipment: [
    { field: "status", label: "Estado del envío", type: "text" },
    { field: "carrierName", label: "Transporte", type: "text" },
    { field: "trackingCode", label: "Seguimiento", type: "text" },
  ],
  document: [
    { field: "status", label: "Estado", type: "text" },
    { field: "total", label: "Total", type: "money" },
  ],
  expense: [
    { field: "description", label: "Descripción", type: "text" },
    { field: "amount", label: "Importe", type: "money" },
    { field: "category", label: "Categoría", type: "text" },
    { field: "status", label: "Estado", type: "text" },
    { field: "date", label: "Fecha", type: "date" },
  ],
  rate: [
    { field: "percent", label: "Tasa", type: "percent" },
    { field: "label", label: "Nombre", type: "text" },
  ],
  connection: [
    { field: "provider", label: "Proveedor", type: "text" },
    { field: "mode", label: "Modo", type: "text" },
    { field: "enabled", label: "Habilitada", type: "boolean" },
  ],
  user: [
    { field: "roleKey", label: "Rol", type: "text" },
    { field: "status", label: "Estado de la cuenta", type: "text" },
    { field: "name", label: "Nombre", type: "text" },
    { field: "email", label: "Email", type: "text" },
  ],
  purchaseOrder: [
    { field: "status", label: "Estado", type: "text" },
    { field: "total", label: "Total", type: "money" },
  ],
};

export const auditableFields = (subjectType) => AUDITABLE[subjectType] || [];

/**
 * Compara **sólo los campos declarados**. Devuelve `[]` si no cambió ninguno, y
 * eso también es información: una operación que no cambió nada no es un cambio.
 */
export const diffOf = (before, after, fields) => {
  const declared = Array.isArray(fields) ? fields : auditableFields(fields);
  if (!before || !after) return [];

  return declared
    .map(({ field, label, type }) => ({
      field,
      label: label || field,
      type: type || "text",
      before: before[field],
      after: after[field],
    }))
    .filter((c) => JSON.stringify(c.before ?? null) !== JSON.stringify(c.after ?? null));
};

/** Un cambio armado a mano, cuando no hay un "antes" y un "después" que comparar. */
export const change = (label, before, after, type = "text") => ({
  field: label, label, before, after, type,
});

/** Para leer el cambio en una línea: «Estado de pago: Pendiente → Pagado». */
export const describeChange = (c) =>
  `${c.label}: ${formatValue(c.before, c.type)} → ${formatValue(c.after, c.type)}`;
