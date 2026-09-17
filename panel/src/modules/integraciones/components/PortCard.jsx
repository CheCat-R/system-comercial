/**
 * Una fila del catálogo: un puerto, con lo que está corriendo hoy.
 *
 * Lo que la fila tiene que contestar de un vistazo: **qué capacidad es, quién la
 * está atendiendo y si alguien del núcleo la usa**. El resto está en el detalle.
 */
import Tooltip from "@mui/material/Tooltip";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";

import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { SENSITIVITY } from "../api/integrationsApi";

const PortCard = ({ connection, onOpen }) => {
  const { port, stateMeta, running, stats, providerKey } = connection;
  const sens = SENSITIVITY[port.sensitivity];

  return (
    <div
      className={`in-port ${running === "local" ? "is-local" : "is-provider"}`}
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <div className="in-port__main">
        <strong>{port.label}</strong>
        <em>{port.key}</em>
      </div>

      <div className="in-port__running">
        {running === "local" ? (
          <Tooltip title={port.fallback}>
            <span className="in-chip">Simulado · {port.owner}</span>
          </Tooltip>
        ) : (
          <span className="in-chip in-chip--ok">
            <LinkOutlinedIcon sx={{ fontSize: 11 }} /> {providerKey}
          </span>
        )}
      </div>

      <div className="in-port__flags">
        {port.wiredAt ? (
          <Tooltip title={`Lo consume: ${port.wiredAt}`}>
            <span className="in-chip in-chip--wired">consumido</span>
          </Tooltip>
        ) : (
          <Tooltip title="Está declarado con su contrato, pero todavía ningún módulo lo llama.">
            <span className="in-chip">declarado</span>
          </Tooltip>
        )}

        {port.syncOnly && (
          <Tooltip title="Lo consume una pantalla al renderizar: no puede esperar una llamada de red.">
            <span className="in-chip in-chip--warn">síncrono</span>
          </Tooltip>
        )}

        {port.sensitivity === "alta" && (
          <Tooltip title={sens.hint}>
            <span className="in-chip in-chip--danger">
              <LockOutlinedIcon sx={{ fontSize: 11 }} /> sensible
            </span>
          </Tooltip>
        )}
      </div>

      <div className="in-port__state">
        <StatusBadge tone={stateMeta.tone} label={stateMeta.label} showDot={false} />
        {stats.total > 0 && (
          <Tooltip title={`${stats.local} resueltas localmente · ${stats.provider} por un proveedor`}>
            <em>{stats.total} llamada(s)</em>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default PortCard;
