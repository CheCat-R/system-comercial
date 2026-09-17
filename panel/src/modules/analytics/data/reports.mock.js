/**
 * Reportes de fábrica.
 *
 * Un reporte **es una consulta guardada con una forma de visualización** — nada
 * más. Estos ocho vienen cargados para que la pantalla no arranque vacía y para
 * mostrar qué preguntas sabe responder el motor. Se pueden duplicar y editar;
 * los de sistema no se borran.
 */
import { atDaysAgo } from "../../marketing/lib/time";

export const reports = [
  {
    id: "RP-01", system: true,
    name: "Top productos por margen",
    description: "Qué productos dejan más plata, no cuáles venden más unidades.",
    view: "bar",
    query: {
      metrics: ["gross_margin", "revenue_net", "units_sold"],
      dimension: "producto", period: "last90", compare: "none", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(60),
  },
  {
    id: "RP-02", system: true,
    name: "Rentabilidad por canal",
    description: "Tienda web contra mayorista, con el margen de contribución de cada uno.",
    view: "table",
    query: {
      metrics: ["revenue_net", "contribution_margin", "contribution_margin_pct", "orders_paid"],
      dimension: "canal", period: "thisYear", compare: "none", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(60),
  },
  {
    id: "RP-03", system: true,
    name: "Efectividad de cupones",
    description: "Cuánto se usan y si suben o bajan el ticket.",
    view: "line",
    query: {
      metrics: ["coupon_orders", "aov_with_coupon", "aov", "discount_given"],
      dimension: "tiempo", period: "last90", compare: "previous", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(45),
  },
  {
    id: "RP-04", system: true,
    name: "Ingresos por categoría",
    description: "Dónde está el volumen y a qué precio efectivo sale cada unidad.",
    view: "bar",
    query: {
      metrics: ["revenue_net", "units_sold", "avg_unit_price"],
      dimension: "categoria", period: "last90", compare: "previous", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(45),
  },
  {
    id: "RP-05", system: true,
    name: "Clientes por zona",
    description: "Dónde está la base y cuánto deja cada región.",
    view: "table",
    query: {
      metrics: ["customers_active", "revenue_net", "aov", "orders_paid"],
      dimension: "zona", period: "last90", compare: "none", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(30),
  },
  {
    id: "RP-06", system: true,
    name: "Envíos y demoras",
    description: "Cuánto tardamos nosotros y cuánto el transportista.",
    view: "table",
    query: {
      metrics: ["dispatch_lead_time", "delivery_lead_time", "delivery_rate", "incident_rate"],
      dimension: "tiempo", period: "last90", compare: "none", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(30),
  },
  {
    id: "RP-07", system: true,
    name: "Embudo de checkout",
    description: "De los pedidos que se inician, cuántos se cobran. No es la conversión del sitio.",
    view: "line",
    query: {
      metrics: ["checkout_conversion", "orders_paid"],
      dimension: "tiempo", period: "last30", compare: "previous", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(20),
  },
  {
    id: "RP-08", system: true,
    name: "Evolución del ticket",
    description: "Si el ticket sube por precio o porque se llevan más unidades.",
    view: "line",
    query: {
      metrics: ["aov", "units_per_order", "avg_unit_price"],
      dimension: "tiempo", period: "thisYear", compare: "none", filters: {},
    },
    createdBy: "Sistema", createdAt: atDaysAgo(15),
  },
];
