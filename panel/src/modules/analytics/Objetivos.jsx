/**
 * Objetivos y alertas (§12, F3).
 *
 * Las dos cosas viven juntas porque son la misma idea con dos usos: un número
 * esperado por métrica. Como **objetivo** habilita la comparación "contra
 * objetivo" del Explorador y del Resumen; como **alerta** se evalúa sola y
 * alimenta el panel "Qué mirar".
 *
 * Definirlos es de Admin y Dirección (§10). Para el resto la pantalla es de
 * lectura: se ve qué reglas rigen y por qué, que es información útil aunque no
 * se puedan tocar.
 */
import { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import MetricInfoModal from "./components/MetricInfo";
import {
  getTargets, setTarget, listAlerts, saveAlert, toggleAlert, deleteAlert, evaluateAlerts,
  listMetrics, getMetric, canEditTargets, canSeeSensitive, OPERATORS, PERIODS,
} from "./api/analyticsApi";
import { formatValue } from "./lib/format";
import "./Analytics.css";

const EMPTY_ALERT = { metricKey: "revenue_net", operator: "lt", threshold: "", period: "last30", note: "", enabled: true };

/**
 * Los porcentajes se guardan como proporción (0,08) pero nadie escribe un
 * objetivo así: la entrada es en la unidad que se habla y se convierte al
 * guardar.
 */
const toInput = (value, unit) => {
  if (value == null) return "";
  return unit === "percent" ? String(Math.round(value * 1000) / 10) : String(value);
};
const fromInput = (raw, unit) => {
  if (raw === "" || raw == null) return null;
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return unit === "percent" ? n / 100 : n;
};

const Objetivos = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const canEdit = canEditTargets(role);

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [editingTarget, setEditingTarget] = useState(null);
  const [alertDraft, setAlertDraft] = useState(null);
  const [info, setInfo] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targets = useMemo(() => getTargets(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => listAlerts(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const evaluations = useMemo(() => evaluateAlerts({ role, onlyEnabled: false }), [role, version]);
  const evalByAlert = useMemo(
    () => new Map(evaluations.map((e) => [e.alert.id, e])),
    [evaluations]
  );

  const metrics = useMemo(
    () => listMetrics({ canSeeSensitive: canSeeSensitive(role) }).sort((a, b) => a.label.localeCompare(b.label)),
    [role]
  );

  const targetRows = useMemo(
    () => Object.keys(targets).map((k) => getMetric(k)).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label)),
    [targets]
  );

  const handleSaveTarget = () => {
    const value = fromInput(editingTarget.raw, editingTarget.metric.unit);
    if (Number.isNaN(value)) { showToast("El objetivo tiene que ser un número.", "error"); return; }
    const result = setTarget(editingTarget.metric.key, value, { role });
    if (!result.ok) { showToast(result.error, "error"); return; }
    setEditingTarget(null);
    bump();
    showToast(value == null ? "Objetivo borrado" : "Objetivo guardado", "success");
  };

  const handleSaveAlert = () => {
    const threshold = fromInput(alertDraft.raw, getMetric(alertDraft.metricKey)?.unit);
    if (threshold == null || Number.isNaN(threshold)) { showToast("El umbral tiene que ser un número.", "error"); return; }
    const result = saveAlert({ ...alertDraft, threshold }, { role });
    if (!result.ok) { showToast(result.error, "error"); return; }
    setAlertDraft(null);
    bump();
    showToast("Alerta guardada", "success");
  };

  const draftMetric = alertDraft ? getMetric(alertDraft.metricKey) : null;

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Objetivos y alertas"
        subtitle="El número que esperamos de cada métrica. Como objetivo se compara; como alerta, se avisa solo."
        actions={
          canEdit && (
            <Button variant="primary" startIcon={<AddIcon />} onClick={() => setAlertDraft({ ...EMPTY_ALERT, raw: "" })}>
              Nueva alerta
            </Button>
          )
        }
      />

      {!canEdit && (
        <Card className="entity-card an-window">
          <LockOutlinedIcon />
          <div>
            <strong>Sólo lectura</strong>
            <span>Definir objetivos y alertas es de Admin y Dirección (§10). Podés ver qué reglas rigen y por qué.</span>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------ objetivos */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Objetivos por métrica</Typography>
          <Typography variant="caption" className="text-tertiary">
            Habilitan la comparación &laquo;contra objetivo&raquo; en el Explorador y en el Resumen
          </Typography>
        </Box>

        <Box className="an-targets">
          <div className="an-targets__head">
            <span>Métrica</span><span>Objetivo</span><span>Sentido</span><span />
          </div>

          {targetRows.map((m) => (
            <div className="an-targets__row" key={m.key}>
              <span className="an-targets__metric">
                <strong>{m.label}</strong>
                <em>{m.question}</em>
              </span>
              <span className="an-targets__value">{formatValue(targets[m.key], m.unit)}</span>
              <span>
                <StatusBadge
                  tone={m.higherIsBetter === false ? "warning" : "success"}
                  label={m.higherIsBetter === false ? "Es un techo" : "Es un piso"}
                  showDot={false}
                />
              </span>
              <span className="an-targets__actions">
                <Tooltip title="Ver fórmula y origen">
                  <IconButton size="small" onClick={() => setInfo(m)} aria-label={`Ficha de ${m.label}`}>
                    <InfoOutlinedIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
                {canEdit && (
                  <Tooltip title="Editar objetivo">
                    <IconButton size="small" onClick={() => setEditingTarget({ metric: m, raw: toInput(targets[m.key], m.unit) })} aria-label="Editar">
                      <EditOutlinedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </span>
            </div>
          ))}
        </Box>

        {canEdit && (
          <Button
            variant="ghost" startIcon={<AddIcon />}
            onClick={() => setEditingTarget({ metric: metrics.find((m) => !targets[m.key]) || metrics[0], raw: "", isNew: true })}
          >
            Definir objetivo de otra métrica
          </Button>
        )}
      </Card>

      {/* -------------------------------------------------------- alertas */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Alertas de umbral</Typography>
          <Typography variant="caption" className="text-tertiary">
            Reglas explícitas. No hay detección automática de anomalías: con este volumen, &laquo;anomalía&raquo; es indistinguible de &laquo;martes&raquo;.
          </Typography>
        </Box>

        <Box className="an-alerts">
          {alerts.map((a) => {
            const ev = evalByAlert.get(a.id);
            return (
              <div className={`an-alerts__row ${ev?.triggered && a.enabled ? "is-triggered" : ""} ${a.enabled ? "" : "is-off"}`.trim()} key={a.id}>
                <div className="an-alerts__rule">
                  <strong>
                    {a.label} {a.operatorLabel} {formatValue(a.threshold, a.unit)}
                  </strong>
                  <em>{a.periodLabel} · {a.note || "sin nota"}</em>
                </div>

                <div className="an-alerts__state">
                  {!a.enabled ? (
                    <StatusBadge tone="neutral" label="Apagada" showDot={false} />
                  ) : ev?.restricted ? (
                    <Tooltip title="Tu rol no ve esta métrica, así que el motor no la calcula ni la evalúa.">
                      <span className="an-chip"><LockOutlinedIcon sx={{ fontSize: 12 }} /> sin acceso</span>
                    </Tooltip>
                  ) : ev?.triggered ? (
                    <StatusBadge tone="danger" label={`Disparada · ${formatValue(ev.value, a.unit)}`} />
                  ) : (
                    <StatusBadge tone="success" label={`En rango · ${formatValue(ev?.value, a.unit)}`} showDot={false} />
                  )}
                  {ev?.lowSample && (
                    <Tooltip title="La métrica se apoya en menos casos de los que necesita para ser estable.">
                      <span className="an-chip an-chip--warn">muestra baja</span>
                    </Tooltip>
                  )}
                </div>

                <div className="an-alerts__actions">
                  <Tooltip title={a.enabled ? "Apagar" : "Encender"}>
                    <span>
                      <Switch
                        size="small" checked={a.enabled} disabled={!canEdit}
                        onChange={() => { toggleAlert(a.id, { role }); bump(); }}
                        slotProps={{ input: { "aria-label": `Alerta ${a.label}` } }}
                      />
                    </span>
                  </Tooltip>
                  {canEdit && (
                    <>
                      <IconButton size="small" onClick={() => setAlertDraft({ ...a, metric: undefined, raw: toInput(a.threshold, a.unit) })} aria-label="Editar alerta">
                        <EditOutlinedIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => { deleteAlert(a.id, { role }); bump(); showToast("Alerta eliminada", "success"); }} aria-label="Eliminar alerta">
                        <DeleteOutlineOutlinedIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Box>
      </Card>

      {/* ------------------------------------------------------- modales */}
      {editingTarget && (
        <Modal
          open onClose={() => setEditingTarget(null)} maxWidth="xs"
          title={editingTarget.isNew ? "Definir objetivo" : `Objetivo de ${editingTarget.metric.label}`}
          subtitle="Dejalo vacío para borrarlo: un objetivo inventado alimenta el panel «Qué mirar» con avisos que nadie decidió."
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditingTarget(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleSaveTarget}>Guardar</Button>
            </>
          }
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {editingTarget.isNew && (
              <TextField
                select size="small" fullWidth label="Métrica"
                value={editingTarget.metric.key}
                onChange={(e) => setEditingTarget((t) => ({ ...t, metric: getMetric(e.target.value), raw: "" }))}
              >
                {metrics.map((m) => <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>)}
              </TextField>
            )}

            <TextField
              size="small" fullWidth autoFocus
              label={`Objetivo (${editingTarget.metric.unit === "percent" ? "en %, ej. 32" : editingTarget.metric.unit})`}
              value={editingTarget.raw}
              onChange={(e) => setEditingTarget((t) => ({ ...t, raw: e.target.value }))}
              helperText={
                editingTarget.metric.higherIsBetter === false
                  ? "Es un techo: se avisa cuando el valor lo supera."
                  : "Es un piso: se avisa cuando el valor queda por debajo."
              }
            />

            <Box className="an-savepreview">
              <span><strong>{editingTarget.metric.label}</strong></span>
              <span>{editingTarget.metric.formula}</span>
            </Box>
          </Box>
        </Modal>
      )}

      {alertDraft && (
        <Modal
          open onClose={() => setAlertDraft(null)} maxWidth="xs"
          title={alertDraft.id ? "Editar alerta" : "Nueva alerta"}
          subtitle="Métrica, comparación, umbral y período. Nada más: una alerta tiene que poder leerse en una línea."
          actions={
            <>
              <Button variant="ghost" onClick={() => setAlertDraft(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleSaveAlert}>Guardar</Button>
            </>
          }
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              select size="small" fullWidth label="Métrica" value={alertDraft.metricKey}
              onChange={(e) => setAlertDraft((d) => ({ ...d, metricKey: e.target.value, raw: "" }))}
            >
              {metrics.map((m) => <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>)}
            </TextField>

            <TextField
              select size="small" fullWidth label="Se dispara cuando" value={alertDraft.operator}
              onChange={(e) => setAlertDraft((d) => ({ ...d, operator: e.target.value }))}
            >
              {OPERATORS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>

            <TextField
              size="small" fullWidth
              label={`Umbral (${draftMetric?.unit === "percent" ? "en %, ej. 8" : draftMetric?.unit})`}
              value={alertDraft.raw}
              onChange={(e) => setAlertDraft((d) => ({ ...d, raw: e.target.value }))}
            />

            <TextField
              select size="small" fullWidth label="Sobre el período" value={alertDraft.period}
              onChange={(e) => setAlertDraft((d) => ({ ...d, period: e.target.value }))}
            >
              {PERIODS.filter((p) => p.value !== "custom").map((p) => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </TextField>

            <TextField
              size="small" fullWidth multiline rows={2} label="Por qué importa"
              value={alertDraft.note}
              onChange={(e) => setAlertDraft((d) => ({ ...d, note: e.target.value }))}
              helperText="Se muestra en «Qué mirar» junto al aviso: sin esto, la alerta es un número sin decisión."
            />

            {draftMetric && (
              <Box className="an-savepreview">
                <span><strong>{draftMetric.label}</strong></span>
                <span>{draftMetric.formula}</span>
                {draftMetric.caveat && <span>⚠ {draftMetric.caveat}</span>}
              </Box>
            )}
          </Box>
        </Modal>
      )}

      {info && <MetricInfoModal metric={info} onClose={() => setInfo(null)} />}
    </Box>
  );
};

export default Objetivos;
