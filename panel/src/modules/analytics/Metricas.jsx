/**
 * Diccionario de métricas — la documentación **dentro del producto**.
 *
 * Es la pantalla que se le manda a alguien cuando discute un número: cada
 * métrica con su pregunta, fórmula, origen, exclusiones, advertencia y las
 * dimensiones que admite. Ver docs/MODULO-ANALYTICS.md §9.6.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

import { MetricContract } from "./components/MetricInfo";
import { AREAS, listMetrics, canSeeSensitive, getBrokenContracts } from "./api/analyticsApi";
import "./Analytics.css";

const Metricas = () => {
  const { user } = useAuth();
  const sensitiveOk = canSeeSensitive(user?.role || "");

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);

  const area = tab === 0 ? null : AREAS[tab - 1].key;

  const metrics = useMemo(() => {
    const q = search.toLowerCase().trim();
    return listMetrics({ area })
      .filter((m) => !q || m.label.toLowerCase().includes(q) || m.question.toLowerCase().includes(q) || m.formula.toLowerCase().includes(q));
  }, [area, search]);

  const broken = getBrokenContracts();
  const total = listMetrics().length;

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Diccionario de métricas"
        subtitle={`${total} métricas, cada una con su fórmula y su origen. Ninguna se calcula sin contrato completo.`}
      />

      {broken.length > 0 && (
        <Box className="an-attention__row an-attention__row--error">
          <StatusBadge tone="danger" label="Error" />
          <span>Hay métricas con contrato incompleto y por eso no se calculan: {broken.join(" · ")}</span>
        </Box>
      )}

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
          <Tab label={`Todas (${total})`} />
          {AREAS.map((a) => <Tab key={a.key} label={a.label} />)}
        </Tabs>
        <TextField
          size="small" placeholder="Buscar por nombre, pregunta o fórmula…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 300 }}
        />
      </Box>

      {area && (
        <Typography variant="body2" className="text-tertiary">
          {AREAS.find((a) => a.key === area)?.hint}
        </Typography>
      )}

      {metrics.length === 0 ? (
        <Box className="an-chart__empty">Ninguna métrica coincide con esa búsqueda.</Box>
      ) : (
        <Box className="an-dict">
          {metrics.map((m) => {
            const isOpen = open === m.key;
            const locked = m.sensitive && !sensitiveOk;
            return (
              <Card className={`an-dict__item ${isOpen ? "is-open" : ""}`.trim()} key={m.key}>
                <button
                  type="button" className="an-dict__head"
                  onClick={() => setOpen(isOpen ? null : m.key)}
                  aria-expanded={isOpen}
                >
                  <span className="an-dict__main">
                    <span className="an-dict__name">
                      {m.label}
                      {locked && <LockOutlinedIcon sx={{ fontSize: 13, ml: 0.5, verticalAlign: "-2px", color: "var(--text-tertiary)" }} />}
                    </span>
                    <span className="an-dict__question">{m.question}</span>
                  </span>
                  <span className="an-dict__meta">
                    <span className="an-chip">{m.grain}</span>
                    <span className="an-chip an-chip--unit">{m.unit}</span>
                  </span>
                  <ExpandMoreIcon className="an-dict__chevron" />
                </button>

                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <Box className="an-dict__body">
                    <MetricContract metric={m} />
                  </Box>
                </Collapse>
              </Card>
            );
          })}
        </Box>
      )}

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Lo que hoy no se puede medir</Typography>
        <Typography variant="body2" className="text-tertiary" sx={{ mb: 1.5 }}>
          Esta lista es parte del contrato del módulo: si algo no está en el diccionario ni acá, no existe.
        </Typography>
        <Box className="an-cantmeasure">
          {[
            ["Tasa de conversión del sitio", "No hay sesiones ni visitas", "Una tabla de sesiones con fecha, origen y si terminó en pedido"],
            ["CAC por canal de adquisición", "No hay atribución de adquisición", "UTM / first-touch por cuenta y gasto imputado por canal"],
            ["Rebote y tiempo en sitio", "Ídem tráfico", "Web analytics del storefront"],
            ["Embudo vio → agregó → compró", "No hay eventos de producto", "Eventos con sessionId desde la Tienda"],
            ["Comparación interanual", "Hay 11 meses de historia + 24 días vivos", "Otro año de datos"],
          ].map(([what, why, need]) => (
            <div className="an-cantmeasure__row" key={what}>
              <strong>{what}</strong>
              <span>{why}</span>
              <em>Haría falta: {need}</em>
            </div>
          ))}
        </Box>
      </Card>
    </Box>
  );
};

export default Metricas;
