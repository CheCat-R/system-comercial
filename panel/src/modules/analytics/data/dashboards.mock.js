/**
 * Dashboards de arranque (§6, entidades `Dashboard` y `Widget`).
 *
 * **Un widget es una consulta con forma.** No guarda números ni una copia de
 * nada: guarda el mismo objeto `{ metrics, dimension, period, compare, filters }`
 * que un reporte, más el `type` que dice cómo dibujarlo. Por eso un widget
 * siempre coincide con el Explorador — es literalmente la misma consulta.
 *
 * `size` es el ancho en columnas de una grilla de 3. Sin arrastrar y soltar: se
 * mueve con flechas, igual que el outline del Store Builder (§9.5).
 */
export const dashboards = [
  {
    id: "DB-01",
    name: "Operación diaria",
    description: "Lo que se mira cada mañana antes de abrir el resto del panel.",
    isDefault: true,
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    widgets: [
      {
        id: "W-01", type: "kpi", size: 1, title: "Ingresos netos",
        query: { metrics: ["revenue_net"], dimension: null, period: "last30", compare: "previous", filters: {} },
      },
      {
        id: "W-02", type: "kpi", size: 1, title: "Pedidos pagados",
        query: { metrics: ["orders_paid"], dimension: null, period: "last30", compare: "previous", filters: {} },
      },
      {
        id: "W-03", type: "kpi", size: 1, title: "Ticket promedio",
        query: { metrics: ["aov"], dimension: null, period: "last30", compare: "previous", filters: {} },
      },
      {
        id: "W-04", type: "line", size: 2, title: "Ingresos en el tiempo",
        query: { metrics: ["revenue_net"], dimension: "tiempo", period: "last90", compare: "previous", filters: {} },
      },
      {
        id: "W-05", type: "bar", size: 1, title: "Top categorías",
        query: { metrics: ["revenue_net"], dimension: "categoria", period: "last90", compare: "none", filters: {} },
      },
      {
        id: "W-06", type: "table", size: 3, title: "Productos: ingreso y unidades",
        query: { metrics: ["revenue_net", "units_sold"], dimension: "producto", period: "last90", compare: "previous", filters: {} },
      },
    ],
  },
  {
    id: "DB-02",
    name: "Retención",
    description: "Si el negocio crece por clientes nuevos o por los que vuelven.",
    isDefault: false,
    system: true,
    createdBy: "CheCAT",
    createdAt: "2026-09-01T09:00:00.000Z",
    widgets: [
      {
        id: "W-07", type: "kpi", size: 1, title: "Clientes nuevos",
        query: { metrics: ["customers_new"], dimension: null, period: "last90", compare: "previous", filters: {} },
      },
      {
        id: "W-08", type: "kpi", size: 1, title: "Tasa de recompra",
        query: { metrics: ["repeat_rate"], dimension: null, period: "last90", compare: "previous", filters: {} },
      },
      {
        id: "W-09", type: "kpi", size: 1, title: "% de ingreso recurrente",
        query: { metrics: ["returning_revenue_share"], dimension: null, period: "last90", compare: "previous", filters: {} },
      },
      {
        id: "W-10", type: "cohort", size: 3, title: "Cohortes de adquisición",
        query: { metrics: ["revenue_net"], dimension: null, period: "thisYear", compare: "none", filters: {} },
      },
    ],
  },
];
