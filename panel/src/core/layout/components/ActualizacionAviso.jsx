import { useState, useSyncExternalStore } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import { actualizaciones } from '@core/pwa/actualizacion.js';
import { conectividad } from '@core/services/conectividad.js';

/**
 * "HAY UNA VERSIÓN NUEVA" — en cualquier pantalla, abajo a la izquierda.
 *
 * No recarga solo: lo hace quien toca "Actualizar", entre una venta y otra.
 * Sin conexión avisa que primero termine lo que está haciendo, porque un
 * ticket armado offline vive solo en la pantalla y la recarga lo borraría.
 */
export function ActualizacionAviso() {
  const { hayNueva } = useSyncExternalStore(actualizaciones.subscribe, actualizaciones.estado, actualizaciones.estado);
  const { offline } = useSyncExternalStore(conectividad.subscribe, conectividad.estado, conectividad.estado);
  const [despues, setDespues] = useState(false);

  if (!hayNueva || despues) return null;

  return (
    <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <Alert
        severity="info"
        variant="filled"
        sx={{ alignItems: 'center' }}
        action={(
          <>
            <Button color="inherit" size="small" onClick={() => setDespues(true)}>Después</Button>
            <Button color="inherit" size="small" sx={{ fontWeight: 700 }} onClick={() => actualizaciones.aplicar()}>
              Actualizar
            </Button>
          </>
        )}
      >
        Hay una versión nueva del sistema.
        {offline && ' Estás sin conexión: terminá la venta en curso antes de actualizar.'}
      </Alert>
    </Snackbar>
  );
}
