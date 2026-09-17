/**
 * Detalle de un puerto (§9.2).
 *
 * Los cinco bloques son, otra vez, los siete puntos que define el módulo: qué
 * hace · qué entra y qué sale · configuración · estado y salud · errores y logs.
 *
 * En F1 no hay proveedores, así que la pantalla contesta sobre todo una pregunta
 * que igual importa: **qué corre hoy y quién lo llama**.
 */
import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import PowerSettingsNewOutlinedIcon from "@mui/icons-material/PowerSettingsNewOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import ContractPanel from "./components/ContractPanel";
// ⭐ El rastro se lee **dentro de la entidad**: uno que obliga a irse del pedido
// para saber quién lo canceló no se usa nunca (MODULO-SEGURIDAD.md §2.8).
import ChangeLog from "../seguridad/components/ChangeLog";
import ReasonDialog from "../seguridad/components/ReasonDialog";
import ConnectionWizard from "./components/ConnectionWizard";
import {
  getConnection, listProviders, listErrorTypes, SENSITIVITY,
  getConnectionMetrics, describeIdempotency, listCalls, sendSample, canRetry as canRetryRole,
  testConnection, dryRun, disableConnection, enableConnection, resetConnection,
  canConfigure, canEnable, describeRef, previewPayload, MODES,
} from "./api/integrationsApi";
import "./Integraciones.css";

const ConexionDetalle = () => {
  const { portKey } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const key = decodeURIComponent(portKey || "");

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [wizard, setWizard] = useState(false);
  const [dry, setDry] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const connection = useMemo(() => getConnection(key), [key, version]);
  const providers = useMemo(
    () => (connection ? listProviders({ port: connection.portKey }) : []),
    [connection]
  );
  const calls = useMemo(
    () => (connection ? listCalls({ portKey: connection.portKey, limit: 8 }) : []),
    [connection]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => getConnectionMetrics(key), [key, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idem = useMemo(() => describeIdempotency(key), [key, version]);

  // ⭐ Habilitar o deshabilitar cambia por dónde pasa la operación real del
  // negocio: pide motivo antes, como cualquier cambio con consecuencias de dinero.
  const [toggle, setToggle] = useState(null);   // "habilitar" | "deshabilitar"
  const [toggleError, setToggleError] = useState(null);

  const handle = (fn, okMsg) => {
    const result = fn();
    if (!result.ok) { showToast(result.error, "warning"); return; }
    bump();
    if (okMsg) showToast(okMsg, "success");
    return result;
  };
  const errorTypes = useMemo(() => listErrorTypes(), []);

  if (!connection) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Integración" subtitle="Ese puerto no existe en el catálogo." />
        <Button variant="secondary" onClick={() => navigate("/integraciones")}>Volver al catálogo</Button>
      </Box>
    );
  }

  const { port, stateMeta, running, stats, health } = connection;
  const sens = SENSITIVITY[port.sensitivity];

  return (
    <Box className="page fade-in">
      <PageHeader
        title={port.label}
        subtitle={`${port.key} · lo consume el módulo ${port.owner}`}
      />

      <Box className="in-bar">
        <Button variant="ghost" onClick={() => navigate("/integraciones")}>← Todas las integraciones</Button>
        <StatusBadge tone={stateMeta.tone} label={stateMeta.label} />
        <Tooltip title={sens.hint}>
          <span className={`in-chip in-chip--${port.sensitivity === "alta" ? "danger" : "plain"}`}>
            {sens.label.toLowerCase()}
          </span>
        </Tooltip>
        {port.syncOnly && <span className="in-chip in-chip--warn">síncrono</span>}
        {connection.providerKey && (
          <span className="in-chip">{MODES.find((m) => m.value === connection.mode)?.label}</span>
        )}
        <Box sx={{ flex: 1 }} />

        {connection.providerKey && (
          <>
            <Button
              variant="secondary" disabled={!canConfigure(role)}
              onClick={() => handle(() => testConnection(key, { role }), "Prueba de conexión hecha")}
            >
              Probar
            </Button>
            <Button
              variant="secondary" startIcon={<ScienceOutlinedIcon />} disabled={!canConfigure(role)}
              onClick={() => {
                const r = dryRun(key, { role });
                if (!r.ok) { showToast(r.error, "warning"); return; }
                setDry(r);
              }}
            >
              Dry-run
            </Button>
            {connection.enabled ? (
              <Button
                variant="danger" startIcon={<PowerSettingsNewOutlinedIcon />} disabled={!canEnable(role)}
                onClick={() => { setToggleError(null); setToggle("deshabilitar"); }}
              >
                Deshabilitar
              </Button>
            ) : (
              <Tooltip title={connection.health?.ok ? "" : "Hace falta una prueba exitosa antes de habilitar."}>
                <span>
                  <Button
                    variant="primary" disabled={!canEnable(role) || !connection.health?.ok}
                    onClick={() => { setToggleError(null); setToggle("habilitar"); }}
                  >
                    Habilitar
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        )}

        <Tooltip title={canConfigure(role) ? "" : "Configurar integraciones está reservado a Admin (§10)."}>
          <span>
            <Button variant="primary" disabled={!canConfigure(role)} onClick={() => setWizard(true)}>
              {connection.providerKey ? "Reconfigurar" : "Conectar un proveedor"}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* --------------------------------------------------- 1. qué hace */}
      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Qué hace</Typography>

        <Box className="in-kv">
          <span>Capacidad</span><div>{port.label}</div>
          <span>Categoría</span><div>{port.category}</div>
          <span>Lo consume</span>
          <div>
            {port.wiredAt
              ? <code className="in-code">{port.wiredAt}</code>
              : <em className="text-tertiary">Todavía nadie: está declarado con su contrato, esperando quien lo llame.</em>}
          </div>
          <span>Corre hoy</span>
          <div>
            {running === "local"
              ? <>Implementación local — <em className="text-tertiary">{port.fallback}</em></>
              : <>Proveedor <strong>{connection.providerKey}</strong></>}
          </div>
        </Box>

        {port.note && <p className="in-note__text">{port.note}</p>}

        {port.sensitivity === "alta" && (
          <Box className="in-callout in-callout--danger">
            <LockOutlinedIcon sx={{ fontSize: 16 }} />
            <span>{sens.hint}</span>
          </Box>
        )}
      </Card>

      {/* ------------------------------------------- 2. qué entra / sale */}
      <ContractPanel port={port} />

      {/* ------------------------------------------------ 3. proveedores */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Conexión</Typography>
          <Typography variant="caption" className="text-tertiary">
            {connection.providerKey ? "Proveedor configurado" : "Sin proveedor: corre local"}
          </Typography>
        </Box>

        {connection.providerKey ? (
          <>
            <Box className="in-kv">
              <span>Proveedor</span>
              <div>
                {connection.provider?.label}
              </div>
              <span>Modo</span><div>{MODES.find((m) => m.value === connection.mode)?.label}</div>
              <span>Habilitada</span>
              <div>
                {connection.enabled
                  ? <StatusBadge tone="success" label="Sí · el proveedor atiende el puerto" showDot={false} />
                  : <StatusBadge tone="neutral" label="No · sigue corriendo local" showDot={false} />}
              </div>
              <span>Configuración</span>
              <div className="in-kv__chips">
                {Object.keys(connection.config || {}).length === 0
                  ? <em className="text-tertiary">sin campos</em>
                  : Object.entries(connection.config).map(([k, v]) => (
                      <span className="in-chip" key={k}>{k}: {String(v)}</span>
                    ))}
              </div>
              <span>Secretos</span>
              <div className="in-kv__chips">
                {connection.secretsRef
                  ? Object.entries(connection.secretsRef).map(([k, ref]) => (
                      <span className="in-chip in-chip--warn" key={k}>
                        <KeyOutlinedIcon sx={{ fontSize: 11 }} /> {k}: {describeRef(ref)}
                      </span>
                    ))
                  : <em className="text-tertiary">ninguno cargado</em>}
              </div>
            </Box>

            <Box className="in-callout in-callout--warn">
              <KeyOutlinedIcon sx={{ fontSize: 16 }} />
              <span>
                <strong>El panel no guarda secretos.</strong> De cada credencial queda una referencia
                y los últimos 4 caracteres; el valor se descarta al guardar. Sin un backend que los
                custodie, <strong>producción no se puede completar desde el panel</strong> — y eso se
                dice en vez de fingirlo.
              </span>
            </Box>

            <Box className="in-testrow">
              <Button
                variant="ghost" disabled={!canConfigure(role)}
                onClick={() => handle(() => resetConnection(key, { role }), "Conexión olvidada: el puerto volvió a su estado inicial")}
              >
                Olvidar esta conexión
              </Button>
            </Box>
          </>
        ) : (
          <Typography variant="body2" className="text-tertiary">
            {providers.length === 0
              ? "No hay ningún proveedor definido para este puerto. Escribir uno es agregar un archivo en providers/ con su contrato; ningún módulo del núcleo se toca."
              : "Todavía sin conectar: el puerto se resuelve con la implementación local de su módulo."}
          </Typography>
        )}
      </Card>

      {/* --------------------------------------------- 4. estado y salud */}
      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Estado y salud</Typography>

        <Box className="in-kv">
          <span>Estado</span><div><StatusBadge tone={stateMeta.tone} label={stateMeta.label} /></div>
          <span>Qué significa</span><div className="text-secondary">{stateMeta.hint}</div>
          <span>Último chequeo</span><div className="text-secondary">{health?.message || "—"}</div>
          <span>Uso en esta sesión</span>
          <div>
            {stats.total === 0
              ? <em className="text-tertiary">Todavía no se llamó en esta sesión.</em>
              : <>{stats.total} llamada(s) · {stats.local} local · {stats.provider} por proveedor · {stats.errors} con error</>}
          </div>
        </Box>
      </Card>

      {/* ------------------------------------------- 5. errores y logs */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Errores y logs</Typography>
          <Button variant="ghost" onClick={() => navigate("/integraciones/trafico")}>
            Ver la consola de tráfico →
          </Button>
        </Box>

        {calls.length === 0 && (
          <Typography variant="body2" className="text-tertiary">
            Sin tráfico: <strong>sólo se registran las llamadas que cruzan la frontera</strong>. Si no
            hay proveedor no hay frontera que cruzar, y anotar cada cálculo local convertiría el log
            en ruido.
            {stats.total > 0 && (
              <> Este puerto ya se resolvió <strong>{stats.total}</strong> vez/veces en esta sesión,
              todas localmente.</>
            )}
          </Typography>
        )}

        {calls.length > 0 && (
          <>
            <Box className="in-kv">
              <span>Intentos</span>
              <div>
                {metrics.outbound} saliente(s) · {metrics.inbound} entrante(s) ·{" "}
                {metrics.errors} con error · {metrics.fallback} resuelta(s) local ·{" "}
                {metrics.replayed} repetida(s)
              </div>
              <span>Latencia</span>
              <div>
                {metrics.avgMs == null
                  ? <em className="text-tertiary">—</em>
                  : <>{metrics.avgMs} ms promedio · {metrics.p95Ms} ms el percentil 95</>}
              </div>
              <span>Idempotencia</span>
              <div>
                {idem.guarantee
                  ? (
                    <Tooltip title={idem.guarantee.hint}>
                      <span><StatusBadge tone={idem.guarantee.tone} label={idem.guarantee.label} showDot={false} /></span>
                    </Tooltip>
                  )
                  : <em className="text-tertiary">{idem.hint}</em>}
              </div>
            </Box>

            <span className="in-label">Los últimos intentos</span>
            <Box className="in-calls">
              {calls.map((c) => (
                <div className="in-call" key={c.id}>
                  <span className="in-chip">{c.id}</span>
                  <StatusBadge tone={c.statusMeta?.tone} label={c.statusMeta?.label} showDot={false} />
                  <em>{c.operation}</em>
                  <Box sx={{ flex: 1 }} />
                  <span className="text-tertiary nowrap">
                    {c.errorMessage || `${c.durationMs ?? 0} ms`}
                  </span>
                </div>
              ))}
            </Box>
          </>
        )}

        {connection.enabled && (
          <Box className="in-testrow">
            <Button
              variant="secondary" disabled={!canRetryRole(role)}
              onClick={() => {
                const r = sendSample(key, { role });
                if (!r.ok) { showToast(r.error, "warning"); return; }
                showToast(
                  r.failed ? `Falló como ${r.error.type}: ${r.error.message}` : "Llamada hecha: quedó en la traza.",
                  r.failed ? "warning" : "success"
                );
                bump();
              }}
            >
              Mandar una llamada de prueba
            </Button>
            <span className="in-field__hint">
              Cruza la frontera de verdad y <strong>sin fallback</strong>: es la única forma de
              ejercitar un error, un reintento o una clave de idempotencia sin romper nada real.
            </span>
          </Box>
        )}

        <Box className="in-errors">
          <span className="in-label">Cómo se clasifica un error, y qué hace el panel</span>
          {errorTypes.map((e) => (
            <div className={`in-error in-error--${e.tone}`} key={e.key}>
              <div className="in-error__head">
                <strong>{e.label}</strong>
                <span className={`in-chip ${e.retry ? "in-chip--ok" : ""}`.trim()}>
                  {e.retry ? "reintenta" : "no reintenta"}
                </span>
              </div>
              <em>{e.hint}</em>
              <span className="in-error__action">{e.action}</span>
            </div>
          ))}
        </Box>
      </Card>

      <ChangeLog subjectType="connection" subjectId={key} title="Quién tocó esta conexión" limit={5} />

      {/* ------------------------------------------------------ dry-run */}
      {dry && (
        <Card className="entity-card">
          <Box className="card-title-row">
            <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Dry-run</Typography>
            <Button variant="ghost" onClick={() => setDry(null)}>Cerrar</Button>
          </Box>

          <Box className="in-dry">
            <span className="in-label">Qué se mandaría</span>
            <div className="in-dry__source">
              {dry.sample.real
                ? <StatusBadge tone="success" label="Datos reales" showDot={false} />
                : <StatusBadge tone="neutral" label="Ejemplo sintético" showDot={false} />}
              <em>{dry.sample.source}</em>
            </div>
            <pre className="in-dry__code">{previewPayload(dry.request)}</pre>

            <span className="in-label">Qué devolvería</span>
            {dry.error ? (
              <Box className="in-callout in-callout--danger">
                <span><strong>{dry.error.type}</strong> — {dry.error.message}</span>
              </Box>
            ) : (
              <pre className="in-dry__code">{previewPayload(dry.response)}</pre>
            )}

            <p className="in-field__hint">{dry.note}</p>
          </Box>
        </Card>
      )}

      {wizard && (
        <ConnectionWizard
          portKey={key}
          port={port}
          role={role}
          showToast={showToast}
          onDone={bump}
          onClose={() => { setWizard(false); bump(); }}
        />
      )}

      <ReasonDialog
        open={Boolean(toggle)}
        action="integraciones.habilitar"
        title={toggle === "habilitar" ? `Habilitar ${port.label}` : `Deshabilitar ${port.label}`}
        preview={toggle === "habilitar"
          ? `A partir de acá, ${connection.providerKey} atiende este puerto en modo ${connection.mode}`
          : "El puerto vuelve a la implementación local. No rompe nada: eso es la regla del módulo"}
        confirmLabel={toggle === "habilitar" ? "Habilitar" : "Deshabilitar"}
        error={toggleError}
        onClose={() => { setToggle(null); setToggleError(null); }}
        onConfirm={(reason) => {
          const result = toggle === "habilitar"
            ? enableConnection(key, { reason })
            : disableConnection(key, { reason });
          if (!result.ok) { setToggleError(result.error); return; }
          setToggle(null);
          bump();
          showToast(toggle === "habilitar"
            ? "Habilitada: el proveedor atiende el puerto"
            : "Deshabilitada: el puerto volvió a la implementación local", "success");
        }}
      />
    </Box>
  );
};

export default ConexionDetalle;
