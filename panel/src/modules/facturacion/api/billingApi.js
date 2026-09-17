/**
 * Única puerta de entrada de la UI de Facturación. Nada en `modules/facturacion/*.jsx` importa
 * `data/*.mock.js` directo — mismo criterio que los demás módulos.
 *
 * Facturación **lee** Pedidos (para la factura) y el CRM (condición fiscal del cliente) e Inventario
 * (alícuota por SKU); **no escribe** en ninguno. La factura se materializa sola para todo pedido
 * pagado que todavía no tenga una (`ensureDocsForOrder`), mismo criterio que los Envíos de Logística
 * — ver docs/MODULO-FINANZAS-FACTURACION.md §5.1.
 *
 * Estado en memoria: se resetea con un reload completo de la página (igual que los otros módulos).
 */
import { documents as seedDocuments } from "../data/documents.mock";
import { issuer, pointsOfSale as seedPos, vatByCategory as seedVat, perceptionRules as seedPerc } from "../data/fiscalConfig.mock";
import { listOrders, getOrder } from "../../pedidos/api/pedidosApi";
import { getSku } from "../../inventario/api/inventoryApi";
import { listAccounts } from "../../clientes/api/clientsApi";
import { resolveLetter, formatFullNumber, simulateCae } from "../lib/fiscal";
import { buildLines, buildBreakdown } from "../lib/taxes";
import { addDays, nowStamp, monthKey } from "../lib/time";
import { emit } from "../../automatizaciones/lib/bus";
import { port } from "../../integraciones/lib/ports";
// Hoja sin dependencias, como el bus: registrar es del módulo dueño (§2.7).
import { audit } from "../../seguridad/lib/audit";
import { change } from "../../seguridad/lib/diff";
import { sensitive } from "../../seguridad/lib/gate";

/**
 * ⭐ La autorización fiscal, por el puerto `invoicing.issue`.
 *
 * El `fallback` es el CAE simulado de siempre (`simulateCae`), que sigue
 * viviendo en `lib/fiscal.js`. Conectar un proveedor real no cambia el modelo:
 * un comprobante sigue siendo un `Document` de este módulo.
 *
 * Es de **sensibilidad alta**: presentar un CAE simulado como real es un
 * problema legal, así que cuando haya proveedor y falle, la emisión falla — no
 * cae al simulador.
 */
const issuePort = port("invoicing.issue", {
  fallback: ({ number, issueDate }) => ({ cae: simulateCae(`${number}|${issueDate}`), caeDueDate: null }),
});

const clone = (x) => JSON.parse(JSON.stringify(x));

let _docs = clone(seedDocuments);
let _pos = clone(seedPos);
let _vatByCategory = clone(seedVat);
let _perceptionRules = clone(seedPerc);

// Secuencias: una por (docType, letra, punto de venta) + el id interno.
const _seq = { docId: 0, byKey: {} };
const seqKey = (docType, letter, pv) => `${docType}|${letter}|${pv}`;

for (const d of _docs) {
  const n = Number(String(d.id).replace(/\D/g, "")) || 0;
  if (n > _seq.docId) _seq.docId = n;
  const k = seqKey(d.docType, d.letter, d.pointOfSale);
  _seq.byKey[k] = Math.max(_seq.byKey[k] || 0, d.number);
}

const nextDocId = () => `DOC-${String(++_seq.docId).padStart(4, "0")}`;
const nextNumber = (docType, letter, pv) => {
  const k = seqKey(docType, letter, pv);
  _seq.byKey[k] = (_seq.byKey[k] || 0) + 1;
  return _seq.byKey[k];
};

const defaultPv = () => _pos.find((p) => p.isDefault)?.id || _pos[0]?.id || "0001";

// ---------------------------------------------------------------------------
// Resolución del cliente (condición fiscal, CUIT, domicilio) — snapshot al emitir
// ---------------------------------------------------------------------------
const stripPhone = (a) => (a || "").split("·")[0].trim();
const fmtAddress = (adr) =>
  adr ? [adr.line1, adr.line2, `${adr.zip} ${adr.city}`, adr.country].filter(Boolean).join(", ") : "";

const resolveCustomer = (order) => {
  const account = listAccounts().find(
    (a) => a.name.trim().toLowerCase() === (order.customerName || "").trim().toLowerCase()
  );
  if (account) {
    const billing = account.addresses.find((x) => x.isDefaultBilling) || account.addresses[0] || null;
    return {
      customerId: account.id,
      customerName: account.legalName || account.name,
      customerTaxId: account.taxId || null,
      customerTaxCondition: account.taxCondition || "Consumidor Final",
      customerAddress: billing ? fmtAddress(billing) : stripPhone(order.address),
    };
  }
  return {
    customerId: null,
    customerName: order.customerName || "—",
    customerTaxId: null,
    customerTaxCondition: "Consumidor Final",
    customerAddress: stripPhone(order.address),
  };
};

// ---------------------------------------------------------------------------
// Creación de comprobantes
// ---------------------------------------------------------------------------
const createFacturaFromOrder = (order) => {
  const customer = resolveCustomer(order);
  const letter = resolveLetter(customer.customerTaxCondition);
  const pv = defaultPv();
  const number = nextNumber("factura", letter, pv);
  const fullNumber = formatFullNumber(pv, number);
  const lines = buildLines(order, getSku);
  const bd = buildBreakdown(lines);
  const issueDate = order.paidAt || nowStamp();
  return {
    id: nextDocId(),
    docType: "factura",
    letter,
    pointOfSale: pv,
    number,
    fullNumber,
    orderId: order.id,
    relatedDocId: null,
    scope: null,
    reason: null,
    ...customer,
    issueDate,
    lines,
    netByRate: bd.netByRate,
    vatByRate: bd.vatByRate,
    perceptions: [],
    totalNet: bd.totalNet,
    totalVat: bd.totalVat,
    totalPerceptions: 0,
    total: bd.total,
    cae: issuePort({ number: fullNumber, issueDate }).cae,
    caeExpiry: addDays(issueDate, 10).slice(0, 10),
    status: "emitido",
  };
};

const createNote = (docType, sourceDoc, { scope = "total", reason = "", issueDate, lines } = {}) => {
  const pv = sourceDoc.pointOfSale;
  const number = nextNumber(docType, sourceDoc.letter, pv);
  const fullNumber = formatFullNumber(pv, number);
  const when = issueDate || nowStamp();
  const noteLines = lines && lines.length ? lines : clone(sourceDoc.lines);
  const bd = buildBreakdown(noteLines);
  return {
    id: nextDocId(),
    docType,
    letter: sourceDoc.letter,
    pointOfSale: pv,
    number,
    fullNumber,
    orderId: sourceDoc.orderId,
    relatedDocId: sourceDoc.id,
    scope,
    reason,
    customerId: sourceDoc.customerId,
    customerName: sourceDoc.customerName,
    customerTaxId: sourceDoc.customerTaxId,
    customerTaxCondition: sourceDoc.customerTaxCondition,
    customerAddress: sourceDoc.customerAddress,
    issueDate: when,
    lines: noteLines,
    netByRate: bd.netByRate,
    vatByRate: bd.vatByRate,
    perceptions: [],
    totalNet: bd.totalNet,
    totalVat: bd.totalVat,
    totalPerceptions: 0,
    total: bd.total,
    cae: issuePort({ number: fullNumber, issueDate: when }).cae,
    caeExpiry: addDays(when, 10).slice(0, 10),
    status: "emitido",
  };
};

// ---------------------------------------------------------------------------
// Materialización perezosa (§5.1): factura para todo pedido pagado, NC para todo pedido devuelto
// ---------------------------------------------------------------------------
const ensureDocsForOrder = (order) => {
  if (!order || !["Pagado", "Reembolsado", "Reembolso pendiente"].includes(order.paymentStatus)) return;

  let factura = _docs.find((d) => d.docType === "factura" && d.orderId === order.id);
  if (!factura) {
    factura = createFacturaFromOrder(order);
    _docs = [factura, ..._docs];
  }

  const returned = order.paymentStatus === "Reembolsado" || order.fulfillmentStatus === "Devuelto";
  if (returned) {
    const hasNc = _docs.some((d) => d.docType === "nota_credito" && d.relatedDocId === factura.id);
    if (!hasNc) {
      const nc = createNote("nota_credito", factura, {
        scope: "total",
        reason: `Devolución del pedido #${order.id} — mercadería reintegrada al depósito`,
        issueDate: order.refundedAt || nowStamp(),
      });
      _docs = [nc, ..._docs];
    }
  }
};

const ensureDocsForPaidOrders = () => {
  // Orden ascendente por fecha de pago → los comprobantes que se materializan en vivo quedan
  // numerados cronológicamente.
  [...listOrders()]
    .sort((a, b) => new Date(a.paidAt || a.createdAt) - new Date(b.paidAt || b.createdAt))
    .forEach((o) => ensureDocsForOrder(o));
};

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------
const enrichDocument = (doc) => ({
  ...doc,
  relatedDoc: doc.relatedDocId ? _docs.find((d) => d.id === doc.relatedDocId) || null : null,
  relatedNotes: _docs
    .filter((d) => d.relatedDocId === doc.id)
    .sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate)),
});

export const listDocuments = ({ docType, letter, status, pointOfSale, search } = {}) => {
  ensureDocsForPaidOrders();
  const q = (search || "").trim().toLowerCase();
  return _docs
    .filter((d) => !docType || d.docType === docType)
    .filter((d) => !letter || d.letter === letter)
    .filter((d) => !status || d.status === status)
    .filter((d) => !pointOfSale || d.pointOfSale === pointOfSale)
    .filter(
      (d) =>
        !q ||
        d.fullNumber.includes(q) ||
        (d.customerName || "").toLowerCase().includes(q) ||
        (d.orderId || "").includes(q)
    )
    .map(enrichDocument)
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
};

export const getDocument = (id) => {
  ensureDocsForPaidOrders();
  const doc = _docs.find((d) => d.id === id);
  return doc ? enrichDocument(doc) : null;
};

/** Punto de entrada desde `PedidoDetalle.jsx` ("Ver factura"). Devuelve la factura del pedido. */
export const getInvoiceForOrder = (orderId) => {
  const order = getOrder(orderId);
  if (order) ensureDocsForOrder(order);
  const factura = _docs.find((d) => d.docType === "factura" && d.orderId === orderId);
  return factura ? enrichDocument(factura) : null;
};

export const getIssuer = () => ({ ...issuer });

// ---------------------------------------------------------------------------
// Emisión manual de NC / ND (la factura es automática) — §9.8
// ---------------------------------------------------------------------------
export const listInvoicesForNote = () =>
  listDocuments({ docType: "factura", status: "emitido" });

export const emitNote = (sourceDocId, { docType, scope = "total", reason = "", netAmount, taxRate = 0.21 } = {}) => {
  if (!["nota_credito", "nota_debito"].includes(docType)) throw new Error("Tipo de comprobante inválido.");
  const source = _docs.find((d) => d.id === sourceDocId);
  if (!source || source.docType !== "factura") throw new Error("Elegí una factura de origen válida.");
  if (source.status === "anulado") throw new Error("La factura de origen está anulada.");

  let lines;
  if (scope === "parcial") {
    const net = Math.max(0, Math.round(Number(netAmount) || 0));
    if (!net) throw new Error("Ingresá el importe neto del comprobante parcial.");
    if (docType === "nota_credito") {
      const alreadyCredited = _docs
        .filter((d) => d.docType === "nota_credito" && d.relatedDocId === source.id && d.status === "emitido")
        .reduce((s, d) => s + d.totalNet, 0);
      if (alreadyCredited + net > source.totalNet) {
        throw new Error("El total de notas de crédito no puede superar el neto de la factura.");
      }
    }
    lines = [
      {
        skuId: null,
        sku: "",
        description: docType === "nota_credito" ? "Ajuste por nota de crédito" : "Ajuste por nota de débito",
        qty: 1,
        unitNetPrice: net,
        taxRate: Number(taxRate) || 0,
        lineNet: net,
        lineVat: Math.round(net * (Number(taxRate) || 0)),
      },
    ];
  }

  const note = createNote(docType, source, { scope, reason, lines });
  _docs = [note, ..._docs];
  const doc = enrichDocument(note);
  emit("nota.emitida", { type: "document", id: doc.id }, {
    documentId: doc.id, invoiceId: source.id, type: docType, total: doc.total ?? 0,
  });
  return doc;
};

export const voidDocument = (id, { reason } = {}) => {
  const doc = _docs.find((d) => d.id === id);
  if (!doc) throw new Error("Comprobante no encontrado.");
  if (doc.docType !== "factura") throw new Error("Sólo se pueden anular facturas.");
  if (_docs.some((d) => d.relatedDocId === id && d.status === "emitido")) {
    throw new Error("La factura tiene notas de crédito/débito asociadas — no se puede anular.");
  }

  return sensitive({
    action: "facturacion.anular",
    subject: { type: "document", id, label: `${doc.docType} ${doc.fullNumber}` },
    reason,
    preview: `Anular ${doc.docType} ${doc.fullNumber} por $${Math.round(doc.total).toLocaleString("es-AR")}`,
    meta: { consecuencias: "fiscales: no se deshace" },
    // Entre el pedido y la firma alguien pudo emitir una NC contra esta factura.
    revalidate: () => {
      const now = _docs.find((d) => d.id === id);
      if (!now) return "Ese comprobante ya no existe.";
      if (now.status === "anulado") return "Ya estaba anulado.";
      if (_docs.some((d) => d.relatedDocId === id && d.status === "emitido")) {
        return "Mientras tanto se le emitió una nota asociada: ya no se puede anular.";
      }
      return null;
    },
    run: () => {
      _docs = _docs.map((d) => (d.id === id ? { ...d, status: "anulado" } : d));
      return {
        value: getDocument(id),
        changes: [change("Estado", "emitido", "anulado"), change("Total", doc.total, doc.total, "money")],
      };
    },
  });
};

// ---------------------------------------------------------------------------
// Libro IVA Ventas + resumen — §3.3 / §9.9
// ---------------------------------------------------------------------------
const signed = (doc, value) => (doc.docType === "nota_credito" ? -value : value);

export const getAvailableMonths = () => {
  ensureDocsForPaidOrders();
  return [...new Set(_docs.map((d) => monthKey(d.issueDate)))].sort().reverse();
};

export const getVatBook = ({ month } = {}) => {
  const rows = listDocuments({ status: "emitido" })
    .filter((d) => !month || monthKey(d.issueDate) === month)
    .sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate));

  const totals = { net21: 0, net105: 0, net0: 0, vat21: 0, vat105: 0, perceptions: 0, total: 0 };
  for (const d of rows) {
    totals.net21 += signed(d, d.netByRate["0.21"] || 0);
    totals.net105 += signed(d, d.netByRate["0.105"] || 0);
    totals.net0 += signed(d, d.netByRate["0"] || 0);
    totals.vat21 += signed(d, d.vatByRate["0.21"] || 0);
    totals.vat105 += signed(d, d.vatByRate["0.105"] || 0);
    totals.perceptions += signed(d, d.totalPerceptions || 0);
    totals.total += signed(d, d.total);
  }
  return { rows, totals };
};

export const getBillingSummary = ({ month } = {}) => {
  ensureDocsForPaidOrders();
  const target = month || getAvailableMonths()[0] || null;
  const inMonth = _docs.filter((d) => d.status === "emitido" && (!target || monthKey(d.issueDate) === target));

  const facturas = inMonth.filter((d) => d.docType === "factura");
  const notasCredito = inMonth.filter((d) => d.docType === "nota_credito");
  const notasDebito = inMonth.filter((d) => d.docType === "nota_debito");

  return {
    month: target,
    facturadoNeto: facturas.reduce((s, d) => s + d.totalNet, 0) - notasCredito.reduce((s, d) => s + d.totalNet, 0),
    ivaDebito: facturas.reduce((s, d) => s + d.totalVat, 0) - notasCredito.reduce((s, d) => s + d.totalVat, 0),
    notasCreditoMonto: notasCredito.reduce((s, d) => s + d.total, 0),
    notasCreditoCount: notasCredito.length,
    notasDebitoCount: notasDebito.length,
    comprobantesEmitidos: inMonth.length,
  };
};

// ---------------------------------------------------------------------------
// Configuración impositiva (§9.9)
// ---------------------------------------------------------------------------
export const getPointsOfSale = () => clone(_pos);
export const getVatByCategory = () => clone(_vatByCategory);
export const getPerceptionRules = () => clone(_perceptionRules);

export const updateVatCategory = (category, rate) => {
  const before = _vatByCategory.find((v) => v.category === category);
  _vatByCategory = _vatByCategory.map((v) => (v.category === category ? { ...v, rate: Number(rate) } : v));
  audit({
    action: "facturacion.iva",
    subject: { type: "document", id: category, label: `Categoría ${category}` },
    changes: [change("Alícuota", before?.rate, Number(rate), "percent")],
    meta: { alcance: "afecta todo lo que se emita a partir de ahora" },
    requireActor: true,
  });
  return getVatByCategory();
};

export const togglePerceptionRule = (jurisdiction) => {
  _perceptionRules = _perceptionRules.map((p) =>
    p.jurisdiction === jurisdiction ? { ...p, active: !p.active } : p
  );
  return getPerceptionRules();
};
