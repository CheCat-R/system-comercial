import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '@core/auth/AuthContext.jsx';
import { httpClient } from '@core/services/httpClient.js';
import { AvatarMarca, NombreMarca } from '@core/branding/Marca.jsx';
import { PanelMarca } from '@core/branding/PanelMarca.jsx';

const MIN = 8;

/**
 * ELEGÍ TU CONTRASEÑA — lo primero que ve quien entra con una contraseña que
 * le puso otro.
 *
 * Reemplaza al sistema entero (ver `ProtectedRoute`) hasta que la persona
 * elija la suya: la contraseña inicial —la de fábrica del instalador, la que
 * le dio el administrador, la temporal de la consola— la conoce más gente de
 * la que debería, y dejarla vivir "para siempre" es lo que pasa cuando nada
 * obliga a cambiarla.
 *
 * Al cambiarla el servidor cierra todas las sesiones (también esta), así que
 * se vuelve a entrar con la nueva — mismo comportamiento que "Mi perfil".
 */
export function ElegirPasswordPage() {
  const { user, logout } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!actual) { setError('Escribí la contraseña con la que entraste.'); return; }
    if (nueva.length < MIN) { setError(`La nueva necesita al menos ${MIN} caracteres.`); return; }
    if (nueva === actual) { setError('La nueva tiene que ser distinta de la que te dieron.'); return; }
    if (nueva !== repetir) { setError('Las dos contraseñas nuevas no coinciden.'); return; }
    setGuardando(true);
    try {
      await httpClient.patch('/auth/password', { passwordActual: actual, password: nueva });
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

  /* El servidor ya cerró la sesión: `logout` solo limpia lo local y manda a /login con un aviso. */
  const irAlLogin = () => logout();

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(380px, 5fr) 6fr' }, bgcolor: 'var(--crm-color-bg)' }}>
      <PanelMarca />
      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 } }}>
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Stack
            direction="row" spacing={1.75} alignItems="center"
            sx={{ display: { xs: 'flex', md: 'none' }, mb: 3, color: 'var(--crm-color-text)', '--marca-sub': 'var(--crm-color-text-muted)' }}
          >
            <AvatarMarca size={46} />
            <NombreMarca />
          </Stack>
          <Card sx={{ width: '100%' }}>
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              {hecho ? (
                <Stack spacing={2.5}>
                  <Typography variant="h2">Contraseña actualizada</Typography>
                  <Typography color="text.secondary">
                    Entrá de nuevo con tu contraseña nueva para empezar.
                  </Typography>
                  <Button variant="contained" size="large" onClick={irAlLogin}>Ir a iniciar sesión</Button>
                </Stack>
              ) : (
                <form onSubmit={guardar}>
                  <Stack spacing={2}>
                    <div>
                      <Typography variant="h2" sx={{ mb: 0.5 }}>Elegí tu contraseña</Typography>
                      <Typography color="text.secondary">
                        {user?.name ? `${user.name}, la` : 'La'} contraseña con la que entraste te la dio otra persona.
                        Antes de usar el sistema, elegí una propia que solo vos conozcas.
                      </Typography>
                    </div>
                    <TextField
                      fullWidth type="password" label="La contraseña con la que entraste" value={actual}
                      onChange={(e) => setActual(e.target.value)} autoComplete="current-password" autoFocus
                    />
                    <TextField
                      fullWidth type="password" label="Tu contraseña nueva" value={nueva}
                      onChange={(e) => setNueva(e.target.value)} autoComplete="new-password"
                      helperText={`Al menos ${MIN} caracteres.`}
                    />
                    <TextField
                      fullWidth type="password" label="Repetí la contraseña nueva" value={repetir}
                      onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password"
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                    <Button type="submit" variant="contained" size="large" disabled={guardando}>
                      {guardando ? 'Guardando…' : 'Guardar y continuar'}
                    </Button>
                    <Button variant="text" onClick={irAlLogin} disabled={guardando}>Salir</Button>
                  </Stack>
                </form>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
