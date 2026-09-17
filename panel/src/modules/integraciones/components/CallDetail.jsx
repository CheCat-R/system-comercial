/**
 * Detalle de una llamada (§9.4).
 *
 * Contesta las dos preguntas que se hacen mirando un error: **qué le mandamos** y
 * **qué contestó**. Y una tercera que casi nunca está: *¿cuántas veces se
 * intentó esto?* — por eso la cadena de correlación se muestra completa, no sólo
 * el último intento.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";

import { chainOf, previewPayload, describeIdempotency } from "../api/integrationsApi";

const CallDetail = ({ call, canRetry, onRetry, onClose }) => {
  if (!call) return null;

  const chain = chainOf(call.correlationId);
  const idem = describeIdempotency(call.portKey);
  const retryable = call.direction === "saliente" && call.errorType && call.errorType !== "negocio";

  return (
    <Modal
      open onClose={onClose} maxWidth="md"
      title={`${call.port?.label || call.portKey} · ${call.id}`}
      subtitle={call.statusMeta?.hint}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {retryable && (
            <Tooltip title={canRetry ? "Se manda otra vez, con la misma clave de idempotencia." : "Reintentar está reservado a Admin (§10)."}>
              <span>
                <Button variant="primary" disabled={!canRetry} onClick={() => onRetry(call.id)}>
                  Reintentar
                </Button>
              </span>
            </Tooltip>
          )}
        </>
      }
    >
      <Box className="in-form">
        <Box className="in-kv">
          <span>Resultado</span>
          <div>
            <StatusBadge tone={call.statusMeta?.tone} label={call.statusMeta?.label} showDot={false} />
            {call.errorMeta && <span className="in-chip in-chip--warn in-chip--inline">{call.errorMeta.label}</span>}
          </div>
          <span>Sentido</span><div>{call.direction === "saliente" ? "Saliente · el panel llamó" : "Entrante · llegó un webhook"}</div>
          <span>Operación</span><div><code className="in-code">{call.operation}</code></div>
          <span>Sujeto</span>
          <div>
            {call.subject
              ? <>{call.subject.type} <code className="in-code">{call.subject.id}</code></>
              : <em className="text-tertiary">sin sujeto de dominio</em>}
          </div>
          <span>Intento</span><div>{call.attempt} · correlación <code className="in-code">{call.correlationId || "—"}</code></div>
          <span>Clave de idempotencia</span>
          <div>
            {call.idempotencyKey
              ? <code className="in-code">{call.idempotencyKey}</code>
              : <em className="text-tertiary">{idem.hint}</em>}
          </div>
          {call.durationMs != null && (<><span>Duración</span><div>{call.durationMs} ms</div></>)}
          {call.errorMessage && (<><span>Mensaje</span><div>{call.errorMessage}</div></>)}
        </Box>

        {call.idempotencyKey && idem.guarantee && (
          <Box className={`in-callout in-callout--${idem.guarantee.tone === "success" ? "ok" : "warn"}`}>
            <span><strong>{idem.guarantee.label}.</strong> {idem.guarantee.hint}</span>
          </Box>
        )}

        <span className="in-label">Qué se mandó</span>
        <pre className="in-dry__code">{previewPayload(call.request)}</pre>

        <span className="in-label">Qué contestó</span>
        {call.response
          ? <pre className="in-dry__code">{previewPayload(call.response)}</pre>
          : <p className="in-field__hint">No hubo respuesta: la llamada falló antes.</p>}

        <p className="in-field__hint">
          Los payloads se muestran <strong>redactados con la lista que declara el contrato del
          proveedor</strong>, no con una que decide la pantalla. Se guardan crudos porque, sin el
          original, un reintento mandaría <code className="in-code">•••1234</code> al proveedor.
        </p>

        {chain.length > 1 && (
          <>
            <span className="in-label">Los {chain.length} intentos de este mismo hecho</span>
            <Box className="in-chain">
              {chain.map((c) => (
                <div className={`in-chain__row ${c.id === call.id ? "is-current" : ""}`} key={c.id}>
                  <span className="in-chip">#{c.attempt}</span>
                  <StatusBadge tone={c.statusMeta?.tone} label={c.statusMeta?.label} showDot={false} />
                  <em>{c.errorMessage || `${c.durationMs} ms`}</em>
                </div>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Modal>
  );
};

export default CallDetail;
