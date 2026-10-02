import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BadgeIcon from '@mui/icons-material/Badge';
import StorefrontIcon from '@mui/icons-material/Storefront';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { httpClient } from '@core/services/httpClient.js';
import { useAuth } from '@core/auth/AuthContext.jsx';
import { usePlan } from '@core/plan/PlanContext.jsx';
import { appConfig } from '@core/config/app.config.js';
import { getInitials } from './Topbar.jsx';

const NOMBRE_PLAN = { emprendedor: 'Emprendedor', pymes: 'Pymes', corporativo: 'Corporativo' };
/** De menor a mayor: define si todavía hay algo más arriba para ofrecer. */
const ORDEN_PLAN = ['emprendedor', 'pymes', 'corporativo'];

/** Una fila de dato, con su ícono — mismo molde para las cuatro filas de la ficha. */
function FilaDato({ icon, label, children }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25,
    }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'text.secondary', minWidth: 0 }}>
        {icon}
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Box>
      {typeof children === 'string' || typeof children === 'number' ? (
        <Typography variant="body2" fontWeight={600} noWrap sx={{ textAlign: 'right' }}>{children}</Typography>
      ) : children}
    </Box>
  );
}

/**
 * MI PERFIL — quién es este usuario, con qué plan y versión está trabajando,
 * y el cambio de su propia contraseña. Cualquier usuario puede entrar acá,
 * sin permiso de gerencia: es SU cuenta, no la de otro (ver
 * `AuthController::cambiarPassword`, que pide la contraseña ACTUAL en vez de
 * apoyarse en un permiso).
 *
 * Los datos de usuario/rol/sucursal y el plan salen de la MISMA sesión que ya
 * usa el resto del panel (`useAuth`, `usePlan`) — nada se vuelve a pedir al
 * servidor acá. El cartel de "subir de plan" usa el mismo mensaje que
 * `TeaserPymes` (Dashboard) y `MejoraTuPlan` (Gerencia), pero construido con
 * componentes de MUI en vez del callout del módulo Productos: este
 * componente vive en `core/layout` y el core no importa de `@modules`.
 *
 * Al guardar la contraseña, el servidor cierra TODAS las sesiones de este
 * usuario —esta pestaña incluida— así que después de la confirmación se
 * cierra sesión acá también: entrar de nuevo con la contraseña nueva es lo
 * esperado, no un error.
 */
export function MiPerfilModal({ open, onClose }) {
  const { user, logout } = useAuth();
  const { planId } = usePlan();
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

  const nombrePlan = NOMBRE_PLAN[planId] || planId || '—';
  const hayPlanSuperior = ORDEN_PLAN.includes(planId) && ORDEN_PLAN.indexOf(planId) < ORDEN_PLAN.length - 1;

  return (
    <Dialog
      open={open}
      onClose={cerrar}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 'var(--crm-radius-lg)' } }}
    >
      {hecho ? (
        <>
          <DialogContent sx={{ pt: 4, pb: 3 }}>
            <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: 'var(--crm-color-success)' }} />
              <Typography variant="h6">Contraseña actualizada</Typography>
              <Typography variant="body2" color="text.secondary">
                Iniciá sesión de nuevo con tu contraseña nueva para seguir.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button variant="contained" fullWidth onClick={() => { cerrar(); logout(); }}>Entendido</Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={guardar}>
          <DialogTitle sx={{
            display: 'flex', alignItems: 'center', gap: 2, pb: 2,
          }}
          >
            <Avatar sx={{
              width: 52, height: 52, bgcolor: 'primary.main', fontSize: 19, fontWeight: 700,
            }}
            >
              {getInitials(user?.name)}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" lineHeight={1.25} noWrap>{user?.name}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{user?.rolNombre}</Typography>
            </Box>
            <IconButton onClick={cerrar} disabled={guardando} size="small" aria-label="Cerrar">
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 0 }}>
            <Stack spacing={2.5}>
              <Box sx={{
                border: '1px solid var(--crm-color-border)',
                borderRadius: 'var(--crm-radius-md)',
                bgcolor: 'var(--crm-color-surface-2)',
                overflow: 'hidden',
              }}
              >
                <FilaDato icon={<BadgeIcon fontSize="small" />} label="Rol">
                  {user?.rolNombre || '—'}
                </FilaDato>
                <Divider />
                <FilaDato icon={<StorefrontIcon fontSize="small" />} label="Sucursal">
                  {user?.sucursalNombre || '—'}
                </FilaDato>
                <Divider />
                <FilaDato icon={<WorkspacePremiumIcon fontSize="small" />} label="Plan">
                  <Chip size="small" label={nombrePlan} color="primary" sx={{ fontWeight: 600 }} />
                </FilaDato>
                <Divider />
                <FilaDato icon={<InfoOutlinedIcon fontSize="small" />} label="Versión del sistema">
                  {`v${appConfig.version}`}
                </FilaDato>
              </Box>

              {hayPlanSuperior && (
                <Box sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.75,
                  borderRadius: 'var(--crm-radius-md)',
                  bgcolor: 'var(--crm-color-primary-soft)',
                  border: '1px solid var(--crm-color-accent-2-soft)',
                }}
                >
                  <WorkspacePremiumIcon fontSize="small" sx={{ color: 'var(--crm-color-primary)', mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={600}>¿Querés subir de plan?</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Hablá con CheCAT para desbloquear más funciones.
                    </Typography>
                  </Box>
                </Box>
              )}

              <Divider />

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <LockIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="subtitle2">Cambiar contraseña</Typography>
                </Box>
                <Stack spacing={2}>
                  <TextField
                    autoFocus fullWidth size="small" type="password" label="Contraseña actual"
                    value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)}
                    autoComplete="current-password"
                  />
                  <TextField
                    fullWidth size="small" type="password" label="Contraseña nueva"
                    value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)}
                    autoComplete="new-password" helperText="Mínimo 8 caracteres."
                  />
                  <TextField
                    fullWidth size="small" type="password" label="Confirmar contraseña nueva"
                    value={passwordConfirmar} onChange={(e) => setPasswordConfirmar(e.target.value)}
                    autoComplete="new-password"
                  />
                  {error && <Alert severity="error">{error}</Alert>}
                </Stack>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
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
