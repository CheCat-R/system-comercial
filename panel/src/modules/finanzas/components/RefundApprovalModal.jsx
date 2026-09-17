import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import Modal from "../../../components/Modal/Modal";
import Permitido from "../../seguridad/components/Permitido";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { approveRefund, rejectRefund } from "../api/financeApi";
import { REFUND_METHODS } from "../lib/finance";
// ⭐ La ficha del grado: esta pantalla no decide que un reembolso pida step-up y
// un segundo par de ojos — lo decide el catálogo de permisos, y acá se muestra.
import { GradeNotice } from "../../seguridad/components/ReasonDialog";
import StepUpDialog from "../../seguridad/components/StepUpDialog";
import { money, formatDateTime } from "../lib/time";

const RefundApprovalModal = ({ refund, onClose, onResolved }) => {
  const { showToast } = useToast();
  const [method, setMethod] = useState("original");
  const [note, setNote] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [error, setError] = useState(null);

  if (!refund) return null;

  // ⭐ La nota deja de ser opcional: es el motivo, y el portón lo exige antes.
  const attempt = (fn, okMsg, tone) => {
    try {
      fn();
      showToast(okMsg, tone);
      onResolved();
    } catch (err) {
      if (err.needsStepUp) { setStepUp(true); return; }
      if (err.queued) { showToast(err.message, "info"); onResolved(); return; }
      setError(err.message);
    }
  };

  const handleApprove = () =>
    attempt(() => approveRefund(refund.id, { method, note, reason: note }), "Reembolso aprobado y ejecutado", "success");

  const handleReject = () =>
    attempt(() => rejectRefund(refund.id, { note, reason: note }), "Reembolso rechazado", "info");

  return (
    <Modal
      open={Boolean(refund)}
      onClose={onClose}
      title={`Reembolso · Pedido #${refund.orderId}`}
      subtitle={`${refund.customerName} · solicitado ${formatDateTime(refund.requestedAt)} por ${refund.requestedBy}`}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Permitido permiso="finanzas.rechazar_reembolso">
            <Button variant="danger" onClick={handleReject}>Rechazar</Button>
          </Permitido>
          <Permitido permiso="finanzas.aprobar_reembolso">
            <Button variant="primary" onClick={handleApprove}>Aprobar reembolso</Button>
          </Permitido>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, p: 2, borderRadius: "var(--radius-md)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning-text)" }}>
          <WarningAmberOutlinedIcon />
          <Typography variant="body2">
            Aprobar ejecuta el movimiento de dinero. La mercadería ya volvió al depósito y la Nota de
            Crédito ya está emitida.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, borderRadius: "var(--radius-sm)", background: "var(--bg-sunken)", border: "1px solid var(--border-subtle)" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
            <span style={{ color: "var(--text-secondary)" }}>Monto a reembolsar</span>
            <strong className="mono">{money(refund.amount)}</strong>
          </Box>
          {refund.creditNoteLabel && (
            <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--text-secondary)" }}>Nota de crédito</span>
              <strong className="mono">{refund.creditNoteLabel}</strong>
            </Box>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary">{refund.reason}</Typography>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Medio del reembolso</Typography>
          <Select size="small" fullWidth value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(REFUND_METHODS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </Select>
        </Box>

        <TextField
          size="small" fullWidth multiline minRows={2}
          label="Motivo"
          placeholder="Por qué se devuelve (o por qué no). Queda en el asiento, junto a tu nombre."
          value={note}
          onChange={(e) => { setNote(e.target.value); setError(null); }}
          error={Boolean(error)}
          helperText={error || "Obligatorio: aprobar un reembolso es plata saliendo."}
        />

        <GradeNotice action="finanzas.aprobar_reembolso" />

        <Box sx={{ display: "flex", gap: 2 }}>
          <RouterLink to={`/pedidos/${refund.orderId}`} className="mono">Ver pedido</RouterLink>
          {refund.creditNoteId && <RouterLink to={`/facturacion/${refund.creditNoteId}`} className="mono">Ver nota de crédito</RouterLink>}
        </Box>
      </Box>
      <StepUpDialog
        open={stepUp}
        action="Aprobar un reembolso"
        onClose={() => setStepUp(false)}
        onDone={() => setStepUp(false)}
      />
    </Modal>
  );
};

export default RefundApprovalModal;
