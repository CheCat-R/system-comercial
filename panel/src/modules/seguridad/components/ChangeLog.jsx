/**
 * ⭐ El historial de cambios de **una entidad** (§2.8).
 *
 * Es la única pieza de Seguridad que viaja fuera de su carpeta, y viaja por una
 * razón: **un rastro que obliga a irse del pedido para saber quién lo canceló no
 * se usa nunca**. Se incrusta en la pantalla de la cosa: el pedido, la conexión,
 * la persona.
 *
 * Muestra el cambio **campo a campo** (`Estado de pago: Pendiente → Pagado`), el
 * actor —que puede ser una persona, una automatización o una integración— y el
 * motivo cuando la operación lo exigió.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import Button from "../../../components/Button/Button";
import { getEntityAudit, getActorKind, describeChange, getPermission } from "../api/securityApi";
import "../Seguridad.css";

const ICONS = {
  user: PersonOutlineIcon,
  automation: BoltOutlinedIcon,
  integration: HubOutlinedIcon,
  sistema: SettingsOutlinedIcon,
};

export const ActorChip = ({ actor }) => {
  const kind = getActorKind(actor?.kind);
  const Icon = ICONS[kind.key] || SettingsOutlinedIcon;
  return (
    <Tooltip title={`${kind.label} — ${kind.hint}`}>
      <span className={`sec-actor sec-actor--${kind.tone}`}>
        <Icon sx={{ fontSize: 12 }} />
        {actor?.name || "Sistema"}
      </span>
    </Tooltip>
  );
};

const stamp = (iso) => new Date(iso).toLocaleString("es-AR", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const ChangeLog = ({ subjectType, subjectId, title = "Historial de cambios", limit = 8, card = true }) => {
  const [expanded, setExpanded] = useState(false);

  // ⭐ Sin memo a propósito: la traza vive **fuera de React** (es una hoja en
  // memoria), así que memoizarla por props dejaba el historial congelado — se
  // confirmaba un pago y el bloque seguía diciendo "sin cambios registrados".
  // Encontrado probando F2.
  const entries = getEntityAudit(subjectType, subjectId, { limit: expanded ? 50 : limit });

  const body = (
    <>
      {entries.length === 0 ? (
        <Typography variant="body2" className="text-tertiary">
          Sin cambios registrados en esta sesión. La auditoría empieza a llenarse cuando alguien
          opera: no hay asientos inventados hacia atrás.
        </Typography>
      ) : (
        <Box className="sec-trail">
          {entries.map((e) => {
            const permission = getPermission(e.action);
            return (
              <div className={`sec-trail__row ${e.result === "rechazado" ? "is-rejected" : ""}`} key={e.id}>
                <div className="sec-trail__head">
                  <ActorChip actor={e.actor} />
                  <Tooltip title={permission?.hint || e.action}>
                    <strong>{permission?.label || e.action}</strong>
                  </Tooltip>
                  <Box sx={{ flex: 1 }} />
                  <em>{stamp(e.at)}</em>
                </div>

                {e.changes.length > 0 && (
                  <ul className="sec-trail__changes">
                    {e.changes.map((c) => (
                      <li key={c.field}>{describeChange(c)}</li>
                    ))}
                  </ul>
                )}

                {e.reason && <div className="sec-trail__reason">Motivo: “{e.reason}”</div>}
                {e.denial && <div className="sec-trail__reason">Rechazado: {e.denial}</div>}
                {e.ref && <span className="sec-chip">ref {e.ref}</span>}
              </div>
            );
          })}
        </Box>
      )}

      {entries.length >= limit && !expanded && (
        <Button variant="ghost" onClick={() => setExpanded(true)}>Ver más</Button>
      )}
    </>
  );

  if (!card) return body;

  return (
    <Card className="entity-card">
      <Box className="card-title-row">
        <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>{title}</Typography>
        <Typography variant="caption" className="text-tertiary">
          quién, qué cambió y por qué
        </Typography>
      </Box>
      {body}
    </Card>
  );
};

export default ChangeLog;
