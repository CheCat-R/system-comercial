/**
 * ⭐ El inyector de payloads (§5, regla 4).
 *
 * **Sin backend no hay endpoint público**, así que lo entrante se simula pegando
 * el payload acá. Lo que no se simula es nada de lo que viene después: la firma
 * se verifica de verdad, el duplicado se detecta de verdad, la traducción es la
 * que declara el adaptador y el efecto lo hace el módulo dueño por su `api/`.
 *
 * El payload es editable a propósito: cambiar un id y ver que el módulo dueño lo
 * rechaza enseña más que cualquier texto explicativo.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tooltip from "@mui/material/Tooltip";

import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";

import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";

const WebhookInjector = ({ ports, samples, canInject, onInject }) => {
  const [portKey, setPortKey] = useState(ports[0]?.portKey || "");
  const [sampleKey, setSampleKey] = useState(samples[0]?.key || "");
  const [badSignature, setBadSignature] = useState(false);
  const [error, setError] = useState(null);

  const sample = samples.find((s) => s.key === sampleKey) || samples[0];

  // El texto editado se guarda junto al ejemplo del que salió: así cambiar de
  // ejemplo lo repuebla sin un efecto que persiga al estado, y lo que el usuario
  // escribió no se pierde al volver.
  const [edited, setEdited] = useState(null);
  const body = edited?.key === sampleKey ? edited.text : JSON.stringify(sample?.raw ?? {}, null, 2);
  const setBody = (text) => { setEdited({ key: sampleKey, text }); setError(null); };

  const handleInject = () => {
    let raw;
    try {
      raw = JSON.parse(body);
    } catch (err) {
      setError(`Eso no es JSON válido: ${err.message}`);
      return;
    }
    setError(null);
    onInject(portKey, { raw, badSignature });
  };

  return (
    <Card className="entity-card">
      <Box className="card-title-row">
        <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Inyector de payloads</Typography>
        <Typography variant="caption" className="text-tertiary">
          Sin backend no hay endpoint público: lo entrante se simula
        </Typography>
      </Box>

      {ports.length === 0 ? (
        <Typography variant="body2" className="text-tertiary">
          Ningún puerto tiene un proveedor que declare entrada. Un adaptador que recibe declara tres
          cosas: cómo verificar la firma, cuál es el id del evento y <strong>a qué evento del catálogo
          traduce</strong>.
        </Typography>
      ) : (
        <>
          <Box className="in-testrow">
            <TextField
              select size="small" label="Puerto" value={portKey}
              onChange={(e) => setPortKey(e.target.value)} sx={{ minWidth: 260 }}
            >
              {ports.map((p) => (
                <MenuItem key={p.portKey} value={p.portKey}>{p.label} — {p.provider}</MenuItem>
              ))}
            </TextField>

            <TextField
              select size="small" label="Ejemplo" value={sampleKey}
              onChange={(e) => setSampleKey(e.target.value)} sx={{ minWidth: 300 }}
            >
              {samples.map((s) => (
                <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>
              ))}
            </TextField>

            <FormControlLabel
              control={(
                <Switch
                  size="small" checked={badSignature}
                  onChange={(e) => setBadSignature(e.target.checked)}
                />
              )}
              label="Firma inválida"
            />

            <Box sx={{ flex: 1 }} />

            <Tooltip title={canInject ? "" : "Inyectar está reservado a Admin (§10)."}>
              <span>
                <Button
                  variant="primary" startIcon={<BoltOutlinedIcon />}
                  disabled={!canInject || !portKey} onClick={handleInject}
                >
                  Inyectar
                </Button>
              </span>
            </Tooltip>
          </Box>

          {sample && (
            <Box className="in-callout">
              <span>
                {sample.translatesTo
                  ? <><StatusBadge tone="success" label={`traduce a ${sample.translatesTo}`} showDot={false} /> {sample.hint}</>
                  : <><StatusBadge tone="warning" label="no se traduce" showDot={false} /> {sample.hint}</>}
              </span>
            </Box>
          )}

          <TextField
            multiline minRows={8} fullWidth size="small" label="Payload del webhook"
            value={body} onChange={(e) => setBody(e.target.value)}
            slotProps={{ input: { className: "in-json" } }}
          />

          {error && (
            <Box className="in-callout in-callout--danger"><span>{error}</span></Box>
          )}

          <p className="in-field__hint">
            Inyectá <strong>el mismo payload dos veces</strong> para ver la deduplicación: los
            proveedores reenvían, y procesar dos veces no es lo mismo que recibir dos veces.
          </p>
        </>
      )}
    </Card>
  );
};

export default WebhookInjector;
