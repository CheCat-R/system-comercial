/**
 * Consola de tráfico (§9.4).
 *
 * Todas las llamadas, entrantes y salientes, con su intento, su clave de
 * idempotencia y su sujeto de dominio — para poder ir **del pedido a la llamada
 * y de la llamada al pedido**, que es lo único que sirve cuando algo salió mal.
 *
 * Abajo, la cola de reintentos: qué quedó pendiente, cuándo se vuelve a
 * intentar y por qué eso que falló **no** está en la cola.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import CallDetail from "./components/CallDetail";
import {
  start, getTraffic, getTrafficSummary, listRetryJobs, JOB_STATES, CALL_STATUS, listErrorTypes,
  listConnections, retryCall, retryJobNow, cancelRetry, sendSample, exportTrafficCsv,
  canViewTraffic, canRetry as canRetryRole, listIdempotencyKeys,
} from "./api/integrationsApi";
import "./Integraciones.css";

/** El BOM hace que Excel abra el CSV en UTF-8 y no rompa los acentos. */
const download = (csv, filename) => {
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const stamp = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-AR") : "—");

const inSeconds = (iso) => {
  if (!iso) return "—";
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "ahora";
  return `en ${diff}s`;
};

const Trafico = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const allowed = canViewTraffic(role);
  const mayRetry = canRetryRole(role);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const { filtros, setFiltros } = useVistaGuardada("trafico", { capacidad: "", resultado: "", error: "", search: "" });
  const { capacidad: portKey, resultado: status, error: errorType, search } = filtros;
  const [detail, setDetail] = useState(null);
  const [sendPort, setSendPort] = useState("");

  // El módulo arranca con la app; llamarlo de nuevo es inofensivo y deja la
  // pantalla funcionando aunque alguien entre directo por la URL.
  useEffect(() => { start(); }, []);

  // La cola avanza sola: sin esto habría que recargar para ver un reintento, que
  // es justo lo que la pantalla tiene que mostrar.
  useEffect(() => {
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const filters = useMemo(() => ({ portKey, status, errorType, search }), [portKey, status, errorType, search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const traffic = useMemo(() => getTraffic(filters, { role }), [filters, role, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getTrafficSummary(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jobs = useMemo(() => listRetryJobs(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => listIdempotencyKeys(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const connections = useMemo(() => listConnections(), [version]);

  const enabled = connections.filter((c) => c.enabled);
  const withTraffic = connections.filter((c) => c.stats.total > 0);

  const handleRetry = (callId) => {
    const result = retryCall(callId, { role });
    showToast(result.ok ? "Reintentado con la misma clave de idempotencia." : result.error, result.ok ? "success" : "warning");
    setDetail(null);
    refresh();
  };

  const handleSend = () => {
    const result = sendSample(sendPort, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    showToast(
      result.failed
        ? `Falló como ${result.error.type}: ${result.error.message}`
        : "Llamada hecha: quedó en la traza.",
      result.failed ? "warning" : "success"
    );
    refresh();
  };

  const handleExport = () => {
    const result = exportTrafficCsv(filters, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    download(result.csv, `trafico-integraciones-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  /* ------------------------------------------------------------- RBAC */
  if (!allowed) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Consola de tráfico" subtitle="Todas las llamadas que cruzan la frontera." />
        <Card className="entity-card in-note">
          <StatusBadge tone="warning" label="Sin permiso" showDot={false} />
          <span>
            El tráfico puede contener datos de clientes, así que verlo está reservado a
            <strong> Admin y Dirección</strong> (§10). El permiso se aplica en el <code className="in-code">api/</code>,
            no escondiendo la pantalla: por eso esto se ve y explica, en vez de desaparecer del menú.
          </span>
        </Card>
      </Box>
    );
  }

  const columns = [
    {
      field: "at", headerName: "Cuándo",
      renderCell: (c) => <span className="nowrap">{stamp(c.at)}</span>,
    },
    {
      field: "direction", headerName: "Sentido",
      renderCell: (c) => (
        <span className={`in-chip ${c.direction === "entrante" ? "in-chip--wired" : ""}`}>
          {c.direction === "entrante" ? "entrante" : "saliente"}
        </span>
      ),
    },
    {
      field: "portKey", headerName: "Capacidad",
      renderCell: (c) => (
        <Box className="in-cell">
          <strong>{c.port?.label || c.portKey}</strong>
          <em>{c.operation}</em>
        </Box>
      ),
    },
    {
      field: "subject", headerName: "Sobre",
      renderCell: (c) => (c.subject
        ? <span className="text-secondary nowrap">{c.subject.type} {c.subject.id}</span>
        : <span className="text-tertiary">—</span>),
    },
    {
      field: "status", headerName: "Resultado",
      renderCell: (c) => (
        <Tooltip title={c.statusMeta?.hint || ""}>
          <span><StatusBadge tone={c.statusMeta?.tone} label={c.statusMeta?.label} showDot={false} /></span>
        </Tooltip>
      ),
    },
    {
      field: "attempt", headerName: "Intento", align: "center",
      renderCell: (c) => <span className="text-tertiary">{c.attempt}</span>,
    },
    {
      field: "durationMs", headerName: "ms", align: "right",
      renderCell: (c) => <span className="text-tertiary">{c.durationMs ?? "—"}</span>,
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Consola de tráfico"
        subtitle="Una fila por intento, no por hecho. Los reintentos de una misma operación quedan atados por su correlación."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/integraciones/webhooks")}>Entrantes</Button>
            <Button variant="secondary" onClick={() => navigate("/integraciones")}>Catálogo</Button>
            <Button variant="primary" startIcon={<DownloadOutlinedIcon />} onClick={handleExport}>
              Exportar CSV
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------ resumen */}
      <Box className="in-summary">
        <div className="in-summary__item"><strong>{summary.calls}</strong><span>intentos registrados</span></div>
        <div className="in-summary__item"><strong>{summary.outbound}</strong><span>salientes</span></div>
        <div className="in-summary__item"><strong>{summary.inbound}</strong><span>entrantes</span></div>
        <div className="in-summary__item"><strong>{summary.errors}</strong><span>con error</span></div>
        <div className="in-summary__item"><strong>{summary.fallback}</strong><span>resueltas local</span></div>
        <div className="in-summary__item"><strong>{summary.replayed}</strong><span>repetidas (idempotencia)</span></div>
        <div className="in-summary__item"><strong>{summary.waiting}</strong><span>esperando reintento</span></div>
      </Box>

      {/* --------------------------------------------------- el inyector */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Mandar una llamada</Typography>
          <Typography variant="caption" className="text-tertiary">
            Esto no es el dry-run: cruza la frontera de verdad
          </Typography>
        </Box>

        <Box className="in-testrow">
          <TextField
            select size="small" label="Puerto habilitado" value={sendPort}
            onChange={(e) => setSendPort(e.target.value)} sx={{ minWidth: 300 }}
            disabled={enabled.length === 0}
          >
            {enabled.map((c) => (
              <MenuItem key={c.portKey} value={c.portKey}>{c.port.label} — {c.providerKey}</MenuItem>
            ))}
          </TextField>
          <Tooltip title={mayRetry ? "" : "Reservado a Admin (§10)."}>
            <span>
              <Button
                variant="primary" startIcon={<SendOutlinedIcon />}
                disabled={!sendPort || !mayRetry} onClick={handleSend}
              >
                Llamar
              </Button>
            </span>
          </Tooltip>
        </Box>

        <Typography variant="body2" className="text-tertiary">
          {enabled.length === 0
            ? "No hay ningún puerto habilitado: no hay frontera que cruzar. Conectá un proveedor desde el catálogo."
            : "Va sin fallback a propósito: si la llamada cayera al cálculo local, se escondería justo lo que se está probando. Con el doble de prueba en «falla de transporte» se puede ver el error, la cola y el backoff."}
        </Typography>
      </Card>

      {/* ------------------------------------------------------ filtros */}
      <Box className="table-tabs">
        <TextField select size="small" label="Capacidad" value={portKey} onChange={(e) => setFiltros({ capacidad: e.target.value })} sx={{ minWidth: 220 }}>
          <MenuItem value="">Todas</MenuItem>
          {withTraffic.map((c) => (
            <MenuItem key={c.portKey} value={c.portKey}>{c.port.label}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Resultado" value={status} onChange={(e) => setFiltros({ resultado: e.target.value })} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.values(CALL_STATUS).map((s) => (
            <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Tipo de error" value={errorType} onChange={(e) => setFiltros({ error: e.target.value })} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todos</MenuItem>
          {listErrorTypes().map((t) => (
            <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small" placeholder="Buscar por sujeto, clave u operación…"
          value={search} onChange={(e) => setFiltros({ search: e.target.value })} sx={{ minWidth: 280 }}
        />
      </Box>

      <DataTable
        columns={columns}
        data={traffic.calls}
        emptyMessage="Todavía no cruzó ninguna llamada la frontera. Mientras no haya proveedor habilitado, cada puerto se resuelve con la implementación local de su módulo — y eso no se registra acá: no hay frontera que cruzar."
        onRowClick={(row) => setDetail(row)}
      />

      {/* -------------------------------------------------- cola de reintentos */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Cola de reintentos</Typography>
          <Typography variant="caption" className="text-tertiary">
            backoff {summary.backoff?.baseMs / 1000}s × {summary.backoff?.factor} · hasta {summary.backoff?.maxAttempts} intentos
          </Typography>
        </Box>

        {jobs.length === 0 ? (
          <Typography variant="body2" className="text-tertiary">
            Nada pendiente. Sólo entra acá lo que <strong>puede andar en el próximo intento</strong> y
            <strong> quedó sin hacer</strong>: una credencial inválida no se reintenta —sólo gasta cuota
            y esconde que hace falta una persona— y una llamada que cayó al fallback ya está resuelta.
          </Typography>
        ) : (
          <Box className="in-jobs">
            {jobs.map((j) => (
              <div className={`in-job is-${j.state}`} key={j.id}>
                <div className="in-job__main">
                  <strong>{j.portKey}</strong>
                  <em>{j.errorType} · {j.errorMessage}</em>
                </div>
                <div className="in-job__meta">
                  <StatusBadge tone={JOB_STATES[j.state]?.tone} label={JOB_STATES[j.state]?.label} showDot={false} />
                  <span className="in-chip">intento {j.attempt}/{j.maxAttempts}</span>
                  {j.state === "esperando" && (
                    <Tooltip title={`Próximo intento: ${new Date(j.dueAt).toLocaleTimeString("es-AR")}`}>
                      <span className="in-chip in-chip--warn">
                        <ScheduleOutlinedIcon sx={{ fontSize: 11 }} /> {inSeconds(j.dueAt)}
                      </span>
                    </Tooltip>
                  )}
                  {j.idempotencyKey && <span className="in-chip">{j.idempotencyKey}</span>}
                </div>
                <div className="in-job__actions">
                  {["esperando", "agotado"].includes(j.state) && (
                    <>
                      <Button variant="secondary" disabled={!mayRetry} onClick={() => { const r = retryJobNow(j.id, { role }); showToast(r.ok ? "Reintentado." : r.error, r.ok ? "success" : "warning"); refresh(); }}>
                        Reintentar ya
                      </Button>
                      <Button variant="ghost" disabled={!mayRetry} onClick={() => { cancelRetry(j.id, { role }); refresh(); }}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Box>
        )}

        <Box className="in-callout in-callout--warn">
          <ScheduleOutlinedIcon sx={{ fontSize: 16 }} />
          <span>
            <strong>El reloj es el del navegador y nada corre con el panel cerrado.</strong> La cola
            avanza mientras esta pestaña está abierta, igual que el motor de Automatizaciones. Se dice
            en vez de fingir un worker que no existe.
          </span>
        </Box>
      </Card>

      {/* ------------------------------------------------ idempotencia */}
      {keys.length > 0 && (
        <Card className="entity-card">
          <Box className="card-title-row">
            <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Claves de idempotencia</Typography>
            <Typography variant="caption" className="text-tertiary">
              Un reintento con la misma clave devuelve el primer resultado, sin volver a llamar
            </Typography>
          </Box>
          <Box className="in-keys">
            {keys.map((k) => (
              <div className="in-key" key={k.key}>
                <code className="in-code">{k.key}</code>
                <em>{k.callId} · {stamp(k.at)}</em>
              </div>
            ))}
          </Box>
        </Card>
      )}

      {detail && (
        <CallDetail
          call={detail}
          canRetry={mayRetry}
          onRetry={handleRetry}
          onClose={() => setDetail(null)}
        />
      )}
    </Box>
  );
};

export default Trafico;
