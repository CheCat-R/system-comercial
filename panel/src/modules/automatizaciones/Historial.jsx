/**
 * Historial de ejecuciones (§9.4).
 *
 * Es donde se responde **"¿por qué no se ejecutó?"**, que es la pregunta que la
 * gente hace siempre. Por eso acá aparecen también las **descartadas** (las
 * condiciones dejaron de dar) y las **bloqueadas** por una salvaguarda, con el
 * motivo — un tope que actúa en silencio es indistinguible de un motor roto.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";

import RunDetail from "./components/RunDetail";
import {
  start, listRuns, listRules, getAutomationMetrics, RUN_STATUS_META, formatStamp, relativeTo,
} from "./api/automationsApi";
import "./Automatizaciones.css";

const STATUSES = [
  { value: "", label: "Todos los resultados" },
  { value: "ok", label: "Ejecutadas" },
  { value: "parcial", label: "Parciales" },
  { value: "fallida", label: "Fallidas" },
  { value: "descartada", label: "Descartadas" },
  { value: "bloqueada", label: "Bloqueadas" },
  { value: "pendiente_aprobacion", label: "Esperando aprobación" },
  { value: "simulada", label: "Simuladas" },
];

const Historial = () => {
  const [status, setStatus] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [detail, setDetail] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => { start(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runs = useMemo(() => listRuns({ status, ruleId }), [status, ruleId, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rules = useMemo(() => listRules(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => getAutomationMetrics(), [version]);

  const columns = [
    {
      field: "startedAt", headerName: "Cuándo",
      renderCell: (r) => (
        <span className="nowrap">
          {formatStamp(r.startedAt)}
          <em className="au-run__rel"> · {relativeTo(r.startedAt)}</em>
        </span>
      ),
    },
    {
      field: "ruleName", headerName: "Automatización",
      renderCell: (r) => (
        <Box className="au-run__rule">
          <strong>{r.ruleName}</strong>
          <em>{r.event.key}</em>
        </Box>
      ),
    },
    {
      field: "subjectLabel", headerName: "Sobre",
      renderCell: (r) => <span className="text-secondary">{r.subjectLabel || r.subject?.id || "—"}</span>,
    },
    {
      field: "status", headerName: "Resultado",
      renderCell: (r) => (
        <StatusBadge tone={RUN_STATUS_META[r.status]?.tone} label={RUN_STATUS_META[r.status]?.label} />
      ),
    },
    {
      field: "steps", headerName: "Acciones", align: "center",
      renderCell: (r) => (
        <span className="text-tertiary nowrap">
          {r.steps.length ? `${r.steps.filter((s) => s.status === "ok").length}/${r.steps.length}` : "—"}
        </span>
      ),
    },
    {
      field: "reason", headerName: "Motivo",
      renderCell: (r) => (
        <span className="au-run__reason" title={r.reason || ""}>
          {r.reason || (r.steps.find((s) => s.status === "fallida")?.detail) || "—"}
        </span>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Historial de ejecuciones"
        subtitle="Todo lo que el motor hizo y lo que decidió no hacer, con el motivo. Incluye descartes y bloqueos por salvaguarda."
        actions={<Button variant="secondary" onClick={refresh}>Actualizar</Button>}
      />

      {/* --------------------------------------------------- métricas */}
      {metrics.runs > 0 && (
        <Card className="entity-card">
          <Box className="card-title-row">
            <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Qué está haciendo el motor</Typography>
            <Typography variant="caption" className="text-tertiary">
              {metrics.runs} ejecución(es) · {metrics.actions} acción(es) ejecutadas
            </Typography>
          </Box>

          <Box className="au-metrics">
            <div className="au-metrics__head">
              <span>Automatización</span><span>Ejecuciones</span><span>Con error</span><span>Descartadas</span><span>Bloqueadas</span>
            </div>
            {metrics.byRule.map((r) => (
              <div className={`au-metrics__row ${r.failed ? "is-bad" : ""}`.trim()} key={r.ruleId}>
                <span className="au-metrics__name">{r.ruleName}</span>
                <span className="au-metrics__num">{r.total}</span>
                <span className="au-metrics__num">{r.failed || "—"}</span>
                <span className="au-metrics__num">{r.discarded || "—"}</span>
                <span className="au-metrics__num">{r.blocked || "—"}</span>
              </div>
            ))}
          </Box>

          {metrics.worst.length > 0 && (
            <Box className="au-note au-note--warn">
              <span>
                <strong>{metrics.worst[0].ruleName}</strong> es la que más falla
                ({metrics.worst[0].failed} de {metrics.worst[0].total}). Abrí una de sus ejecuciones:
                el error del módulo dueño está textual.
              </span>
            </Box>
          )}
        </Card>
      )}

      <Box className="table-tabs">
        <TextField
          select size="small" label="Resultado" value={status}
          onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 220 }}
        >
          {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Automatización" value={ruleId}
          onChange={(e) => setRuleId(e.target.value)} sx={{ minWidth: 260 }}
        >
          <MenuItem value="">Todas</MenuItem>
          {rules.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
        </TextField>
      </Box>

      {runs.length === 0 ? (
        <Card className="entity-card">
          <Typography variant="body2" className="text-tertiary">
            Todavía no hay ejecuciones con ese filtro. Corré un ciclo desde la lista de
            automatizaciones, o provocá un evento real (confirmar el pago de un pedido, por ejemplo).
          </Typography>
        </Card>
      ) : (
        <DataTable
          columns={columns} data={runs}
          onRowClick={(r) => setDetail(r)}
          emptyMessage="Sin ejecuciones."
        />
      )}

      {detail && (
        <Modal
          open onClose={() => setDetail(null)} maxWidth="sm"
          title={detail.ruleName}
          subtitle={`${detail.subjectLabel || detail.subject?.id} · ${formatStamp(detail.startedAt)}`}
          actions={<Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>}
        >
          <RunDetail run={detail} />
        </Modal>
      )}
    </Box>
  );
};

export default Historial;
