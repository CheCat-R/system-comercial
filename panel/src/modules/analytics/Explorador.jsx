/**
 * Explorador — la pantalla que responde preguntas nuevas.
 *
 * Métrica × dimensión × período × comparación × filtros, con gráfico y tabla.
 * Las dimensiones que no aplican a la métrica elegida quedan **deshabilitadas
 * con el motivo a la vista** (§3): devolver un número sin sentido es peor que
 * no ofrecerlo.
 */
import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";

import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import MetricCard from "./components/MetricCard";
import MetricPicker from "./components/MetricPicker";
import PeriodPicker from "./components/PeriodPicker";
import FilterBar from "./components/FilterBar";
import ResultTable from "./components/ResultTable";
import SeriesChart from "./components/SeriesChart";
import BarChart from "./components/BarChart";

import {
  query, listDimensions, getMetric, dimensionRejection,
  getFilterOptions, createReport, getReport, VIEWS,
} from "./api/analyticsApi";
import { buildCsv, downloadCsv, csvFilename } from "./lib/csv";
import "./Analytics.css";

const DEFAULT_QUERY = {
  metrics: ["revenue_net"],
  dimension: "producto",
  period: "last90",
  compare: "previous",
  filters: {},
  range: null,
};

const Explorador = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const [params] = useSearchParams();

  // Si se llega desde un reporte, la consulta arranca en la suya.
  const [q, setQ] = useState(() => {
    const report = params.get("reporte") ? getReport(params.get("reporte")) : null;
    return report ? { ...DEFAULT_QUERY, ...report.query, range: null } : DEFAULT_QUERY;
  });
  const [view, setView] = useState(() => {
    const report = params.get("reporte") ? getReport(params.get("reporte")) : null;
    return report?.view || "bar";
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", description: "" });

  const set = useCallback((patch) => setQ((prev) => ({ ...prev, ...patch })), []);

  const options = useMemo(() => getFilterOptions(), []);
  const dimensions = useMemo(() => listDimensions(), []);
  const primary = getMetric(q.metrics[0]);

  const result = useMemo(
    () => query({ ...q, role }),
    [q, role]
  );

  // El gráfico de línea sólo tiene sentido cortando por tiempo.
  const effectiveView = q.dimension === "tiempo" ? view : view === "line" ? "bar" : view;

  const handleExport = () => {
    const csv = buildCsv(result, { filters: q.filters, title: primary?.label || "Consulta" });
    downloadCsv(csv, csvFilename(primary?.label || "consulta", result.period));
    showToast("CSV descargado con la consulta en la cabecera", "success");
  };

  const handleSave = () => {
    createReport({
      name: saveForm.name,
      description: saveForm.description,
      view: effectiveView,
      query: { metrics: q.metrics, dimension: q.dimension, period: q.period, compare: q.compare, filters: q.filters },
    });
    setSaveOpen(false);
    setSaveForm({ name: "", description: "" });
    showToast("Reporte guardado", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Explorador"
        subtitle="Elegí una métrica, cortala por lo que quieras y compará. Cada número abre su fórmula."
        actions={
          <>
            <Button variant="secondary" startIcon={<FileDownloadOutlinedIcon />} onClick={handleExport}>
              Exportar CSV
            </Button>
            <Button variant="primary" startIcon={<BookmarkAddOutlinedIcon />} onClick={() => setSaveOpen(true)}>
              Guardar como reporte
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- controles */}
      <Card className="entity-card an-controls">
        <Box className="an-controls__row">
          <Box className="an-controls__metrics">
            <span className="an-filters__label">Métricas</span>
            {q.metrics.map((key) => {
              const m = getMetric(key);
              return <span className="an-chip an-chip--metric" key={key}>{m?.label || key}</span>;
            })}
            <button type="button" className="an-filters__add" onClick={() => setPickerOpen(true)}>
              <TuneOutlinedIcon sx={{ fontSize: 14 }} /> Elegir
            </button>
          </Box>

          <TextField
            select size="small" label="Cortada por" value={q.dimension || ""}
            onChange={(e) => set({ dimension: e.target.value || null })}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value=""><em>Sin corte (total)</em></MenuItem>
            {dimensions.map((d) => {
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
        </Box>

        <PeriodPicker
          value={{ period: q.period, compare: q.compare, range: q.range }}
          onChange={(v) => set(v)}
          sources={result.sources}
          partial={result.period.isPartial}
        />

        <FilterBar filters={q.filters} options={options} onChange={(filters) => set({ filters })} />

        {q.dimension && dimensionRejection(primary, q.dimension) && (
          <Box className="an-attention__row an-attention__row--error">
            <span>{dimensionRejection(primary, q.dimension)}</span>
          </Box>
        )}
      </Card>

      {/* ---------------------------------------------------------- totales */}
      <Box className="an-totals">
        {result.totals.map((t) => <MetricCard key={t.key} measurement={t} compact />)}
      </Box>

      {/* --------------------------------------------------------- gráfico */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
            {primary?.label} por {result.dimension?.label?.toLowerCase() || "período"}
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={effectiveView} onChange={(_, v) => v && setView(v)}>
            {VIEWS.filter((v) => v.value !== "line" || q.dimension === "tiempo").map((v) => (
              <ToggleButton key={v.value} value={v.value}>{v.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {effectiveView === "line" && (
          <SeriesChart
            rows={result.rows} metricKey={q.metrics[0]} unit={primary?.unit}
            boundary={result.boundary} comparisonLabel={result.comparison?.label}
          />
        )}
        {effectiveView === "bar" && <BarChart result={result} metricKey={q.metrics[0]} />}
        {effectiveView === "table" && <ResultTable result={result} />}
      </Card>

      {/* ----------------------------------------------------------- tabla */}
      {effectiveView !== "table" && (
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Detalle</Typography>
          <ResultTable result={result} />
        </Card>
      )}

      <MetricPicker
        open={pickerOpen} selected={q.metrics} role={role}
        onChange={(metrics) => set({ metrics })}
        onClose={() => setPickerOpen(false)}
      />

      {saveOpen && (
        <Modal
          open onClose={() => setSaveOpen(false)} maxWidth="xs"
          title="Guardar como reporte"
          subtitle="Se guarda la consulta entera: métricas, corte, período, comparación y filtros."
          actions={
            <>
              <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancelar</Button>
              <Button variant="primary" disabled={!saveForm.name.trim()} onClick={handleSave}>Guardar</Button>
            </>
          }
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              size="small" fullWidth label="Nombre" value={saveForm.name} autoFocus
              onChange={(e) => setSaveForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              size="small" fullWidth multiline rows={2} label="Qué responde"
              value={saveForm.description}
              onChange={(e) => setSaveForm((f) => ({ ...f, description: e.target.value }))}
            />
            <Box className="an-savepreview">
              <span><strong>{q.metrics.length}</strong> métrica(s)</span>
              <span>cortadas por <strong>{result.dimension?.label || "nada"}</strong></span>
              <span><strong>{result.period.label}</strong></span>
              <span>vs <strong>{result.comparison?.label || "sin comparación"}</strong></span>
              <span><strong>{Object.keys(q.filters).length}</strong> filtro(s)</span>
            </Box>
          </Box>
        </Modal>
      )}
    </Box>
  );
};

export default Explorador;
