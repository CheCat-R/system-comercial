/**
 * ⭐ Centro de comando — la portada del panel.
 *
 * Hasta la auditoría de plataforma, **esta pantalla no importaba ningún `api/`**:
 * sus cuatro KPIs, sus alertas y su gráfico eran literales escritos a mano, sobre
 * un ERP con diez módulos y datos reales debajo. Y entre esos literales había uno
 * particularmente caro: *"Tasa de conversión 3,2 %"*, una métrica que
 * `docs/MODULO-ANALYTICS.md §2.8` declara textualmente **no medible** — no hay
 * sesiones ni visitas en el sistema. Un panel que publica un número que su propia
 * documentación dice que no puede conocer pierde la credibilidad de todos los
 * demás.
 *
 * Ahora todo lo que se ve acá sale de las capas que ya existían:
 *
 *   analyticsApi.getSummary()      KPIs con su delta, la serie y el top de productos
 *   inventoryApi                   quiebres de stock y bajo mínimo
 *   logisticaApi                   qué hay por preparar y en tránsito
 *   financeApi                     reembolsos esperando aprobación
 *   securityApi.getAuditLog()      quién hizo qué, recién
 *   securityApi (aprobaciones)     lo que espera una firma
 *
 * ── ⭐ Lo que NO está, y por qué ────────────────────────────────────────
 *
 * No hay tasa de conversión. En su lugar va el **margen de contribución**, que el
 * panel sí puede calcular porque conoce el costo de cada SKU, el envío real y la
 * comisión de la pasarela. Preferir una métrica verdadera a una linda es la única
 * forma de que el resto del tablero valga algo.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PercentOutlinedIcon from "@mui/icons-material/PercentOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

// Todo lo de abajo es lectura por el `api/` del módulo dueño: la portada no
// conoce ningún `data/`, igual que cualquier otra pantalla del panel.
import { getSummary } from "../analytics/api/analyticsApi";
import SeriesChart from "../analytics/components/SeriesChart";
import { formatValue } from "../analytics/lib/format";
import { getPortfolioSummary as getStockSummary } from "../inventario/api/inventoryApi";
import { getPortfolioSummary as getShipmentSummary } from "../logistica/api/logisticaApi";
import { listRefunds } from "../finanzas/api/financeApi";
import { getAuditLog, getApprovalsSummary, getActorKind } from "../seguridad/api/securityApi";

import "./Dashboard.css";

/** Los cuatro KPIs de la portada. La conversión no está: no se puede medir. */
const HEADLINE = [
  { key: "revenue_net", icon: <PaymentsOutlinedIcon /> },
  { key: "orders_paid", icon: <ShoppingCartOutlinedIcon /> },
  { key: "aov", icon: <ReceiptLongOutlinedIcon /> },
  { key: "contribution_margin_pct", icon: <PercentOutlinedIcon /> },
];

const PERIODS = [
  { value: "last7", label: "Últimos 7 días" },
  { value: "last30", label: "Últimos 30 días" },
  { value: "last90", label: "Últimos 90 días" },
];

const LEVEL_TONE = { error: "danger", warning: "warning", info: "info" };
const LEVEL_LABEL = { error: "Alerta", warning: "Aviso", info: "Nota" };

const stamp = (iso) => new Date(iso).toLocaleString("es-AR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || "";

  const [period, setPeriod] = useState("last30");

  // El selector de período ahora hace algo: antes era un `useState` que no
  // llegaba a ningún lado porque no había datos que filtrar.
  const summary = useMemo(() => getSummary({ period, compare: "previous", role }), [period, role]);

  /**
   * ⭐ Las urgencias, contadas por quien las conoce.
   *
   * Cada línea la responde el módulo dueño; la portada sólo las ordena y las
   * enlaza. Las que están en cero no se muestran: un tablero que dice "0
   * quiebres de stock" con la misma tarjeta roja que usa para 3 enseña a
   * ignorar el color.
   */
  const urgencias = useMemo(() => {
    const stock = getStockSummary();
    const envios = getShipmentSummary();
    const reembolsos = listRefunds({ status: "solicitado" });
    const firmas = getApprovalsSummary();

    return [
      stock.outOfStock > 0 && {
        tone: "danger",
        icon: <Inventory2OutlinedIcon fontSize="small" />,
        title: `Quiebre de stock (${stock.outOfStock})`,
        desc: `${stock.belowMin} combinación(es) más por debajo del mínimo.`,
        cta: "Ver stock",
        to: "/inventario",
      },
      envios.porPreparar > 0 && {
        tone: "warning",
        icon: <LocalShippingOutlinedIcon fontSize="small" />,
        title: `Pendientes de preparación (${envios.porPreparar})`,
        desc: `${envios.enTransito} en tránsito ahora mismo.`,
        cta: "Procesar",
        to: "/logistica",
      },
      reembolsos.length > 0 && {
        tone: "warning",
        icon: <UndoOutlinedIcon fontSize="small" />,
        title: `Reembolsos por resolver (${reembolsos.length})`,
        desc: "Mercadería devuelta; el dinero todavía no se movió.",
        cta: "Revisar",
        to: "/finanzas/reembolsos",
      },
      firmas.pending > 0 && {
        tone: "info",
        icon: <ShieldOutlinedIcon fontSize="small" />,
        title: `Esperando una firma (${firmas.pending})`,
        desc: "Operaciones sensibles pedidas y todavía no aprobadas.",
        cta: "Firmar",
        to: "/seguridad/aprobaciones",
      },
    ].filter(Boolean);
  }, []);

  /** La traza real, no una lista de actividad inventada. */
  const actividad = useMemo(() => {
    const log = getAuditLog({ limit: 6, onlyChanges: true }, { role: user });
    return log.ok ? log.entries : [];
  }, [user]);

  const maxProduct = Math.max(...summary.topProducts.map((r) => r.values[0]?.value || 0), 1);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Centro de comando"
        subtitle="Todo lo que se ve acá sale de los módulos, en vivo. Ningún número está escrito a mano."
        actions={(
          <Box className="dash-header-actions">
            <Select
              size="small"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="dash-period"
            >
              {PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
            </Select>
            <Button
              variant="primary"
              startIcon={<InsightsOutlinedIcon />}
              onClick={() => navigate("/analytics")}
            >
              Abrir Analytics
            </Button>
          </Box>
        )}
      />

      {/* ------------------------------------------------------- KPIs */}
      <Grid container spacing={2}>
        {HEADLINE.map(({ key, icon }) => {
          const kpi = summary.kpis.find((k) => k.key === key);
          if (!kpi) return null;

          // ⭐ El motor de Analytics no calcula lo que este rol no puede ver, y
          // la portada lo dice en vez de mostrar un guion sin explicación.
          if (kpi.restricted) {
            return (
              <Grid size={{ xs: 6, sm: 6, md: 3 }} key={key}>
                <Card className="stat-card dash-restricted">
                  <div className="stat-card__head">
                    <span className="stat-card__title">{kpi.label}</span>
                    <span className="stat-card__icon"><LockOutlinedIcon /></span>
                  </div>
                  <div className="dash-restricted__msg">
                    Tu rol no ve esta métrica. El motor directamente no la calcula.
                  </div>
                </Card>
              </Grid>
            );
          }

          const d = kpi.delta;
          const pct = d?.pct == null ? null : `${Math.abs(d.pct * 100).toFixed(1)} %`;
          // Subir no siempre es bueno: la devolución que crece es mala noticia.
          const good = d && d.direction !== "flat"
            ? (d.direction === "up") === (kpi.higherIsBetter !== false)
            : null;

          return (
            <Grid size={{ xs: 6, sm: 6, md: 3 }} key={key}>
              <Tooltip title={kpi.metric?.formula ? `${kpi.metric.formula}` : kpi.label}>
                <span className="dash-kpi-wrap">
                  <StatCard
                    title={kpi.label}
                    value={formatValue(kpi.value, kpi.unit)}
                    icon={icon}
                    delta={pct ? { value: pct, direction: d.direction, good } : null}
                    hint={kpi.referenceLabel ? `vs. ${kpi.referenceLabel}` : summary.period?.label}
                  />
                </span>
              </Tooltip>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2}>
        {/* ------------------------------------------------- la serie */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card className="entity-card dash-chart-card">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                Ingreso neto en el tiempo
              </Typography>
              <Typography variant="caption" className="text-tertiary">
                {summary.granularityLabel} · {summary.period?.label}
              </Typography>
            </Box>
            <SeriesChart
              rows={summary.series}
              metricKey="revenue_net"
              unit="money"
              boundary={summary.boundary}
              comparisonLabel={summary.comparison?.label}
            />
          </Card>
        </Grid>

        {/* --------------------------------------------- qué requiere atención */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card className="entity-card dash-side">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                Qué requiere atención
              </Typography>
            </Box>

            {urgencias.length === 0 && summary.attention.length === 0 && (
              <Typography variant="body2" className="text-tertiary">
                Nada pendiente: sin quiebres de stock, sin envíos trabados, sin reembolsos ni firmas
                esperando. Los avisos aparecen solos cuando algo se sale de lo previsto.
              </Typography>
            )}

            {/* Lo operativo: se puede accionar ahora, desde acá. */}
            {urgencias.map((u) => (
              <div className={`dash-alert dash-alert--${u.tone}`} key={u.title}>
                <span className="dash-alert__icon">{u.icon}</span>
                <div className="dash-alert__body">
                  <strong>{u.title}</strong>
                  <em>{u.desc}</em>
                </div>
                <Button variant="ghost" size="small" onClick={() => navigate(u.to)}>{u.cta}</Button>
              </div>
            ))}

            {/* Lo analítico: alertas de umbral y objetivos incumplidos, que ya
                calculaba Analytics y nadie miraba desde la portada. */}
            {summary.attention.slice(0, 3).map((a, i) => (
              <div className="dash-note" key={`${a.metricKey || "gen"}-${i}`}>
                <StatusBadge tone={LEVEL_TONE[a.level]} label={LEVEL_LABEL[a.level]} showDot={false} />
                <span>{a.message}</span>
              </div>
            ))}
          </Card>
        </Grid>

        {/* ------------------------------------------- top de productos */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card className="entity-card">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                Productos que más facturan
              </Typography>
              <Button variant="ghost" onClick={() => navigate("/analytics/explorador")}>
                Explorar →
              </Button>
            </Box>

            {summary.topProducts.length === 0 ? (
              <Typography variant="body2" className="text-tertiary">
                Todavía no hay ventas en este período.
              </Typography>
            ) : summary.topProducts.map((row) => {
              const revenue = row.values.find((v) => v.key === "revenue_net")?.value || 0;
              const units = row.values.find((v) => v.key === "units_sold")?.value || 0;
              return (
                <div className="dash-rank" key={row.key}>
                  <span className="dash-rank__label">{row.label}</span>
                  <span className="dash-rank__track">
                    <span
                      className="dash-rank__bar"
                      style={{ width: `${Math.max(2, (revenue / maxProduct) * 100)}%` }}
                    />
                  </span>
                  <span className="dash-rank__value">
                    {formatValue(revenue, "money")}
                    <em>{units} u.</em>
                  </span>
                </div>
              );
            })}
          </Card>
        </Grid>

        {/* ------------------------------------------------- actividad */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card className="entity-card">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                Qué se hizo recién
              </Typography>
              <Button variant="ghost" onClick={() => navigate("/seguridad/auditoria")}>
                Ver la auditoría →
              </Button>
            </Box>

            {actividad.length === 0 ? (
              <Typography variant="body2" className="text-tertiary">
                Sin movimientos en esta sesión. La auditoría empieza a llenarse cuando alguien opera:
                no hay asientos inventados hacia atrás.
              </Typography>
            ) : (
              <Box className="dash-activity">
                {actividad.map((e) => (
                  <div className="dash-activity__row" key={e.id}>
                    <span className={`dash-activity__dot dash-activity__dot--${getActorKind(e.actor?.kind).tone}`} />
                    <div className="dash-activity__body">
                      <strong>{e.actor?.name || "Sistema"}</strong>
                      <span>{e.changes[0]?.label ? `${e.action} · ${e.changes[0].label}` : e.action}</span>
                    </div>
                    <em>{stamp(e.at)}</em>
                  </div>
                ))}
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
