/**
 * Alertas de umbral sobre una métrica (§6, entidad `MetricAlert`).
 *
 * Una alerta es una regla explícita: *esta métrica, en este período, cruzó este
 * número*. **No hay detección automática de anomalías** (§1.4): con este volumen
 * de datos, "anomalía" es indistinguible de "martes".
 *
 * `operator`:
 *   lt → se dispara cuando el valor está POR DEBAJO del umbral
 *   gt → se dispara cuando está POR ENCIMA
 *
 * `threshold` va **en la unidad de la métrica**: los porcentajes como
 * proporción (0.08 = 8 %), el dinero en pesos, las horas en horas.
 */
export const alerts = [
  {
    id: "AL-01",
    metricKey: "contribution_margin_pct",
    operator: "lt",
    threshold: 0.28,
    period: "last30",
    enabled: true,
    note: "Debajo de 28 % el margen no cubre la estructura.",
  },
  {
    id: "AL-02",
    metricKey: "return_rate",
    operator: "gt",
    threshold: 0.08,
    period: "last30",
    enabled: true,
    note: "Más de 8 % de devoluciones suele ser un problema de talle o de descripción.",
  },
  {
    id: "AL-03",
    metricKey: "customers_new",
    operator: "lt",
    threshold: 10,
    period: "last30",
    enabled: true,
    note: "Menos de 10 altas en 30 días frena el crecimiento aunque el ingreso aguante.",
  },
  {
    id: "AL-04",
    metricKey: "out_of_stock",
    operator: "gt",
    threshold: 2,
    period: "last7",
    enabled: true,
    note: "Quiebres de stock: cada uno es una venta que no se pudo hacer.",
  },
  {
    id: "AL-05",
    metricKey: "ltv_cac_ratio",
    operator: "lt",
    threshold: 3,
    period: "last90",
    enabled: true,
    note: "La referencia del rubro es 3×. Debajo de 1× cada cliente nuevo pierde plata.",
  },
  {
    id: "AL-06",
    metricKey: "incident_rate",
    operator: "gt",
    threshold: 0.1,
    period: "last30",
    enabled: false,
    note: "Apagada: con pocos envíos vivos, una sola incidencia dispara el 10 %.",
  },
];
