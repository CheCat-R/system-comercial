/**
 * Un dashboard: la grilla de widgets y su edición (§9.5).
 *
 * Editar es un modo, no una pantalla aparte: los controles aparecen sobre cada
 * widget y la grilla sigue mostrando datos reales mientras se acomoda. Mover es
 * con flechas, no arrastrando — predecible y accesible con teclado.
 */
import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import AddIcon from "@mui/icons-material/Add";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DoneIcon from "@mui/icons-material/Done";
import StarOutlineIcon from "@mui/icons-material/StarBorderOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import WidgetCard from "./components/WidgetCard";
import MetricPicker from "./components/MetricPicker";
import {
  getDashboard, setDefaultDashboard, updateDashboard,
  addWidget, addWidgetFromReport, updateWidget, removeWidget, moveWidget, runWidget,
  listReports, listDimensions, getMetric, dimensionRejection,
  WIDGET_TYPES, PERIODS,
} from "./api/analyticsApi";
import "./Analytics.css";

/** Cada forma exige un corte distinto: una línea sin eje de tiempo no es una línea. */
const DIMENSION_RULE = {
  kpi: { forced: null, hint: "Un KPI es el total del período: no lleva corte." },
  line: { forced: "tiempo", hint: "La línea sólo tiene sentido cortando por tiempo." },
  bar: { forced: null, hint: "Elegí por qué cortar el ranking (no tiempo)." },
  table: { forced: null, hint: "Elegí por qué cortar la tabla." },
  cohort: { forced: null, hint: "La matriz tiene su propia ventana: ignora período y corte." },
};

const EMPTY_DRAFT = {
  type: "kpi",
  title: "",
  metrics: ["revenue_net"],
  dimension: null,
  period: "last30",
  compare: "previous",
};

const DashboardDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [source, setSource] = useState("query");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [reportId, setReportId] = useState("");
  const [renaming, setRenaming] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dashboard = useMemo(() => getDashboard(id), [id, version]);
  const reports = useMemo(() => listReports(), []);
  const dimensions = useMemo(() => listDimensions(), []);

  const runs = useMemo(
    () => (dashboard ? dashboard.widgets.map((w) => runWidget(w, { role })) : []),
    [dashboard, role]
  );

  if (!dashboard) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Dashboard" subtitle="No se encontró." />
        <Button variant="secondary" onClick={() => navigate("/analytics/dashboards")}>Volver a la lista</Button>
      </Box>
    );
  }

  const rule = DIMENSION_RULE[draft.type];
  const primary = getMetric(draft.metrics[0]);

  const setType = (type) => {
    const forced = DIMENSION_RULE[type].forced;
    setDraft((d) => ({
      ...d,
      type,
      dimension: type === "kpi" || type === "cohort" ? null : forced || (d.dimension === "tiempo" && type === "bar" ? "producto" : d.dimension || "producto"),
    }));
  };

  const handleAdd = () => {
    if (source === "report") {
      if (!reportId) return;
      addWidgetFromReport(dashboard.id, reportId);
    } else {
      addWidget(dashboard.id, {
        type: draft.type,
        title: draft.title.trim() || undefined,
        query: {
          metrics: draft.metrics,
          dimension: draft.dimension,
          period: draft.period,
          compare: draft.compare,
          filters: {},
        },
      });
    }
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
    setReportId("");
    bump();
    setEditing(true);
    showToast("Widget agregado", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title={dashboard.name}
        subtitle={dashboard.description || "Grilla de widgets. Cada uno es una consulta con forma."}
        actions={
          <>
            {!dashboard.isDefault && (
              <Button
                variant="secondary" startIcon={<StarOutlineIcon />}
                onClick={() => { setDefaultDashboard(dashboard.id); bump(); showToast("Es el dashboard por defecto", "success"); }}
              >
                Predeterminado
              </Button>
            )}
            <Button
              variant={editing ? "primary" : "secondary"}
              startIcon={editing ? <DoneIcon /> : <EditOutlinedIcon />}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Listo" : "Editar"}
            </Button>
            <Button variant="primary" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Agregar widget
            </Button>
          </>
        }
      />

      <Box className="an-dashbar">
        <Button variant="ghost" onClick={() => navigate("/analytics/dashboards")}>← Todos los dashboards</Button>
        {dashboard.isDefault && <StatusBadge tone="success" label="Por defecto" showDot={false} />}
        {dashboard.system && <StatusBadge tone="neutral" label="De fábrica" showDot={false} />}
        <span className="an-chip">{dashboard.widgetCount} widget(s)</span>
        <Box sx={{ flex: 1 }} />
        {editing && (
          <Button
            variant="ghost" startIcon={<TuneOutlinedIcon />}
            onClick={() => setRenaming({ name: dashboard.name, description: dashboard.description })}
          >
            Renombrar
          </Button>
        )}
      </Box>

      {dashboard.widgets.length === 0 ? (
        <Card className="entity-card an-empty">
          <strong>Este dashboard está vacío.</strong>
          <span>Agregá un widget desde una consulta nueva o desde uno de los {reports.length} reportes guardados.</span>
          <Button variant="primary" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Agregar el primero</Button>
        </Card>
      ) : (
        <Box className="an-widgets">
          {dashboard.widgets.map((w, i) => (
            <WidgetCard
              key={w.id}
              widget={w}
              run={runs[i]}
              editing={editing}
              canMoveUp={i > 0}
              canMoveDown={i < dashboard.widgets.length - 1}
              onMove={(delta) => { moveWidget(dashboard.id, w.id, delta); bump(); }}
              onResize={(size) => { updateWidget(dashboard.id, w.id, { size }); bump(); }}
              onRemove={() => { removeWidget(dashboard.id, w.id); bump(); showToast("Widget quitado", "success"); }}
            />
          ))}
        </Box>
      )}

      {/* ------------------------------------------------- agregar widget */}
      {addOpen && (
        <Modal
          open onClose={() => setAddOpen(false)} maxWidth="sm"
          title="Agregar widget"
          subtitle="Un widget es una consulta con forma. Podés armarla acá o traer un reporte ya guardado."
          actions={
            <>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button variant="primary" disabled={source === "report" && !reportId} onClick={handleAdd}>Agregar</Button>
            </>
          }
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <ToggleButtonGroup size="small" exclusive value={source} onChange={(_, v) => v && setSource(v)}>
              <ToggleButton value="query">Consulta nueva</ToggleButton>
              <ToggleButton value="report">Desde un reporte</ToggleButton>
            </ToggleButtonGroup>

            {source === "report" ? (
              <TextField
                select size="small" fullWidth label="Reporte guardado"
                value={reportId} onChange={(e) => setReportId(e.target.value)}
              >
                {reports.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name} · {r.dimensionLabel} · {r.periodLabel}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <>
                <TextField
                  select size="small" fullWidth label="Forma"
                  value={draft.type} onChange={(e) => setType(e.target.value)}
                >
                  {WIDGET_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label} — {t.hint}</MenuItem>
                  ))}
                </TextField>

                {draft.type !== "cohort" && (
                  <>
                    <Box className="an-controls__metrics">
                      <span className="an-filters__label">Métricas</span>
                      {draft.metrics.map((k) => (
                        <span className="an-chip an-chip--metric" key={k}>{getMetric(k)?.label || k}</span>
                      ))}
                      <button type="button" className="an-filters__add" onClick={() => setPickerOpen(true)}>
                        <TuneOutlinedIcon sx={{ fontSize: 14 }} /> Elegir
                      </button>
                    </Box>

                    <TextField
                      select size="small" fullWidth label="Cortada por"
                      value={draft.dimension || ""}
                      disabled={draft.type === "kpi" || Boolean(rule.forced)}
                      helperText={rule.hint}
                      onChange={(e) => setDraft((d) => ({ ...d, dimension: e.target.value || null }))}
                    >
                      <MenuItem value=""><em>Sin corte (total)</em></MenuItem>
                      {dimensions
                        .filter((d) => draft.type !== "bar" || d.key !== "tiempo")
                        .map((d) => {
                          const rejection = dimensionRejection(primary, d.key);
                          return (
                            <MenuItem key={d.key} value={d.key} disabled={Boolean(rejection)}>
                              <Tooltip title={rejection || d.hint || ""} placement="right">
                                <span className="an-dimoption">
                                  {d.label}
                                  {rejection && <em>no aplica</em>}
                                </span>
                              </Tooltip>
                            </MenuItem>
                          );
                        })}
                    </TextField>

                    <TextField
                      select size="small" fullWidth label="Período"
                      value={draft.period}
                      onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value }))}
                    >
                      {PERIODS.filter((p) => p.value !== "custom").map((p) => (
                        <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                      ))}
                    </TextField>
                  </>
                )}

                <TextField
                  size="small" fullWidth label="Título del widget"
                  placeholder={getMetric(draft.metrics[0])?.label || "Widget"}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </>
            )}
          </Box>
        </Modal>
      )}

      <MetricPicker
        open={pickerOpen} selected={draft.metrics} role={role}
        onChange={(metrics) => setDraft((d) => ({ ...d, metrics }))}
        onClose={() => setPickerOpen(false)}
      />

      {renaming && (
        <Modal
          open onClose={() => setRenaming(null)} maxWidth="xs"
          title="Renombrar dashboard"
          actions={
            <>
              <Button variant="ghost" onClick={() => setRenaming(null)}>Cancelar</Button>
              <Button
                variant="primary" disabled={!renaming.name.trim()}
                onClick={() => { updateDashboard(dashboard.id, renaming); setRenaming(null); bump(); showToast("Dashboard actualizado", "success"); }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              size="small" fullWidth label="Nombre" value={renaming.name} autoFocus
              onChange={(e) => setRenaming((r) => ({ ...r, name: e.target.value }))}
            />
            <TextField
              size="small" fullWidth multiline rows={2} label="Para qué sirve"
              value={renaming.description}
              onChange={(e) => setRenaming((r) => ({ ...r, description: e.target.value }))}
            />
          </Box>
        </Modal>
      )}

      <Typography variant="caption" className="text-tertiary">
        Los widgets se recalculan al abrir la pantalla: no guardan números, guardan la consulta.
      </Typography>
    </Box>
  );
};

export default DashboardDetalle;
