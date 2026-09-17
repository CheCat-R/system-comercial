/**
 * Bandeja de aprobación de acciones sensibles (§9.6).
 *
 * Lo que el motor propuso pero **no ejecutó**: reembolsos, cancelaciones, notas
 * de crédito. Cada fila dice qué regla la propuso, sobre qué, qué haría
 * exactamente y cuánta plata mueve.
 *
 * **Aprobar ejecuta ahora, contra el estado de ahora**: se vuelve a cargar el
 * sujeto y a evaluar las condiciones de la regla antes de llamar al módulo. Si
 * el mundo cambió —el pedido se pagó, la cuenta desapareció— la propuesta queda
 * *obsoleta* con el motivo, y no se ejecuta nada. Aprobar no es reproducir una
 * decisión vieja.
 *
 * En el caso normal está vacía, y eso es una buena señal.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import {
  start, listApprovals, approveApproval, rejectApproval, canApprove,
  APPROVAL_STATUS, ACTION_TIERS, formatStamp, relativeTo,
} from "./api/automationsApi";
import "./Automatizaciones.css";

const FILTERS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "", label: "Todas" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "descartada", label: "Descartadas" },
  { value: "obsoleta", label: "Obsoletas" },
  { value: "fallida", label: "Fallidas" },
];

const Aprobaciones = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const puede = canApprove(role);

  const [status, setStatus] = useState("pendiente");
  const [version, setVersion] = useState(0);
  const [rejecting, setRejecting] = useState(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => { start(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => listApprovals({ status: status || undefined }), [status, version]);

  const handleApprove = (item) => {
    const result = approveApproval(item.id, { role, by: user?.name || "Vos" });
    bump();
    if (!result.ok) { showToast(result.error, "warning"); return; }
    showToast(`Ejecutado: ${result.detail}`, "success");
  };

  const handleReject = () => {
    const result = rejectApproval(rejecting.item.id, { role, by: user?.name || "Vos", reason: rejecting.reason });
    setRejecting(null);
    bump();
    if (!result.ok) { showToast(result.error, "warning"); return; }
    showToast("Propuesta descartada", "info");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Aprobaciones"
        subtitle="Lo que las automatizaciones proponen pero no ejecutan: plata y estados irreversibles. Aprobar ejecuta en el momento, contra el estado de ese momento."
      />

      {!puede && (
        <Card className="entity-card au-note au-note--warn">
          <LockOutlinedIcon />
          <span>
            Podés ver la cola, pero aprobar o descartar está reservado a Admin y Dirección (§10). El
            permiso se aplica en el motor, no escondiendo el botón.
          </span>
        </Card>
      )}

      <Box className="table-tabs">
        <TextField
          select size="small" label="Estado" value={status}
          onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 200 }}
        >
          {FILTERS.map((f) => <MenuItem key={f.label} value={f.value}>{f.label}</MenuItem>)}
        </TextField>
      </Box>

      {items.length === 0 ? (
        <Card className="entity-card">
          <Typography variant="body2" className="text-tertiary">
            {status === "pendiente"
              ? "No hay nada esperando aprobación. En el caso normal esta pantalla está vacía."
              : "Nada con ese filtro."}
          </Typography>
        </Card>
      ) : (
        <Box className="au-list">
          {items.map((a) => {
            const tier = ACTION_TIERS[a.action?.tier];
            return (
              <Card className={`entity-card au-appr au-appr--${a.status}`} key={a.id}>
                <Box className="au-appr__head">
                  <Box className="au-appr__title">
                    <LockOutlinedIcon sx={{ fontSize: 16 }} />
                    <strong>{a.preview}</strong>
                  </Box>
                  <StatusBadge tone={APPROVAL_STATUS[a.status]?.tone} label={APPROVAL_STATUS[a.status]?.label} />
                </Box>

                <Box className="au-appr__meta">
                  <span className="au-chip">{a.ruleName}</span>
                  <span className="au-chip">{a.subjectLabel}</span>
                  {tier && <span className={`au-chip au-chip--${tier.key}`}>{tier.label}</span>}
                  <span className="au-chip au-chip--source">{a.action?.calls}</span>
                  <Tooltip title={formatStamp(a.createdAt)}>
                    <span className="au-chip">propuesta {relativeTo(a.createdAt)}</span>
                  </Tooltip>
                </Box>

                {a.reason && <p className="au-appr__reason">{a.reason}</p>}
                {a.result && <p className="au-appr__result">{a.result}</p>}

                {a.status === "pendiente" && (
                  <Box className="au-appr__actions">
                    <Button variant="ghost" startIcon={<CloseIcon />} disabled={!puede} onClick={() => setRejecting({ item: a, reason: "" })}>
                      Descartar
                    </Button>
                    <Button variant="danger" startIcon={<CheckIcon />} disabled={!puede} onClick={() => handleApprove(a)}>
                      Aprobar y ejecutar
                    </Button>
                  </Box>
                )}

                {a.resolvedAt && (
                  <span className="au-appr__foot">
                    {APPROVAL_STATUS[a.status]?.label} por {a.resolvedBy} · {formatStamp(a.resolvedAt)}
                  </span>
                )}
              </Card>
            );
          })}
        </Box>
      )}

      {rejecting && (
        <Modal
          open onClose={() => setRejecting(null)} maxWidth="xs"
          title="Descartar la propuesta"
          subtitle="Queda registrada como descartada, con el motivo. No se ejecuta nada."
          actions={
            <>
              <Button variant="ghost" onClick={() => setRejecting(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleReject}>Descartar</Button>
            </>
          }
        >
          <TextField
            size="small" fullWidth multiline rows={2} autoFocus label="Motivo"
            value={rejecting.reason}
            onChange={(e) => setRejecting((r) => ({ ...r, reason: e.target.value }))}
          />
        </Modal>
      )}
    </Box>
  );
};

export default Aprobaciones;
