/**
 * Activity Log (§2.8) — la lente por **actor**.
 *
 * *"¿Qué hizo Fulana hoy?"*. Es el mismo asiento que la auditoría, mirado desde
 * el otro lado, y con una diferencia que importa: **acá también entra lo que no
 * cambió nada** — entrar, salir, exportar. Sacar un CSV de clientes no modifica
 * un dato y aun así es algo que hay que poder ver.
 */
import { useState, useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";

import { ActorChip } from "./components/ChangeLog";
import {
  getAuditLog, auditActors, getAuditSummary, getPermission, describeChange, getActorKind,
} from "./api/securityApi";
import "./Seguridad.css";

const stamp = (iso) => new Date(iso).toLocaleString("es-AR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const Actividad = () => {
  const { user } = useAuth();

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const [selected, setSelected] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actors = useMemo(() => auditActors(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getAuditSummary(), [tick]);

  const actorId = selected || actors[0]?.id || null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const log = useMemo(() => getAuditLog({ actorId, limit: 100 }, { role: user }), [actorId, user, tick]);

  if (!log.ok) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Actividad" subtitle="Qué hizo cada quién, incluida la actividad que no cambia nada." />
        <Card className="entity-card sec-note">
          <StatusBadge tone="warning" label="Sin permiso" showDot={false} />
          <span>{log.error}</span>
        </Card>
      </Box>
    );
  }

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Actividad"
        subtitle="La misma traza que la auditoría, ordenada por quién. Acá también entra lo que no cambió nada: entrar, salir, exportar."
      />

      <Box className="sec-summary">
        <div className="sec-summary__item"><strong>{actors.length}</strong><span>actores en la traza</span></div>
        <div className="sec-summary__item"><strong>{summary.byKind.user || 0}</strong><span>de personas</span></div>
        <div className="sec-summary__item"><strong>{summary.byKind.automation || 0}</strong><span>de automatizaciones</span></div>
        <div className="sec-summary__item"><strong>{summary.byKind.integration || 0}</strong><span>de integraciones</span></div>
        <div className="sec-summary__item"><strong>{summary.byKind.sistema || 0}</strong><span>sin actor declarado</span></div>
      </Box>

      {(summary.byKind.sistema || 0) > 0 && (
        <Card className="entity-card sec-note">
          <StatusBadge tone="warning" label="Ojo" showDot={false} />
          <span>
            Hay <strong>{summary.byKind.sistema}</strong> asiento(s) firmados como
            <strong> Sistema</strong>. No es un estado normal: significa que alguna escritura ocurrió
            sin actor en contexto. Los intentos de ingreso fallidos cuentan acá a propósito — todavía
            no hay nadie identificado cuando ocurren.
          </span>
        </Card>
      )}

      <Box className="sec-actividad">
        {/* ------------------------------------------------ los actores */}
        <Card className="entity-card sec-actividad__side">
          <Typography variant="h6" className="card-title">Quiénes</Typography>
          {actors.length === 0 && (
            <Typography variant="body2" className="text-tertiary">
              Nadie hizo nada todavía en esta sesión.
            </Typography>
          )}
          {actors.map((a) => {
            const kind = getActorKind(a.kind);
            return (
              <div
                className={`sec-actor-row ${a.id === actorId ? "is-active" : ""}`}
                key={`${a.kind}:${a.id}`}
                role="button" tabIndex={0}
                onClick={() => setSelected(a.id)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelected(a.id); }}
              >
                <ActorChip actor={a} />
                <Box sx={{ flex: 1 }} />
                <Tooltip title={kind.hint}>
                  <span className="sec-chip">{a.entries}</span>
                </Tooltip>
              </div>
            );
          })}
        </Card>

        {/* -------------------------------------------------- la traza */}
        <Card className="entity-card sec-actividad__main">
          <Box className="card-title-row">
            <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
              {actors.find((a) => a.id === actorId)?.name || "Actividad"}
            </Typography>
            <Typography variant="caption" className="text-tertiary">
              {log.entries.length} registro(s), del más nuevo al más viejo
            </Typography>
          </Box>

          {log.entries.length === 0 ? (
            <Typography variant="body2" className="text-tertiary">Sin actividad registrada.</Typography>
          ) : (
            <Box className="sec-trail">
              {log.entries.map((e) => {
                const permission = getPermission(e.action);
                return (
                  <div className={`sec-trail__row ${e.result === "rechazado" ? "is-rejected" : ""}`} key={e.id}>
                    <div className="sec-trail__head">
                      <Tooltip title={permission?.hint || e.action}>
                        <strong>{permission?.label || e.action}</strong>
                      </Tooltip>
                      {e.readOnly && <span className="sec-chip">sin cambios</span>}
                      <Box sx={{ flex: 1 }} />
                      <em>{stamp(e.at)}</em>
                    </div>

                    {e.subject && (
                      <div className="sec-trail__subject">
                        sobre <strong>{e.subject.label || e.subject.id}</strong>
                        <span className="sec-chip">{e.subject.type}</span>
                      </div>
                    )}

                    {e.changes.length > 0 && (
                      <ul className="sec-trail__changes">
                        {e.changes.map((c) => <li key={c.field}>{describeChange(c)}</li>)}
                      </ul>
                    )}

                    {e.reason && <div className="sec-trail__reason">Motivo: “{e.reason}”</div>}
                    {e.denial && <div className="sec-trail__reason">Rechazado: {e.denial}</div>}
                    {e.meta && (
                      <div className="sec-trail__meta">
                        {Object.entries(e.meta).map(([k, v]) => (
                          <span className="sec-chip" key={k}>{k}: {String(v)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Box>
          )}
        </Card>
      </Box>
    </Box>
  );
};

export default Actividad;
