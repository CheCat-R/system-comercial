/**
 * ⭐ La cola de aprobación (§2.10) — el segundo par de ojos, hecho pantalla.
 *
 * Lo que se ve acá es lo que **no ocurrió todavía**: alguien pidió hacer algo que
 * no se hace solo. La pantalla tiene que contestar tres cosas de un vistazo —
 * *qué se pide*, *quién lo pidió* y *quién puede firmarlo*— porque una cola donde
 * no se sabe quién puede destrabarla se convierte en un cementerio.
 */
import { useState, useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";

import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import { ActorChip } from "./components/ChangeLog";
import StepUpDialog from "./components/StepUpDialog";
import {
  listApprovalRequests, getApprovalsSummary, resolveApproval, segregationError, currentUserActor,
} from "./api/securityApi";
import "./Seguridad.css";

const stamp = (iso) => new Date(iso).toLocaleString("es-AR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const Aprobaciones = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const [notes, setNotes] = useState({});
  const [stepUpFor, setStepUpFor] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => listApprovalRequests(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getApprovalsSummary(), [tick]);

  const pending = items.filter((i) => i.status === "pendiente");
  const resolved = items.filter((i) => i.status !== "pendiente");

  const act = (item, approve) => {
    const note = (notes[item.id] || "").trim();
    const result = resolveApproval(item.id, { approve, note });
    setTick((t) => t + 1);

    if (result.ok) {
      showToast(approve ? `Aprobada y ejecutada: ${item.permission?.label}` : "Solicitud rechazada", approve ? "success" : "info");
      setNotes((n) => ({ ...n, [item.id]: "" }));
      return;
    }
    if (result.needsStepUp) {
      setStepUpFor({ item, approve });
      return;
    }
    showToast(result.error, "warning");
  };

  const renderCard = (item) => {
    const mine = item.requestedBy?.kind === "user" && item.requestedBy.id === user?.id;
    // ⭐ Se muestra el motivo del bloqueo, no se esconde el botón (§2.2).
    const blocked = item.status === "pendiente"
      ? segregationError(item, currentUserActor())
      : null;
    const nobody = item.eligible.length === 0;

    return (
      <Card className="entity-card sec-approval" key={item.id}>
        <Box className="sec-approval__head">
          <StatusBadge tone={item.stateMeta.tone} label={item.stateMeta.label} showDot={false} />
          <Tooltip title={item.permission?.hint || item.action}>
            <strong>{item.permission?.label || item.action}</strong>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <span className="sec-code">{item.id}</span>
          <em className="text-tertiary">{stamp(item.requestedAt)}</em>
        </Box>

        {item.preview && <div className="sec-approval__preview">{item.preview}</div>}

        <Box className="sec-approval__meta">
          <span>Lo pidió</span>
          <ActorChip actor={item.requestedBy} />
          {mine && <span className="sec-chip sec-chip--warning">sos vos</span>}
          {item.subject && <span className="sec-chip">{item.subject.label || item.subject.id}</span>}
        </Box>

        {item.reason && <div className="sec-trail__reason">Motivo: “{item.reason}”</div>}

        {item.meta && (
          <Box className="sec-trail__meta">
            {Object.entries(item.meta).map(([k, v]) => (
              <span className="sec-chip" key={k}>{k}: {String(v)}</span>
            ))}
          </Box>
        )}

        {item.status === "pendiente" && (
          <>
            <Box className="sec-approval__eligible">
              {nobody ? (
                <span className="sec-chip sec-chip--danger">
                  ⚠ Nadie más tiene «{item.permission?.label}»: esta solicitud no la puede firmar nadie.
                </span>
              ) : (
                <>
                  <span className="text-tertiary">Puede firmarla:</span>
                  {item.eligible.map((u) => <span className="sec-chip" key={u.id}>{u.name}</span>)}
                </>
              )}
            </Box>

            {blocked ? (
              <Box className="sec-grade sec-grade--warning">
                <Typography variant="body2">{blocked}</Typography>
              </Box>
            ) : (
              <Box className="sec-approval__actions">
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Nota de la firma (obligatoria para rechazar)"
                  value={notes[item.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                />
                <Button variant="ghost" color="error" onClick={() => act(item, false)}>Rechazar</Button>
                <Button variant="primary" onClick={() => act(item, true)}>Aprobar y ejecutar</Button>
              </Box>
            )}
          </>
        )}

        {item.status !== "pendiente" && (
          <Box className="sec-approval__meta">
            <span>Resuelta por</span>
            <ActorChip actor={item.resolvedBy} />
            <em className="text-tertiary">{item.resolvedAt ? stamp(item.resolvedAt) : ""}</em>
            {item.resolution && <span className="sec-chip">{item.resolution}</span>}
          </Box>
        )}
      </Card>
    );
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Aprobaciones"
        subtitle="Lo que alguien pidió hacer y todavía no ocurrió. Quien aprueba no puede ser quien pidió, y aprobar vuelve a validar el mundo antes de ejecutar."
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{summary.pending}</strong><span>esperando firma</span></div>
        <div className="sec-summary__item"><strong>{summary.approved}</strong><span>aprobadas y ejecutadas</span></div>
        <div className="sec-summary__item"><strong>{summary.rejected}</strong><span>rechazadas</span></div>
        <div className="sec-summary__item"><strong>{summary.stale}</strong><span>obsoletas al revalidar</span></div>
        <div className="sec-summary__item"><strong>{summary.failed}</strong><span>fallaron al ejecutarse</span></div>
      </Box>

      <Card className="entity-card sec-note">
        <ShieldOutlinedIcon fontSize="small" />
        <span>
          <strong>Aprobar no reproduce una decisión vieja.</strong>
          Entre que se pidió y se firma el mundo cambia: el pedido pudo pagarse, el precio pudo moverse,
          la factura pudo tener una nota asociada. Al aprobar se vuelve a verificar que la operación siga
          siendo posible; si no lo es, queda <strong>obsoleta</strong> con el motivo en vez de ejecutarse a ciegas.
        </span>
      </Card>

      <Typography variant="h6" className="card-title" sx={{ mt: 1 }}>
        Pendientes ({pending.length})
      </Typography>
      {pending.length === 0 ? (
        <Card className="entity-card">
          <Typography variant="body2" className="text-tertiary">
            No hay nada esperando firma. Las solicitudes aparecen solas cuando alguien intenta una
            operación de grado <strong>con aprobación</strong>: cambiar permisos, aprobar un reembolso,
            anular un comprobante, mover un precio fuera del umbral o pasar una integración a producción.
          </Typography>
        </Card>
      ) : pending.map(renderCard)}

      {resolved.length > 0 && (
        <>
          <Typography variant="h6" className="card-title" sx={{ mt: 1 }}>
            Resueltas ({resolved.length})
          </Typography>
          {resolved.map(renderCard)}
        </>
      )}

      <StepUpDialog
        open={Boolean(stepUpFor)}
        onClose={() => setStepUpFor(null)}
        onDone={() => {
          const pendingAction = stepUpFor;
          setStepUpFor(null);
          if (pendingAction) act(pendingAction.item, pendingAction.approve);
        }}
      />
    </Box>
  );
};

export default Aprobaciones;
