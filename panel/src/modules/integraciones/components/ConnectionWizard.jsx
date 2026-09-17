/**
 * ⭐ El asistente de conexión (§9.3).
 *
 *   Elegir proveedor → Configurar → Probar → Habilitar
 *
 * **El orden no es decorativo: no se puede habilitar sin una prueba exitosa.**
 * Es la misma idea que "una regla en borrador nunca ejecuta" en Automatizaciones
 * — poner a correr sobre datos reales algo que no sabemos si responde es la
 * forma más rápida de romper una operación.
 *
 * El paso 3 hace las dos cosas que importan antes de apretar: el `healthCheck`
 * que declara el contrato, y el **dry-run**, que muestra exactamente qué se
 * mandaría sin mandarlo.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";

import ConfigForm from "./ConfigForm";
import {
  listProviders, getProvider, configureConnection, testConnection, dryRun, enableConnection,
  MODES, canGoLive, previewPayload,
} from "../api/integrationsApi";

const STEPS = ["Elegir proveedor", "Configurar", "Probar", "Habilitar"];

const ConnectionWizard = ({ portKey, port, role, onClose, onDone, showToast }) => {
  const providers = listProviders({ port: portKey });

  const [step, setStep] = useState(0);
  const [providerKey, setProviderKey] = useState(providers[0]?.key || "");
  const [mode, setMode] = useState("simulado");
  const [values, setValues] = useState({});
  const [health, setHealth] = useState(null);
  const [dry, setDry] = useState(null);

  const provider = providerKey ? getProvider(providerKey) : null;
  const live = provider ? canGoLive(provider.config) : { ok: true };

  const handleConfigure = () => {
    const result = configureConnection(portKey, { providerKey, values, mode }, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    if (result.secretsProvided > 0) {
      showToast(`Guardado. ${result.secretsProvided} secreto(s) NO se persistieron: sólo quedó la referencia.`, "info");
    }
    setStep(2);
  };

  const handleTest = () => {
    const result = testConnection(portKey, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    setHealth(result.health);
  };

  const handleDryRun = () => {
    const result = dryRun(portKey, { role });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    setDry(result);
  };

  const handleEnable = () => {
    // El asistente escribe su propio motivo: el alta **es** la justificación, y
    // pedirle una frase más a quien acaba de recorrer cuatro pasos y probar la
    // conexión sería burocracia sin información nueva.
    const result = enableConnection(portKey, {
      reason: `Alta de la conexión desde el asistente: ${providerKey} en modo ${mode}, con prueba exitosa.`,
    });
    if (!result.ok) { showToast(result.error, "warning"); return; }
    showToast("Integración habilitada: el puerto pasó a resolverse por el proveedor.", "success");
    onDone?.();
    onClose();
  };

  const next = () => {
    if (step === 0) { setStep(1); return; }
    if (step === 1) { handleConfigure(); return; }
    if (step === 2) { setStep(3); return; }
    handleEnable();
  };

  const nextLabel = ["Siguiente", "Guardar y seguir", "Ir a habilitar", "Habilitar"][step];
  const nextDisabled =
    (step === 0 && !providerKey) ||
    (step === 2 && !health?.ok) ||
    (step === 3 && !health?.ok);

  return (
    <Modal
      open onClose={onClose} maxWidth="sm"
      title={`Conectar «${port.label}»`}
      subtitle="Primero se configura, después se prueba, y recién ahí se habilita. Hasta el último paso, el puerto sigue corriendo local."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Atrás</Button>}
          <Tooltip title={step >= 2 && !health?.ok ? "Hace falta una prueba exitosa antes de habilitar." : ""}>
            <span>
              <Button variant="primary" disabled={nextDisabled} onClick={next}>{nextLabel}</Button>
            </span>
          </Tooltip>
        </>
      }
    >
      <Box className="in-wizard">
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
        </Stepper>

        {/* ---------------------------------------------- 1. proveedor */}
        {step === 0 && (
          <Box className="in-form">
            {providers.length === 0 ? (
              <p className="in-field__hint">
                No hay ningún proveedor definido para este puerto. Escribir uno es agregar un archivo
                en <code>providers/</code> con su contrato.
              </p>
            ) : (
              <>
                <TextField
                  select size="small" fullWidth label="Proveedor" value={providerKey}
                  onChange={(e) => { setProviderKey(e.target.value); setValues({}); setHealth(null); setDry(null); }}
                >
                  {providers.map((p) => (
                    <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>
                  ))}
                </TextField>

                {provider?.demo && (
                  <Box className="in-callout in-callout--danger">
                    <span>
                      <strong>Esto es un doble de prueba, no una integración.</strong> No habla con
                      ningún servicio: existe para poder recorrer el asistente, la prueba de conexión
                      y el dry-run sin traer un proveedor real.
                    </span>
                  </Box>
                )}

                <TextField
                  select size="small" fullWidth label="Modo" value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {MODES.map((m) => (
                    <MenuItem
                      key={m.value} value={m.value}
                      disabled={m.value === "produccion" && !live.ok}
                    >
                      {m.label} — {m.hint}
                    </MenuItem>
                  ))}
                </TextField>

                {!live.ok && (
                  <Box className="in-callout in-callout--warn">
                    <span><strong>Producción no está disponible.</strong> {live.reason}</span>
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {/* --------------------------------------------- 2. configurar */}
        {step === 1 && provider && (
          <ConfigForm schema={provider.config} values={values} onChange={setValues} />
        )}

        {/* ------------------------------------------------- 3. probar */}
        {step === 2 && (
          <Box className="in-form">
            <Box className="in-testrow">
              <Button variant="secondary" onClick={handleTest}>Probar conexión</Button>
              <Button variant="secondary" startIcon={<ScienceOutlinedIcon />} onClick={handleDryRun}>
                Dry-run
              </Button>
            </Box>

            {health && (
              <Box className={`in-callout ${health.ok ? "in-callout--ok" : "in-callout--danger"}`}>
                {health.ok ? <CheckCircleOutlineIcon sx={{ fontSize: 17 }} /> : <ErrorOutlineIcon sx={{ fontSize: 17 }} />}
                <span>
                  <strong>{health.ok ? "Responde" : "No responde"}</strong> — {health.message}
                  {health.latencyMs != null && <> · {health.latencyMs} ms</>}
                </span>
              </Box>
            )}

            {dry && (
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
            )}

            {!health && !dry && (
              <p className="in-field__hint">
                Probá la conexión antes de seguir. Sin una prueba exitosa el asistente no deja
                habilitar: poner a correr sobre datos reales algo que no sabemos si responde es la
                forma más rápida de romper una operación.
              </p>
            )}
          </Box>
        )}

        {/* ---------------------------------------------- 4. habilitar */}
        {step === 3 && (
          <Box className="in-form">
            <Box className="in-callout in-callout--warn">
              <span>
                Al habilitar, <strong>«{port.label}» deja de resolverse localmente</strong> y pasa a
                atenderlo el proveedor. Podés volver atrás en cualquier momento: deshabilitar devuelve
                el puerto a la implementación de siempre y no rompe nada.
              </span>
            </Box>

            <Box className="in-kv">
              <span>Puerto</span><div>{port.label} <code className="in-code">{portKey}</code></div>
              <span>Proveedor</span><div>{provider?.label}</div>
              <span>Modo</span><div>{MODES.find((m) => m.value === mode)?.label}</div>
              <span>Prueba</span>
              <div>
                {health?.ok
                  ? <StatusBadge tone="success" label="Superada" showDot={false} />
                  : <StatusBadge tone="danger" label="Pendiente" showDot={false} />}
              </div>
            </Box>
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default ConnectionWizard;
