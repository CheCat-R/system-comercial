/**
 * AVISO DE "SIN CONEXIÓN" Y SINCRONIZACIÓN — en cualquier pantalla.
 * ============================================================================
 * Tres estados posibles, nunca dos a la vez:
 *  - OFFLINE: el cartel de siempre, ahora con cuántas ventas están
 *    esperando en la cola local (se actualiza solo cada 2s).
 *  - SINCRONIZANDO: apenas vuelve la conexión, mientras el lote viaja.
 *  - RESULTADO: unos segundos con el resumen (cuántas entraron, si alguna
 *    quedó pendiente de revisar, si algún producto quedó en negativo) y
 *    después se apaga solo — a diferencia del cartel offline, este sí es
 *    una notificación puntual, no un estado permanente.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { conectividad } from '@core/services/conectividad.js';
import { sincronizadorOffline } from '@core/offline/sincronizador.js';
import {
  contarPendientes, listarConError, reintentarConError, descartarConError,
} from '@core/offline/colaVentas.js';

const MOSTRAR_RESULTADO_MS = 8000;

export function OfflineAlert() {
  const { offline } = useSyncExternalStore(conectividad.subscribe, conectividad.estado, conectividad.estado);
  const { sincronizando, ultimoResultado } = useSyncExternalStore(
    sincronizadorOffline.subscribe, sincronizadorOffline.estado, sincronizadorOffline.estado,
  );

  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    if (!offline) { setPendientes(0); return undefined; }
    const tick = () => contarPendientes().then(setPendientes);
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [offline]);

  /* Las que el servidor rechazó: no salen solas de la cola, hay que mostrarlas hasta que alguien decida. */
  const [conError, setConError] = useState([]);
  useEffect(() => {
    if (offline) { setConError([]); return undefined; }
    const tick = () => listarConError().then(setConError);
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [offline, sincronizando, ultimoResultado]);

  const [resultadoVisible, setResultadoVisible] = useState(null);
  useEffect(() => {
    if (!ultimoResultado) return undefined;
    setResultadoVisible(ultimoResultado);
    const t = setTimeout(() => setResultadoVisible(null), MOSTRAR_RESULTADO_MS);
    return () => clearTimeout(t);
  }, [ultimoResultado]);

  if (offline) {
    return (
      <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="warning" variant="filled" icon={<WifiOffIcon fontSize="small" />} sx={{ alignItems: 'center' }}>
          Sin conexión con el servidor — reintentando…
          {pendientes > 0 && ` · ${pendientes} venta${pendientes === 1 ? '' : 's'} por sincronizar`}
        </Alert>
      </Snackbar>
    );
  }

  if (sincronizando) {
    return (
      <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" sx={{ alignItems: 'center' }}>
          Sincronizando ventas pendientes…
        </Alert>
      </Snackbar>
    );
  }

  if (resultadoVisible) {
    const { sincronizadas, fallidas, stockNegativo } = resultadoVisible;
    const hayProblema = fallidas > 0 || stockNegativo.length > 0;
    return (
      <Snackbar
        open
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={() => setResultadoVisible(null)}
      >
        <Alert severity={hayProblema ? 'warning' : 'success'} variant="filled" onClose={() => setResultadoVisible(null)} sx={{ alignItems: 'center' }}>
          {sincronizadas} venta{sincronizadas === 1 ? '' : 's'} sincronizada{sincronizadas === 1 ? '' : 's'}.
          {fallidas > 0 && ` ${fallidas} no se pudo registrar: quedó guardada en este equipo.`}
          {stockNegativo.length > 0 && (
            ` Atención, quedó en negativo: ${stockNegativo.map((x) => `${x.producto} (${x.cantidad})`).join(', ')}.`
          )}
        </Alert>
      </Snackbar>
    );
  }

  if (conError.length > 0) {
    const n = conError.length;
    const s1 = n === 1 ? '' : 's';
    const reintentar = async () => { await reintentarConError(); setConError([]); sincronizadorOffline.intentar(); };
    const descartar = async () => {
      const ok = window.confirm(`Vas a descartar ${n} venta${s1} cobrada${s1} sin conexión. Esa plata ya se cobró y NO va a figurar en el sistema. ¿Seguro?`);
      if (!ok) return;
      await descartarConError();
      setConError([]);
    };
    return (
      <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert
          severity="error"
          variant="filled"
          sx={{ alignItems: 'center' }}
          action={(
            <>
              <Button color="inherit" size="small" onClick={descartar}>Descartar</Button>
              <Button color="inherit" size="small" sx={{ fontWeight: 700 }} onClick={reintentar}>Reintentar</Button>
            </>
          )}
        >
          {n} venta{s1} cobrada{s1} sin conexión no se pudo registrar en el sistema.
          {conError[0]?.ultimoError && ` Motivo: ${conError[0].ultimoError}`}
        </Alert>
      </Snackbar>
    );
  }

  return null;
}
