/**
 * La traza de una ejecución.
 *
 * Todo lo que hace falta para reconstruir qué pasó: el evento con su payload,
 * **cada condición con el valor que vio** y cada acción con lo que devolvió o
 * con el error textual del módulo dueño.
 *
 * Ese "valor que vio" es lo que convierte un "no se ejecutó" en una respuesta.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import {
  RUN_STATUS_META, STEP_STATUS_META, GUARD_LABELS, getCondition, OPERATORS,
} from "../api/automationsApi";

const fmt = (v) => {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(vacío)";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
  return String(v);
};

const RunDetail = ({ run }) => (
  <Box className="au-run">
    <Box className="au-run__head">
      <StatusBadge tone={RUN_STATUS_META[run.status]?.tone} label={RUN_STATUS_META[run.status]?.label} />
      {run.guard && (
        <Tooltip title="Una salvaguarda cortó esta ejecución. Cuando cortan, lo dicen: un tope silencioso es indistinguible de un motor roto.">
          <span className="au-chip au-chip--warn">{GUARD_LABELS[run.guard] || run.guard}</span>
        </Tooltip>
      )}
      <span className="au-chip">{run.ms} ms</span>
      {run.dryRun && <span className="au-chip">simulación</span>}
    </Box>

    {run.reason && <p className="au-run__why">{run.reason}</p>}

    {/* ------------------------------------------------------- evento */}
    <Box className="au-run__section">
      <span className="au-detail__label">Evento</span>
      <Box className="au-detail__meta">
        <span className="au-chip au-chip--source">{run.event.key}</span>
        <span className="au-chip">origen: {run.event.origin}</span>
        <Tooltip title="Profundidad de la cadena. Un evento emitido por una acción hereda +1; pasado el tope se descarta para evitar bucles.">
          <span className="au-chip">profundidad {run.event.depth}</span>
        </Tooltip>
      </Box>
      {run.event.payload && (
        <pre className="au-run__payload">{JSON.stringify(run.event.payload, null, 2)}</pre>
      )}
    </Box>

    {/* --------------------------------------------------- condiciones */}
    {run.conditions.length > 0 && (
      <Box className="au-run__section">
        <span className="au-detail__label">Condiciones</span>
        {run.conditions.map((c, i) => (
          <div className={`au-run__cond ${c.pass ? "is-pass" : "is-fail"}`} key={`${c.field}-${i}`}>
            {c.pass ? <CheckIcon sx={{ fontSize: 14 }} /> : <CloseIcon sx={{ fontSize: 14 }} />}
            <span>
              {c.label || c.field} {OPERATORS[c.op]?.label || c.op} <strong>{fmt(c.value)}</strong>
            </span>
            <em>vio: {fmt(c.actual)}{getCondition(c.field)?.type === "money" && c.actual != null ? "" : ""}</em>
            {c.note && <em className="au-run__condnote">{c.note}</em>}
          </div>
        ))}
      </Box>
    )}

    {/* ------------------------------------------------------ acciones */}
    <Box className="au-run__section">
      <span className="au-detail__label">Acciones</span>
      {run.steps.length === 0 ? (
        <em className="text-tertiary">No se llegó a ejecutar ninguna acción.</em>
      ) : (
        run.steps.map((s, i) => (
          <div className={`au-run__step au-run__step--${s.status}`} key={`${s.key}-${i}`}>
            <StatusBadge
              tone={STEP_STATUS_META[s.status]?.tone}
              label={STEP_STATUS_META[s.status]?.label || s.status}
              showDot={false}
            />
            <span>
              <strong>{s.label}</strong>
              <em>{s.detail}</em>
            </span>
          </div>
        ))
      )}
    </Box>
  </Box>
);

export default RunDetail;
