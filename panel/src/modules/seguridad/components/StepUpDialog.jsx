/**
 * ⭐ Step-up: volver a autenticarse para una acción crítica (§2.5).
 *
 * Es la diferencia entre **"estás adentro"** y **"sos vos, ahora"**. Lo piden
 * los permisos marcados `stepUp` —cambiar permisos, aprobar un reembolso,
 * anular un comprobante, pasar una integración a producción— y vale unos pocos
 * minutos, no toda la sesión.
 *
 * Sin esto, el permiso quedaría bloqueado sin salida, que es peor que no tener
 * step-up: una regla de seguridad que no se puede cumplir se termina sacando.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useAuth } from "../../../context/AuthContext";
import { SESSION_POLICY } from "../api/securityApi";

const StepUpDialog = ({ open, action = "esta acción", onClose, onDone }) => {
  const { user, stepUp } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  if (!open) return null;

  const confirm = () => {
    const result = stepUp(password);
    if (!result.ok) { setError(result.error); return; }
    setPassword("");
    setError(null);
    onDone?.();
    onClose();
  };

  return (
    <Modal
      open onClose={onClose} maxWidth="xs"
      title="Confirmá que sos vos"
      subtitle={`${action} pide volver a autenticarse, aunque tu sesión esté abierta.`}
      actions={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!password} onClick={confirm}>Confirmar</Button>
        </>
      )}
    >
      <Box className="sec-form">
        <Box className="sec-callout">
          <LockOutlinedIcon sx={{ fontSize: 15, mr: 0.5, verticalAlign: "-3px" }} />
          Vale por <strong>{SESSION_POLICY.stepUpMinutes} minutos</strong>. Después vuelve a pedirse.
        </Box>

        <TextField
          type="password" size="small" fullWidth autoFocus
          label={`Contraseña de ${user?.email}`}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && password) confirm(); }}
          error={Boolean(error)}
          helperText={error || "Sin backend no se verifica la credencial: se valida la política (§10)."}
        />
      </Box>
    </Modal>
  );
};

export default StepUpDialog;
