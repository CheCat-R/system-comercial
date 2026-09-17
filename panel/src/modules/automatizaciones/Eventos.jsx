/**
 * Bandeja de eventos (§9.5).
 *
 * El bus en vivo. Es la herramienta de diagnóstico del módulo y, de paso, la
 * mejor documentación de **qué emite cada módulo y desde qué función exacta**:
 * el catálogo con su contrato está abajo, y arriba lo que realmente pasó.
 *
 * Incluye el **emisor manual**, para probar una regla sin tener que provocar la
 * operación real.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import SendOutlinedIcon from "@mui/icons-material/SendOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import {
  start, getEventLog, listEvents, EVENT_MODULES, emitManual, subjectLabel,
  formatStamp, relativeTo, getBrokenEventContracts,
} from "./api/automationsApi";
import "./Automatizaciones.css";

const ORIGIN_META = {
  bus: { label: "módulo", tone: "info", hint: "Lo emitió un api/ al cambiar algo." },
  escaner: { label: "escáner", tone: "warning", hint: "Lo detectó el escáner: es una condición observada, no un cambio anunciado." },
  accion: { label: "acción", tone: "danger", hint: "Lo provocó una acción de otra automatización. Hereda profundidad +1." },
  manual: { label: "manual", tone: "neutral", hint: "Emitido a mano desde esta pantalla." },
  simulacion: { label: "simulación", tone: "neutral", hint: "Sólo simulado." },
};

const Eventos = () => {
  const { showToast } = useToast();
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const [moduleFilter, setModuleFilter] = useState("");
  const [form, setForm] = useState({ key: "pedido.pagado", subjectId: "" });

  useEffect(() => { start(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const log = useMemo(() => getEventLog({ limit: 60 }), [version]);
  const catalog = useMemo(() => listEvents({ module: moduleFilter || undefined }), [moduleFilter]);
  const broken = useMemo(() => getBrokenEventContracts(), []);

  const handleEmit = () => {
    const result = emitManual(form.key, form.subjectId.trim());
    if (!result.ok) { showToast(result.error, "error"); return; }
    refresh();
    showToast("Evento emitido — mirá el historial para ver qué reglas despertó", "success");
  };

  const selected = catalog.find((e) => e.key === form.key) || listEvents().find((e) => e.key === form.key);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Bandeja de eventos"
        subtitle="El bus en vivo. Cada evento declara de qué módulo sale y desde qué función exacta se emite."
        actions={<Button variant="secondary" onClick={refresh}>Actualizar</Button>}
      />

      {broken.length > 0 && (
        <Card className="entity-card au-broken">
          <strong>{broken.length} evento(s) sin contrato completo</strong>
          <span>No se pueden elegir en el builder. {broken.join(" · ")}</span>
        </Card>
      )}

      {/* ------------------------------------------------ emisor manual */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Emitir un evento a mano</Typography>
          <Typography variant="caption" className="text-tertiary">
            Para probar una regla sin provocar la operación real
          </Typography>
        </Box>

        <Box className="au-emitter">
          <TextField
            select size="small" label="Evento" value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            sx={{ minWidth: 300 }}
          >
            {listEvents().filter((e) => e.kind === "event").map((e) => (
              <MenuItem key={e.key} value={e.key}>{e.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            label={selected ? `Id de ${subjectLabel(selected.subjectType).toLowerCase()}` : "Id del sujeto"}
            value={form.subjectId}
            placeholder={selected?.sample?.orderId || selected?.sample?.accountId || selected?.sample?.shipmentId || ""}
            onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
            sx={{ minWidth: 220 }}
          />

          <Button variant="primary" startIcon={<SendOutlinedIcon />} onClick={handleEmit}>Emitir</Button>
        </Box>

        {selected && (
          <Box className="au-emitter__hint">
            <span className="au-chip au-chip--source">{selected.emittedAt}</span>
            <span className="au-chip">sujeto: {subjectLabel(selected.subjectType)}</span>
            {selected.note && <p className="au-detail__note">{selected.note}</p>}
          </Box>
        )}
      </Card>

      {/* ---------------------------------------------------- el log */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Últimos eventos</Typography>
          <Typography variant="caption" className="text-tertiary">{log.length} en la traza</Typography>
        </Box>

        {log.length === 0 ? (
          <Typography variant="body2" className="text-tertiary">
            Todavía no pasó nada por el bus en esta sesión. Confirmá el pago de un pedido, despachá
            un envío o corré un ciclo desde la lista de automatizaciones.
          </Typography>
        ) : (
          <Box className="au-log">
            {log.map((e) => {
              const meta = ORIGIN_META[e.origin] || ORIGIN_META.bus;
              return (
                <div className="au-log__row" key={e.id}>
                  <span className="au-log__when">{formatStamp(e.at)}<em>{relativeTo(e.at)}</em></span>
                  <span className="au-log__key">{e.key}</span>
                  <span className="au-log__subject">{e.subject ? `${e.subject.type} · ${e.subject.id}` : "—"}</span>
                  <Tooltip title={meta.hint}>
                    <span><StatusBadge tone={meta.tone} label={meta.label} showDot={false} /></span>
                  </Tooltip>
                  <span className="au-log__depth">
                    {e.depth > 0 && (
                      <Tooltip title="Este evento lo provocó una acción de otra automatización.">
                        <span className="au-chip au-chip--warn">prof. {e.depth}</span>
                      </Tooltip>
                    )}
                  </span>
                  <span className="au-log__rules">
                    {e.matchedRules.length
                      ? `despertó ${e.matchedRules.length} regla(s)`
                      : <em className="text-tertiary">ninguna regla escucha</em>}
                  </span>
                </div>
              );
            })}
          </Box>
        )}
      </Card>

      {/* ------------------------------------------------- el catálogo */}
      <Card className="entity-card">
        <Box className="card-title-row">
          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Catálogo de eventos</Typography>
          <TextField
            select size="small" label="Módulo" value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)} sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {EVENT_MODULES.map((m) => <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>)}
          </TextField>
        </Box>

        <Box className="au-catalog">
          {catalog.map((e) => (
            <div className="au-catalog__row" key={e.key}>
              <span className="au-catalog__label">
                <strong>{e.label}</strong>
                <em>{e.key}</em>
              </span>
              <StatusBadge
                tone={e.kind === "state" ? "warning" : "info"}
                label={e.kind === "state" ? "observado" : "emitido"}
                showDot={false}
              />
              <span className="au-chip">{subjectLabel(e.subjectType)}</span>
              <Tooltip title="El punto exacto del código donde se emite. Un evento sin esto no existe (§2.2).">
                <span className="au-chip au-chip--source">{e.emittedAt}</span>
              </Tooltip>
            </div>
          ))}
        </Box>
      </Card>
    </Box>
  );
};

export default Eventos;
