/**
 * Entrantes (§9.5).
 *
 * Qué llegó, si la firma validó, si era duplicado, **a qué evento de dominio
 * tradujo** y qué pasó después. Las cinco etapas se muestran una por una porque
 * lo que hay que poder contestar acá es *dónde se cortó*: un webhook que no hizo
 * nada y no dice por qué es indistinguible de un webhook que nunca llegó.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import CallReceivedOutlinedIcon from "@mui/icons-material/CallReceivedOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";

import WebhookInjector from "./components/WebhookInjector";
import {
  start, listInbound, inboundSummary, inboundCapablePorts, webhookSamples, injectWebhook,
  DISCARD, EFFECTS, canConfigure, previewPayload,
} from "./api/integrationsApi";
import "./Integraciones.css";

const stamp = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-AR") : "—");

const Webhooks = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const role = user?.role || "";
  const mayInject = canConfigure(role);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [open, setOpen] = useState(null);

  useEffect(() => { start(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => listInbound(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => inboundSummary(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ports = useMemo(() => inboundCapablePorts(), [version]);

  // ⭐ Los ejemplos se arman **una vez**: si se regeneraran en cada refresco,
  // cada inyección traería un id nuevo y la deduplicación no se podría ver.
  const samples = useMemo(() => webhookSamples(), []);

  const handleInject = (portKey, options) => {
    const result = injectWebhook(portKey, options, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    const entry = result.entry;
    showToast(
      entry.discarded
        ? `Descartado: ${DISCARD[entry.discarded].label}`
        : `Traducido a ${entry.translated.event}`,
      entry.discarded ? "warning" : "success"
    );
    setOpen(entry.id);
    refresh();
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Entrantes"
        subtitle="De webhook a evento de dominio: recepción, firma, deduplicación, traducción y efecto."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/integraciones/trafico")}>Consola de tráfico</Button>
            <Button variant="secondary" onClick={() => navigate("/integraciones")}>Catálogo</Button>
          </>
        }
      />

      <Box className="in-summary">
        <div className="in-summary__item"><strong>{summary.total}</strong><span>recibidos</span></div>
        <div className="in-summary__item"><strong>{summary.accepted}</strong><span>traducidos</span></div>
        <div className="in-summary__item"><strong>{summary.discarded}</strong><span>descartados</span></div>
        <div className="in-summary__item"><strong>{Object.keys(EFFECTS).length}</strong><span>eventos con efecto declarado</span></div>
      </Box>

      {/* ------------------------------------------------- la explicación */}
      <Card className="entity-card in-explain">
        <CallReceivedOutlinedIcon />
        <div>
          <strong>Lo externo entra traducido, o no entra.</strong>
          <span>
            Un webhook que no se puede traducir a un evento del catálogo <strong>se descarta y se
            registra</strong>: no se inventa un evento nuevo para acomodar a un proveedor, porque el
            catálogo de eventos es el vocabulario del panel y estirarlo por cada integración lo vacía
            de significado. Y el que escribe en el dominio es siempre el <strong>módulo dueño, por su
            propio <code className="in-code">api/</code></strong>, con sus validaciones intactas.
          </span>
        </div>
      </Card>

      <WebhookInjector
        ports={ports}
        samples={samples}
        canInject={mayInject}
        onInject={handleInject}
      />

      {/* ------------------------------------------------------ recibidos */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Lo que llegó</Typography>
          <Typography variant="caption" className="text-tertiary">del más nuevo al más viejo</Typography>
        </Box>

        {entries.length === 0 ? (
          <Typography variant="body2" className="text-tertiary">
            Todavía no entró nada. Inyectá un ejemplo para ver el recorrido completo.
          </Typography>
        ) : (
          entries.map((e) => (
            <div className={`in-inbound ${e.discarded ? "is-discarded" : "is-ok"}`} key={e.id}>
              <div
                className="in-inbound__head"
                role="button" tabIndex={0}
                onClick={() => setOpen(open === e.id ? null : e.id)}
                onKeyDown={(ev) => { if (ev.key === "Enter") setOpen(open === e.id ? null : e.id); }}
              >
                <span className="in-chip">{e.id}</span>
                <strong>{e.raw?.type || "sin tipo"}</strong>
                {e.discarded ? (
                  <Tooltip title={DISCARD[e.discarded].hint}>
                    <span><StatusBadge tone={DISCARD[e.discarded].tone} label={DISCARD[e.discarded].label} showDot={false} /></span>
                  </Tooltip>
                ) : (
                  <StatusBadge tone="success" label={e.translated.event} showDot={false} />
                )}
                <Box sx={{ flex: 1 }} />
                <em className="text-tertiary">{stamp(e.at)}</em>
              </div>

              {open === e.id && (
                <div className="in-inbound__body">
                  <span className="in-label">Las etapas</span>
                  <ol className="in-steps">
                    {e.steps.map((s) => (
                      <li className={s.ok ? "is-ok" : "is-fail"} key={s.name}>
                        {s.ok
                          ? <CheckCircleOutlineIcon sx={{ fontSize: 15 }} />
                          : <ErrorOutlineIcon sx={{ fontSize: 15 }} />}
                        <div>
                          <strong>{s.name}</strong>
                          <em>{s.detail}</em>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {e.effect && (
                    <Box className={`in-callout ${e.effect.applied ? "in-callout--ok" : "in-callout--warn"}`}>
                      <span>
                        <strong>{e.effect.applied ? "El módulo dueño escribió" : "El módulo dueño no escribió"}</strong>
                        {" — "}{e.effect.message}
                      </span>
                    </Box>
                  )}

                  <span className="in-label">Lo que llegó</span>
                  <pre className="in-dry__code">{previewPayload(e.raw)}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      <Typography variant="caption" className="text-tertiary">
        Cada webhook aceptado deja también su fila en la <strong>consola de tráfico</strong> con
        sentido «entrante»: entrante y saliente se leen en la misma pantalla porque los dos son la
        misma frontera.
      </Typography>
    </Box>
  );
};

export default Webhooks;
