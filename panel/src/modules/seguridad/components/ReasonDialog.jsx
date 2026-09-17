/**
 * ⭐ El motivo, pedido **antes** (§2.10, regla 1).
 *
 * *Un motivo pedido después es una encuesta.* Por eso esto no es un campo del
 * asiento de auditoría: es un paso de la operación, y si no se completa, la
 * operación no ocurre.
 *
 * El diálogo no decide nada — sólo **muestra** lo que el catálogo de permisos ya
 * decidió: qué grado tiene la acción, si va a ejecutarse o a quedar esperando la
 * firma de otra persona, y si antes hay que volver a autenticarse. Si el usuario
 * lo saltea, el portón lo frena igual: **el control está en la operación, no en
 * este componente**.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { getPermission, getGrade, requiresStepUp, MIN_REASON, checkReason } from "../api/securityApi";
import "../Seguridad.css";

/**
 * La ficha del grado: qué exige esta acción, en castellano y antes de tocarla.
 * Se usa suelta (dentro de un formulario que ya existe) o dentro del diálogo.
 */
export const GradeNotice = ({ action, extra = null }) => {
  const permission = getPermission(action);
  if (!permission) return null;
  const grade = getGrade(permission.grade);
  const stepUp = requiresStepUp(action);

  return (
    <Box className={`sec-grade sec-grade--${grade.tone}`}>
      <Box className="sec-grade__head">
        <StatusBadge tone={grade.tone} label={grade.label} showDot={false} />
        <Tooltip title={permission.hint || permission.label}>
          <strong>{permission.label}</strong>
        </Tooltip>
        {stepUp && <span className="sec-chip">pide reautenticarse</span>}
      </Box>
      <Typography variant="body2" className="text-secondary">{grade.hint}</Typography>
      {grade.needsApproval && (
        <Typography variant="body2" className="text-secondary">
          <strong>No se va a aplicar ahora.</strong> Queda en la cola de aprobación y la firma otra
          persona — nunca la misma que la pidió.
        </Typography>
      )}
      {extra}
    </Box>
  );
};

/**
 * @param {string}   action    clave del catálogo — de ahí sale el grado
 * @param {string}   preview   una línea con qué va a pasar, en castellano
 * @param {Function} onConfirm recibe el motivo escrito
 */
const ReasonDialog = ({
  open,
  action,
  title,
  preview = null,
  extra = null,
  confirmLabel = "Confirmar",
  onClose,
  onConfirm,
  busy = false,
  error = null,
}) => {
  const [reason, setReason] = useState("");

  // El motivo se limpia al abrir, ajustando el estado durante el render y no en
  // un efecto: escribirlo con `useEffect` provoca un render en cascada, y acá
  // además dejaría ver por un instante el motivo de la operación anterior.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  const permission = getPermission(action);
  const grade = getGrade(permission?.grade);
  const problem = grade.needsReason ? checkReason(reason) : null;
  const tooShort = grade.needsReason && reason.length > 0 && reason.trim().length < MIN_REASON;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || permission?.label || "Confirmar"}
      subtitle={preview || undefined}
      maxWidth="sm"
      actions={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant={grade.order >= 3 ? "danger" : "primary"}
            disabled={Boolean(problem) || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {grade.needsApproval ? "Pedir la aprobación" : confirmLabel}
          </Button>
        </>
      )}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <GradeNotice action={action} extra={extra} />

        {grade.needsReason && (
          <TextField
            autoFocus
            multiline
            minRows={3}
            fullWidth
            size="small"
            label="Motivo"
            placeholder="Qué pasó y por qué se hace. Escribilo para quien lo lea dentro de seis meses."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={tooShort}
            helperText={tooShort
              ? `Faltan ${MIN_REASON - reason.trim().length} caracteres: «${reason.trim()}» no le va a servir a nadie.`
              : `Queda en el asiento de auditoría, junto a tu nombre. Mínimo ${MIN_REASON} caracteres.`}
          />
        )}

        {error && (
          <Box className="sec-grade sec-grade--danger">
            <Typography variant="body2">{error}</Typography>
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default ReasonDialog;
