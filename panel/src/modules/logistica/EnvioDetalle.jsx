import { useState } from "react";
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import {
  getShipment, startPicking, togglePicked, completePicking, completePacking,
  dispatchShipment, addTrackingEvent, markShipmentDelivered,
  listCarriers, listMethods, findApplicableRate,
  reportStockDifference, clearStockDifference,
  getIncidentsForShipment, openIncident, resolveIncident,
} from "./api/logisticaApi";
import { SHIPMENT_STATUS, SHIPMENT_STEPS, DELIVERY_PERFORMANCE } from "./lib/logistics";
import { INCIDENT_TYPES, INCIDENT_STATUS, RESOLUTIONS } from "./lib/incidents";
import { formatDateTime, formatDate, money } from "./lib/time";
import "./EnvioDetalle.css";

const EnvioDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  const [packWeight, setPackWeight] = useState("");
  const [packCarrierId, setPackCarrierId] = useState("");
  const [packMethodId, setPackMethodId] = useState("");
  const [trackingLocation, setTrackingLocation] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const shipment = getShipment(id);

  if (!shipment) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró el envío {id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/logistica")}>Volver</Button>
      </Box>
    );
  }

  const refresh = () => setTick((t) => t + 1);
  const isTerminal = ["entregado", "devuelto", "cancelado"].includes(shipment.status);
  const stepIndex = SHIPMENT_STEPS.indexOf(shipment.status);
  const incidents = getIncidentsForShipment(shipment.id);
  const resolvingIncident = incidents.find((i) => i.id === resolvingId) || null;

  const handleStartPicking = () => {
    startPicking(shipment.id);
    refresh();
    showToast("Picking iniciado", "success");
  };

  const handleTogglePicked = (skuId) => {
    togglePicked(shipment.id, skuId);
    refresh();
  };

  const handleCompletePicking = () => {
    try {
      completePicking(shipment.id);
      refresh();
      showToast("Picking completo — pasa a packing", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const effectiveCarrierId = packCarrierId || shipment.carrierId || "";
  const effectiveMethodId = packMethodId || shipment.methodId || "";
  const previewWeight = Number(packWeight) > 0 ? Number(packWeight) : shipment.estimatedWeightKg;
  const previewRate = effectiveCarrierId && effectiveMethodId
    ? findApplicableRate({ carrierId: effectiveCarrierId, methodId: effectiveMethodId, zoneId: shipment.zoneId, weightKg: previewWeight })
    : null;

  const handleCompletePacking = () => {
    try {
      completePacking(shipment.id, { weightKg: packWeight, carrierId: packCarrierId, methodId: packMethodId });
      setPackWeight(""); setPackCarrierId(""); setPackMethodId("");
      refresh();
      showToast("Packing completo — tarifa calculada", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleDispatch = () => {
    try {
      dispatchShipment(shipment.id);
      refresh();
      showToast("Envío despachado — stock descontado", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleAddTracking = () => {
    try {
      addTrackingEvent(shipment.id, { location: trackingLocation });
      setTrackingLocation("");
      refresh();
      showToast("Evento de tracking agregado", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleMarkDelivered = () => {
    try {
      markShipmentDelivered(shipment.id);
      refresh();
      showToast("Envío entregado", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleReportStockDiff = (skuId) => {
    reportStockDifference(shipment.id, { skuId });
    refresh();
    showToast("Diferencia reportada — el picking queda bloqueado hasta resolverla", "warning");
  };

  const handleClearStockDiff = () => {
    clearStockDifference(shipment.id);
    refresh();
    showToast("Diferencia marcada como resuelta", "success");
  };

  const handleOpenIncident = () => {
    if (!incidentType) return showToast("Elegí el tipo de incidencia", "warning");
    openIncident(shipment.id, { type: incidentType, description: incidentDescription });
    setReportOpen(false);
    setIncidentType("");
    setIncidentDescription("");
    refresh();
    showToast("Incidencia registrada", "success");
  };

  const handleResolve = (resolution) => {
    resolveIncident(resolvingId, { resolution, note: resolutionNote });
    setResolvingId(null);
    setResolutionNote("");
    refresh();
    showToast(
      resolution === "devolver" ? "Devolución registrada — stock repuesto y reembolso iniciado" : "Incidencia resuelta",
      "success"
    );
  };

  const renderHeaderAction = () => {
    switch (shipment.status) {
      case "pendiente_preparacion": return <Button variant="primary" onClick={handleStartPicking}>Iniciar picking</Button>;
      case "en_picking": return <Button variant="primary" onClick={handleCompletePicking} disabled={shipment.blockedByStockDiff}>Picking completo</Button>;
      case "listo_despacho": return <Button variant="primary" onClick={handleDispatch}>Despachar</Button>;
      default: return null;
    }
  };

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={`Envío ${shipment.id}`}
        subtitle={(
          <>
            <RouterLink to={`/pedidos/${shipment.orderId}`} className="mono">Pedido #{shipment.orderId}</RouterLink>
            {" · "}{shipment.customerName} · {shipment.warehouseName}
          </>
        )}
        badges={isTerminal ? <StatusBadge {...SHIPMENT_STATUS[shipment.status]} /> : null}
        below={!isTerminal && (
          <Box className="log-pipeline">
            {SHIPMENT_STEPS.map((step, i) => (
              <span key={step} className={`log-pipeline__step ${i < stepIndex ? "log-pipeline__step--done" : i === stepIndex ? "log-pipeline__step--current" : ""}`}>
                {SHIPMENT_STATUS[step].label}
              </span>
            ))}
          </Box>
        )}
        onBack={() => navigate("/logistica")}
        backLabel="Volver a envíos"
        actions={renderHeaderAction()}
      />

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">
          {shipment.status === "en_picking" ? "Picking — recolectar del depósito" : "Productos del pedido"}
        </Typography>

        {shipment.status === "en_picking" ? (
          <>
            {shipment.blockedByStockDiff && (
              <Box className="log-rate-missing" sx={{ mb: 2 }}>
                <WarningAmberOutlinedIcon />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{shipment.stockDiffNote}</Typography>
                  <Typography variant="body2">
                    Corregí el stock en <RouterLink to={`/inventario/ajustes?warehouseId=${shipment.warehouseId}`}>Ajustes de Inventario</RouterLink> y después marcá la diferencia como resuelta.
                  </Typography>
                  <Button variant="ghost" size="small" sx={{ mt: 1 }} onClick={handleClearStockDiff}>Marcar diferencia resuelta</Button>
                </Box>
              </Box>
            )}
            <Box className="log-checklist">
              {shipment.items.map((it) => {
                const done = shipment.pickedItems.includes(it.skuId);
                return (
                  <Box key={it.skuId} className={`log-checklist-item ${done ? "log-checklist-item--done" : ""}`} onClick={() => handleTogglePicked(it.skuId)}>
                    {done ? <CheckBoxIcon sx={{ color: "var(--success-text)" }} /> : <CheckBoxOutlineBlankIcon sx={{ color: "var(--text-tertiary)" }} />}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{it.name}</Typography>
                      <Typography variant="caption" className="mono text-tertiary">{it.sku} · cantidad {it.qty}</Typography>
                    </Box>
                    {!shipment.blockedByStockDiff && (
                      <Button
                        variant="ghost" size="small"
                        onClick={(e) => { e.stopPropagation(); handleReportStockDiff(it.skuId); }}
                      >
                        ¿Falta stock?
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Box>
          </>
        ) : (
          <Box className="log-checklist">
            {shipment.items.map((it) => (
              <Box key={it.skuId} className="log-checklist-item" sx={{ cursor: "default" }}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{it.name}</Typography>
                  <Typography variant="caption" className="mono text-tertiary">{it.sku} · cantidad {it.qty}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Card>

      {shipment.status === "en_packing" && (
        <Card className="entity-card mt-3">
          <Typography variant="h6" className="card-title">Packing — peso y tarifa</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2.5 }}>
            <TextField
              size="small" type="number" label="Peso real (kg)"
              placeholder={String(shipment.estimatedWeightKg)}
              value={packWeight} onChange={(e) => setPackWeight(e.target.value)}
            />
            <Select size="small" displayEmpty value={effectiveCarrierId} onChange={(e) => { setPackCarrierId(e.target.value); setPackMethodId(""); }} sx={{ minWidth: 200 }}>
              <MenuItem value="" disabled>Transportista…</MenuItem>
              {listCarriers().map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
            <Select size="small" displayEmpty value={effectiveMethodId} onChange={(e) => setPackMethodId(e.target.value)} disabled={!effectiveCarrierId} sx={{ minWidth: 220 }}>
              <MenuItem value="" disabled>Método…</MenuItem>
              {listMethods(effectiveCarrierId).map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
            </Select>
          </Box>

          {effectiveCarrierId && effectiveMethodId && (
            previewRate ? (
              <Box className="log-rate-preview" sx={{ mb: 2.5 }}>
                <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Zona</span><span className="log-rate-preview__value">{shipment.zoneName}</span></Box>
                <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Peso</span><span className="log-rate-preview__value">{previewWeight} kg</span></Box>
                <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Costo</span><span className="log-rate-preview__value">{money(previewRate.cost)}</span></Box>
              </Box>
            ) : (
              <Box className="log-rate-missing" sx={{ mb: 2.5 }}>
                <WarningAmberOutlinedIcon />
                <Typography variant="body2">
                  No hay tarifa configurada para {shipment.zoneName} con este transportista y método — cargala en Tarifas antes de continuar.
                </Typography>
              </Box>
            )
          )}

          <Button variant="primary" onClick={handleCompletePacking} disabled={!effectiveCarrierId || !effectiveMethodId || !previewRate}>
            Packing completo
          </Button>
        </Card>
      )}

      {shipment.status === "listo_despacho" && (
        <Card className="entity-card mt-3">
          <Typography variant="h6" className="card-title">Listo para despachar</Typography>
          <Box className="log-rate-preview">
            <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Transportista</span><span className="log-rate-preview__value">{shipment.carrierName}</span></Box>
            <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Método</span><span className="log-rate-preview__value">{shipment.methodName}</span></Box>
            <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Peso</span><span className="log-rate-preview__value">{shipment.weightKg} kg</span></Box>
            <Box className="log-rate-preview__item"><span className="log-rate-preview__label">Costo</span><span className="log-rate-preview__value">{money(shipment.cost)}</span></Box>
          </Box>
        </Card>
      )}

      {["despachado", "en_transito", "en_reparto", "entregado", "devuelto"].includes(shipment.status) && (
        <Card className="entity-card mt-3">
          <Typography variant="h6" className="card-title">Tracking</Typography>

          {(shipment.trackingCode || (shipment.estimatedDeliveryAt && shipment.status !== "devuelto")) && (
            <Box className="log-tracking-meta">
              {shipment.trackingCode && (
                <span className="log-tracking-meta__item">Código: <span className="mono">{shipment.trackingCode}</span></span>
              )}
              {shipment.estimatedDeliveryAt && shipment.status !== "devuelto" && (
                <span className="log-tracking-meta__item">
                  Entrega estimada: <strong>{formatDate(shipment.estimatedDeliveryAt)}</strong>
                  {shipment.deliveryPerformance && <StatusBadge {...DELIVERY_PERFORMANCE[shipment.deliveryPerformance]} />}
                </span>
              )}
            </Box>
          )}

          <Box className="order-timeline">
            {[...shipment.trackingEvents].reverse().map((ev, i) => (
              <Box key={i} className={`timeline-item ${i === shipment.trackingEvents.length - 1 ? "timeline-item--last" : ""}`}>
                <span className={`timeline-dot timeline-dot--${ev.status === "entregado" ? "success" : ev.status === "devuelto" ? "danger" : "accent"}`}>
                  {ev.status === "entregado" ? <CheckCircleIcon sx={{ fontSize: 15 }} /> : ev.status === "devuelto" ? <UndoOutlinedIcon sx={{ fontSize: 15 }} /> : <LocalShippingIcon sx={{ fontSize: 15 }} />}
                </span>
                <Box className="timeline-content">
                  <Typography variant="body2" fontWeight={600}>{SHIPMENT_STATUS[ev.status]?.label || ev.status}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatDateTime(ev.at)} · {ev.location}</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {["despachado", "en_transito"].includes(shipment.status) && (
            <Box sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}>
              <TextField
                size="small" placeholder="Ubicación (opcional)" value={trackingLocation}
                onChange={(e) => setTrackingLocation(e.target.value)}
                slotProps={{ input: { startAdornment: <PlaceOutlinedIcon fontSize="small" sx={{ mr: 1, color: "var(--text-tertiary)" }} /> } }}
                sx={{ flex: 1, minWidth: 220 }}
              />
              <Button variant="secondary" onClick={handleAddTracking}>Agregar evento de tracking</Button>
            </Box>
          )}

          {shipment.status === "en_reparto" && (
            <Box sx={{ display: "flex", gap: 1.5, mt: 2 }}>
              <Button variant="primary" onClick={handleMarkDelivered}>Marcar entregado</Button>
            </Box>
          )}

          {["despachado", "en_transito", "en_reparto"].includes(shipment.status) && (
            <Box sx={{ mt: 2 }}>
              <Button variant="ghost" size="small" startIcon={<ReportProblemOutlinedIcon />} onClick={() => setReportOpen(true)}>
                Reportar incidencia
              </Button>
            </Box>
          )}
        </Card>
      )}

      {incidents.length > 0 && (
        <Card className="entity-card mt-3">
          <Typography variant="h6" className="card-title">Incidencias</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {incidents.map((inc) => (
              <Box key={inc.id} className="log-incident-card">
                <Box className="log-incident-card__header">
                  <Typography variant="body2" fontWeight={600}>{INCIDENT_TYPES[inc.type] || inc.type}</Typography>
                  <StatusBadge {...INCIDENT_STATUS[inc.status]} />
                </Box>
                {inc.description && <Typography variant="body2" color="text.secondary">{inc.description}</Typography>}
                <Typography variant="caption" color="text.secondary">
                  Abierta {formatDateTime(inc.openedAt)}{inc.resolvedAt && ` · Resuelta ${formatDateTime(inc.resolvedAt)}`}
                </Typography>
                {inc.status !== "resuelta" ? (
                  <Button variant="ghost" size="small" sx={{ alignSelf: "flex-start", mt: 1 }} onClick={() => setResolvingId(inc.id)}>
                    Resolver
                  </Button>
                ) : (
                  <Typography variant="caption" className="text-success">
                    Resuelta como "{RESOLUTIONS[inc.resolution]?.label}"{inc.note && ` — ${inc.note}`}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Card>
      )}

      <Card className="entity-card mt-3">
        <Typography variant="h6" className="card-title">Cliente y destino</Typography>
        <Typography variant="body2" fontWeight={600}>{shipment.customerName}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{shipment.address}</Typography>
        {(shipment.carrierName || shipment.zoneName) && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Resumen de envío</Typography>
            <Typography variant="body2" color="text.secondary">
              {shipment.zoneName && <>Zona: <strong>{shipment.zoneName}</strong><br /></>}
              {shipment.carrierName && <>Transportista: <strong>{shipment.carrierName} — {shipment.methodName}</strong><br /></>}
              {shipment.weightKg && <>Peso: <strong>{shipment.weightKg} kg</strong><br /></>}
              {shipment.cost != null && <>Costo: <strong>{money(shipment.cost)}</strong></>}
            </Typography>
          </>
        )}
      </Card>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Reportar incidencia"
        subtitle="Queda vinculada a este envío hasta que se resuelva."
        actions={<><Button variant="ghost" onClick={() => setReportOpen(false)}>Cancelar</Button><Button variant="primary" onClick={handleOpenIncident}>Reportar</Button></>}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Select size="small" fullWidth displayEmpty value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
            <MenuItem value="" disabled>Tipo de incidencia…</MenuItem>
            {Object.entries(INCIDENT_TYPES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
          </Select>
          <TextField
            label="Descripción (opcional)" size="small" fullWidth multiline minRows={2}
            value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)}
          />
        </Box>
      </Modal>

      <Modal
        open={Boolean(resolvingIncident)}
        onClose={() => setResolvingId(null)}
        title="Resolver incidencia"
        subtitle={resolvingIncident ? INCIDENT_TYPES[resolvingIncident.type] : ""}
        actions={
          <>
            <Button variant="ghost" onClick={() => setResolvingId(null)}>Cancelar</Button>
            <Button variant="secondary" onClick={() => handleResolve("reintentar")}>Reintentar</Button>
            <Button variant="secondary" onClick={() => handleResolve("contactar_cliente")}>Contactar cliente</Button>
            <Button variant="danger" onClick={() => handleResolve("devolver")}>Devolver</Button>
          </>
        }
      >
        {resolvingIncident && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {resolvingIncident.description && <Typography variant="body2" color="text.secondary">{resolvingIncident.description}</Typography>}
            <Box className="log-rate-missing">
              <WarningAmberOutlinedIcon />
              <Typography variant="body2">{RESOLUTIONS.devolver.hint}</Typography>
            </Box>
            <TextField
              label="Nota (opcional)" size="small" fullWidth multiline minRows={2}
              value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)}
            />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default EnvioDetalle;
