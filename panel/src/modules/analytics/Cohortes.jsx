/**
 * Cohortes y retención (§9.3).
 *
 * Es la pantalla donde más se nota si alguien no leyó las definiciones, así que
 * las fórmulas van a la vista y no escondidas en un tooltip: cada número del
 * bloque LTV / CAC abre su ficha, y el aviso de la ventana está fijo arriba.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

import MetricCard from "./components/MetricCard";
import CohortMatrix from "./components/CohortMatrix";
import SeriesChart from "./components/SeriesChart";
import { getCohorts } from "./api/analyticsApi";
import { formatValue } from "./lib/format";
import "./Analytics.css";

const MODES = [
  { value: "retention", label: "% que volvió a comprar" },
  { value: "ltv", label: "Ingreso neto acumulado por cliente" },
];

const Cohortes = () => {
  const { user } = useAuth();
  const role = user?.role || "";
  const [mode, setMode] = useState("retention");

  const data = useMemo(() => getCohorts({ role }), [role]);

  if (data.restricted) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Cohortes y retención" subtitle="Cómo se comporta cada camada de clientes con el tiempo." />
        <Card className="entity-card an-locked">
          <LockOutlinedIcon />
          <div>
            <strong>El motor no calculó esta pantalla.</strong>
            <span>{data.reason}</span>
          </div>
        </Card>
      </Box>
    );
  }

  const curveRows = data.curve.map((p) => ({
    key: p.offset,
    label: `mes ${p.offset}`,
    values: [{ key: "retention", value: p.value, reference: null, unit: "percent" }],
  }));

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Cohortes y retención"
        subtitle="Una cohorte es la camada de clientes que compró por primera vez en el mismo mes. La matriz la sigue mes a mes."
      />

      {/* ------------------------------------------- el aviso de la ventana */}
      <Card className="entity-card an-window">
        <InfoOutlinedIcon />
        <div>
          <strong>Ventana: {data.window.label}</strong>
          <span>{data.note.text}</span>
          <span>
            La matriz <strong>no usa el selector de período</strong>: una cohorte se sigue por meses
            desde su alta, y recortarla a &laquo;los últimos 30 días&raquo; no significa nada.
          </span>
          <span>
            El <strong>ingreso acumulado por cliente</strong> de la matriz no es el{" "}
            <strong>LTV promedio</strong> de la tarjeta de arriba, y está bien que no coincidan: la
            matriz suma ingreso neto (sin IVA) dentro de esta ventana, y el LTV del CRM suma{" "}
            <code>order.total</code> —con IVA y envío— de toda la historia. Son dos preguntas
            distintas, no un número que no cierra.
          </span>
        </div>
      </Card>

      {/* -------------------------------------------------- LTV / CAC card */}
      <Box className="an-totals">
        {data.card.map((m) => <MetricCard key={m.key} measurement={m} compact />)}
      </Box>

      <Card className="entity-card an-payback">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Repago del CAC</Typography>
          <Tooltip title="Primer mes en que el margen acumulado por cliente alcanza lo que costó traerlo. Se compara contra el MARGEN, no contra la facturación: el CAC se paga con lo que queda después del costo de la mercadería.">
            <span className="an-chip">Cómo se calcula</span>
          </Tooltip>
        </Box>

        {data.payback?.restricted ? (
          <Box className="an-payback__locked">
            <LockOutlinedIcon sx={{ fontSize: 16 }} />
            Sin acceso al CAC no hay repago que calcular. El motor no lo intenta.
          </Box>
        ) : data.payback?.months != null ? (
          <Box className="an-payback__result">
            <strong>{data.payback.months}</strong>
            <span>
              {data.payback.months === 0 ? "meses: se recupera en la primera compra" : "meses hasta recuperar el CAC"}
              <em>
                Al mes {data.payback.months} el margen acumulado por cliente es{" "}
                {formatValue(data.payback.atValue, "money")} · {data.payback.cohorts} cohortes maduras en ese punto
              </em>
            </span>
          </Box>
        ) : (
          <Box className="an-payback__result an-payback__result--miss">
            <strong>—</strong>
            <span>
              No se recupera dentro de la ventana
              <em>{data.payback?.reason}</em>
            </span>
          </Box>
        )}
      </Card>

      {/* ----------------------------------------------------- la matriz */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Matriz de cohortes</Typography>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)}>
            {MODES.map((m) => <ToggleButton key={m.value} value={m.value}>{m.label}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <CohortMatrix matrix={data.matrix} mode={mode} />
      </Card>

      {/* ------------------------------------------------------ la curva */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Curva de retención agregada</Typography>
          <Typography variant="caption" className="text-tertiary">
            Ponderada por tamaño de cohorte, no promedio de porcentajes
          </Typography>
        </Box>

        <SeriesChart rows={curveRows} metricKey="retention" unit="percent" />

        <Box className="an-curve">
          <div className="an-curve__head">
            <span>Mes</span><span>Volvieron</span><span>Ingreso acum./cliente</span><span>Cohortes maduras</span><span>Clientes</span>
          </div>
          {data.curve.map((p, i) => (
            <div className="an-curve__row" key={p.offset}>
              <span>mes {p.offset}</span>
              <span className="an-curve__num">{formatValue(p.value, "percent")}</span>
              <span className="an-curve__num">{formatValue(data.ltv[i]?.value, "money")}</span>
              <span className="an-curve__num">
                {p.cohorts}
                {p.cohorts < 3 && (
                  <Tooltip title="Menos de 3 cohortes sostienen este punto: el promedio es frágil.">
                    <em> ⚠</em>
                  </Tooltip>
                )}
              </span>
              <span className="an-curve__num">{p.accounts}</span>
            </div>
          ))}
        </Box>

        <Box className="an-attention__row">
          <StatusBadge tone="warning" label="Ojo" showDot={false} />
          <span>
            La cantidad de cohortes maduras cae hacia la derecha: al mes {data.curve.length - 1} sólo
            queda la camada más vieja. Un punto sostenido por una sola cohorte no es una tendencia.
          </span>
        </Box>
      </Card>
    </Box>
  );
};

export default Cohortes;
