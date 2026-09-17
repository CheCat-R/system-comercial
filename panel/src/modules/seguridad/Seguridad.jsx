/**
 * Tablero de Seguridad (§7).
 *
 * En F1 contesta las dos primeras preguntas del módulo: **¿quién sos?** y **¿qué
 * podés hacer?**. La tercera —*¿quién hizo esto y qué cambió?*— llega en F2, y
 * la pantalla lo dice en vez de mostrar un tablero a medio llenar sin avisar.
 */
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

import {
  getSecuritySummary, coverage, listPermissions, describeRemaining, SESSION_POLICY,
  PASSWORD_POLICY, LOCKOUT, legacyRoleUses, getBrokenContracts, getAuditSummary,
  getApprovalsSummary, THRESHOLDS,
} from "./api/securityApi";
import "./Seguridad.css";

/** Lo que no se puede garantizar sin backend (§10). Se dice, no se finge. */
const SIN_BACKEND = [
  ["Guardar contraseñas de verdad", "No hay hash ni servidor. El panel no guarda contraseñas: valida la política y marca la cuenta como verificada."],
  ["Cerrar sesión en otro dispositivo", "No hay nada que invalidar del otro lado. Se declara y se muestra deshabilitado."],
  ["Segundo factor (2FA)", "Requiere un emisor y una verificación fuera del navegador."],
  ["Auditoría a prueba de manipulación", "Todo vive en memoria del navegador: la evidencia es demostrativa, no forense."],
];

const Seguridad = () => {
  const navigate = useNavigate();
  const { user, session, sessionStatus } = useAuth();

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getSecuritySummary(), [tick]);
  const cov = useMemo(() => coverage(), []);
  const total = useMemo(() => listPermissions().length, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => sessionStatus(), [tick, sessionStatus]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const legacy = useMemo(() => legacyRoleUses(), [tick]);
  const broken = useMemo(() => getBrokenContracts(), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const auditoria = useMemo(() => getAuditSummary(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const approvals = useMemo(() => getApprovalsSummary(), [tick]);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Seguridad"
        subtitle="Quién sos, qué podés hacer y —desde la Fase 2— quién hizo qué."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate("/seguridad/aprobaciones")}>
              Aprobaciones{approvals.pending > 0 ? ` (${approvals.pending})` : ""}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/seguridad/actividad")}>Actividad</Button>
            <Button variant="secondary" onClick={() => navigate("/seguridad/auditoria")}>Auditoría</Button>
            <Button variant="secondary" onClick={() => navigate("/seguridad/roles")}>Roles y permisos</Button>
            <Button variant="primary" onClick={() => navigate("/seguridad/usuarios")}>Usuarios</Button>
          </>
        )}
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{summary.users}</strong><span>usuarios en el padrón</span></div>
        <div className="sec-summary__item"><strong>{summary.roles}</strong><span>roles</span></div>
        <div className="sec-summary__item"><strong>{summary.permissions}</strong><span>permisos declarados</span></div>
        <div className="sec-summary__item"><strong>{summary.wired}</strong><span>ya aplicados</span></div>
        <div className="sec-summary__item"><strong>{summary.sensitive}</strong><span>con motivo o aprobación</span></div>
        <div className="sec-summary__item"><strong>{summary.exceptions}</strong><span>excepciones nominales</span></div>
      </Box>

      {broken.length > 0 && (
        <Card className="entity-card sec-broken">
          <strong>{broken.length} contrato(s) incompletos</strong>
          <span>{broken.join(" · ")}</span>
        </Card>
      )}

      {/* ------------------------------------------------------ mi sesión */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Tu sesión</Typography>
          <StatusBadge
            tone={status.state === "activa" ? "success" : status.state === "por_vencer" ? "warning" : "neutral"}
            label={status.state === "por_vencer" ? "Por vencer" : status.state === "activa" ? "Activa" : "Cerrada"}
          />
        </Box>

        <Box className="sec-kv">
          <span>Usuario</span><div>{user?.name} · <em className="sec-hint">{user?.email}</em></div>
          <span>Rol</span>
          <div>
            <span className={`sec-chip sec-chip--${user?.roleMeta?.tone}`}>{user?.roleMeta?.label}</span>
            <em className="sec-hint">{user?.roleMeta?.hint}</em>
          </div>
          <span>Permisos efectivos</span>
          <div>
            <strong>{user?.permissions?.length ?? 0}</strong> de {total}
            <em className="sec-hint">Los del rol, más o menos las excepciones nominales.</em>
          </div>
          <span>Vence</span>
          <div>
            <ScheduleOutlinedIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "-2px" }} />
            {describeRemaining(status.remainingMs)}
            <em className="sec-hint">
              {SESSION_POLICY.idleMinutes} min de inactividad · {SESSION_POLICY.maxHours} h de duración máxima.
              Se avisa {SESSION_POLICY.warnMinutes} min antes y se puede extender.
            </em>
          </div>
          <span>Inicio</span><div>{session ? new Date(session.startedAt).toLocaleString("es-AR") : "—"}</div>
        </Box>
      </Card>

      {/* ------------------------------------------------ el estado de la migración */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Dónde se decide un permiso</Typography>
          <Typography variant="caption" className="text-tertiary">antes: 3 expresiones regulares · ahora: 1 catálogo</Typography>
        </Box>

        <Box className="sec-kv">
          <span>Catálogo</span>
          <div>
            <strong>{cov.total}</strong> permisos con contrato, verificados al cargar
            <em className="sec-hint">
              Mismo mecanismo que <code className="sec-code">assertContracts()</code> en Analytics y{" "}
              <code className="sec-code">assertProviderContracts()</code> en Integraciones.
            </em>
          </div>
          <span>Aplicados</span>
          <div>
            <strong>{cov.wired}</strong> ya se resuelven en el punto que declaran ·{" "}
            <strong>{cov.declared}</strong> declarados sin aplicar
            <em className="sec-hint">Se cablean al pasar el actor por los api/ (F2) y al aplicar los grados (F3).</em>
          </div>
          <span>Puente con lo viejo</span>
          <div>
            {legacy === 0
              ? <>Ninguna resolución por texto libre en esta sesión.</>
              : <><strong>{legacy}</strong> resoluciones por texto libre</>}
            <em className="sec-hint">
              ⭐ Las pantallas que todavía mandan <code className="sec-code">user.role</code> como
              cadena se resuelven por un puente. Contarlas es lo que evita que el puente se vuelva
              permanente.
            </em>
          </div>
        </Box>
      </Card>

      {/* --------------------------------------------------- la traza */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>La traza</Typography>
          <Button variant="ghost" onClick={() => navigate("/seguridad/auditoria")}>Ver la auditoría →</Button>
        </Box>

        <Box className="sec-kv">
          <span>Asientos</span>
          <div>
            <strong>{auditoria.total}</strong> · {auditoria.changes} con cambios · {auditoria.reads} de sólo actividad
            <em className="sec-hint">
              Un asiento es un hecho consumado: se escribe después de que la operación tuvo efecto.
            </em>
          </div>
          <span>Quién actuó</span>
          <div>
            {Object.entries(auditoria.byKind).map(([kind, n]) => (
              <span key={kind}>{kind}: {n} </span>
            ))}
            <em className="sec-hint">
              ⭐ Un actor puede ser una persona, una automatización o una integración. «sistema»
              significa que alguien escribió sin actor en contexto.
            </em>
          </div>
          <span>Retención</span>
          <div>
            Hasta {auditoria.limit} asientos en memoria
            {auditoria.dropped > 0 && <> · <strong>{auditoria.dropped} ya se cayeron</strong></>}
            <em className="sec-hint">
              El tope no es el problema: el silencio sí. Lo que se cae se cuenta y se dice.
            </em>
          </div>
        </Box>
      </Card>

      {/* ----------------------------------------------- lo que espera firma */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Lo que espera una firma</Typography>
          <Button variant="ghost" onClick={() => navigate("/seguridad/aprobaciones")}>Ver la cola →</Button>
        </Box>

        <Box className="sec-kv">
          <span>Pendientes</span>
          <div>
            <strong>{approvals.pending}</strong> esperando un segundo par de ojos
            <em className="sec-hint">
              Quien aprueba no puede ser quien pidió. Es la única regla de este módulo que necesita
              que haya <strong>dos personas</strong> con el mismo permiso para poder cumplirse.
            </em>
          </div>
          <span>Resueltas</span>
          <div>
            {approvals.approved} aprobadas · {approvals.rejected} rechazadas · {approvals.stale} obsoletas
            <em className="sec-hint">
              ⭐ «Obsoleta» no es un error: es que el mundo cambió entre el pedido y la firma, y
              aprobar revalida antes de ejecutar en vez de reproducir una decisión vieja.
            </em>
          </div>
          <span>Umbrales</span>
          <div>
            {Object.values(THRESHOLDS).map((t) => <span key={t.key} className="sec-chip">{t.label}</span>)}
            <em className="sec-hint">
              El grado no depende sólo de qué operación es, sino de cuánto duele esta vez: pasado el
              umbral, la misma operación sube de «con motivo» a «con aprobación».
            </em>
          </div>
        </Box>
      </Card>

      {/* --------------------------------------------------- políticas */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Políticas vigentes</Typography>
        </Box>
        <Box className="sec-kv">
          <span>Contraseña</span><div>{PASSWORD_POLICY.hint}</div>
          <span>Intentos fallidos</span>
          <div>
            {LOCKOUT.maxAttempts} intentos → cuenta bloqueada {LOCKOUT.minutes} minutos
            <em className="sec-hint">El mensaje de error no dice si el email existe: no se le confirma el padrón a un desconocido.</em>
          </div>
          <span>Alta de cuentas</span>
          <div>
            Sólo por invitación de un administrador
            <em className="sec-hint">Antes <code className="sec-code">/register</code> creaba cuentas con rol Administrador.</em>
          </div>
          <span>Bajas</span><div>Se desactivan, no se borran: borrar dejaría huérfano el rastro de auditoría.</div>
        </Box>
      </Card>

      {/* ----------------------------------------------- sin backend */}
      <Card className="entity-card sec-limits">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
            <KeyOutlinedIcon sx={{ fontSize: 17, mr: 0.5, verticalAlign: "-3px" }} />
            Lo que no se puede sin backend
          </Typography>
          <Typography variant="caption" className="text-tertiary">se dice, no se finge</Typography>
        </Box>

        {SIN_BACKEND.map(([what, why]) => (
          <div className="sec-limit" key={what}>
            <StatusBadge tone="neutral" label="requiere backend" showDot={false} />
            <div>
              <strong>{what}</strong>
              <em>{why}</em>
            </div>
          </div>
        ))}
      </Card>

      <Card className="entity-card sec-note">
        <ShieldOutlinedIcon />
        <div>
          <strong>Lo que falta, y cuándo.</strong>
          <span>
            <strong>F2</strong> trae la auditoría: el actor viajando por los{" "}
            <code className="sec-code">api/</code> —y el fin del{" "}
            <code className="sec-code">createdBy = &quot;Vos&quot;</code>—, el registro de cambios campo
            a campo y el historial dentro de cada entidad. <strong>F3</strong> aplica los cuatro
            grados sobre las ocho superficies, con motivo obligatorio y segundo par de ojos.
          </span>
        </div>
      </Card>
    </Box>
  );
};

export default Seguridad;
