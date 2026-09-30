import { useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { httpClient } from '@core/services/httpClient.js';
import { useAuth } from '@core/auth/AuthContext.jsx';

/**
 * MI PERFIL — hoy solo cambiar la propia contraseña. Cualquier usuario puede
 * entrar acá, sin permiso de gerencia: es su cuenta, no la de otro (ver
 * `AuthController::cambiarPassword`, que pide la contraseña ACTUAL en vez de
 * apoyarse en un permiso).
 *
 * Al guardar, el servidor cierra TODAS las sesiones de este usuario —esta
 * pestaña incluida— así que después de la confirmación se cierra sesión acá
 * también: entrar de nuevo con la contraseña nueva es lo esperado, no un error.
 */
export function MiPerfilModal({ open, onClose }) {
  const { user, logout } = useAuth();
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(false);

  const cerrar = () => {
    if (guardando) return;
    setPasswordActual(''); setPasswordNueva(''); setPasswordConfirmar('');
    setError(''); setHecho(false);
    onClose();
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!passwordActual || !passwordNueva) { setError('Completá los dos campos de contraseña.'); return; }
    if (passwordNueva !== passwordConfirmar) { setError('La confirmación no coincide con la contraseña nueva.'); return; }
    setGuardando(true);
    try {
      await httpClient.patch('/auth/password', { passwordActual, password: passwordNueva });
      setHecho(true);
    } catch (e2) {
      setError(
        e2?.data?.errors?.passwordActual?.[0]
        || e2?.data?.errors?.password?.[0]
        || e2?.data?.message
        || 'No se pudo cambiar la contraseña.',
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onClose={cerrar} maxWidth="xs" fullWidth>
      <DialogTitle>Mi perfil</DialogTitle>
      {hecho ? (
        <>
          <DialogContent>
            <Alert severity="success">Contraseña actualizada. Iniciá sesión de nuevo para seguir.</Alert>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => { cerrar(); logout(); }}>Entendido</Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={guardar}>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {user?.name} · {user?.rolNombre}
              </Typography>
              <TextField
                autoFocus fullWidth type="password" label="Contraseña actual"
                value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)}
                autoComplete="current-password"
              />
              <TextField
                fullWidth type="password" label="Contraseña nueva"
                value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)}
                autoComplete="new-password" helperText="Mínimo 8 caracteres."
              />
              <TextField
                fullWidth type="password" label="Confirmar contraseña nueva"
                value={passwordConfirmar} onChange={(e) => setPasswordConfirmar(e.target.value)}
                autoComplete="new-password"
              />
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={cerrar} disabled={guardando}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
