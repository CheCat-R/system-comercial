import { useState } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import DataTable from "../../components/DataTable/DataTable";
import { useToast } from "../../components/Toast/ToastContext";
import FunnelBar from "./components/FunnelBar";
import {
  getCampaign, getCampaignSends, getCampaignConversions,
  pauseCampaign, resumeCampaign, launchCampaign, simulateTrigger,
} from "./api/marketingApi";
import { CAMPAIGN_STATUS, OBJECTIVES, CHANNELS, SEND_STATUS, TRIGGERS } from "./lib/marketing";
import { money, percent, formatDateTime } from "./lib/time";

const CampanaDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const c = getCampaign(id);
  if (!c) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró la campaña {id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/marketing/campanas")}>Volver</Button>
      </Box>
    );
  }

  const m = c.metrics;
  const conversions = getCampaignConversions(c.id);
  const sends = getCampaignSends(c.id);
  const isTriggered = c.schedule?.type === "triggered";

  const act = (fn, msg) => { try { fn(c.id); refresh(); showToast(msg, "success"); } catch (e) { showToast(e.message, "warning"); } };

  const sendColumns = [
    { field: "customerName", headerName: "Cliente" },
    { field: "couponCode", headerName: "Cupón", renderCell: (r) => r.couponCode ? <span className="mono">{r.couponCode}</span> : <span className="text-tertiary">—</span> },
    { field: "sentAt", headerName: "Enviado", renderCell: (r) => <span className="text-tertiary nowrap">{formatDateTime(r.sentAt)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...SEND_STATUS[r.status]} /> },
  ];

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={c.name}
        subtitle={(
          <>
            {OBJECTIVES[c.objective]} · {CHANNELS[c.channel]?.label} · Audiencia:{" "}
            <RouterLink to="/marketing/audiencias" className="mono">{c.audience?.name || "—"}</RouterLink>
            {isTriggered && ` · Trigger: ${TRIGGERS[c.schedule.trigger] || c.schedule.trigger}`}
          </>
        )}
        badges={<StatusBadge {...CAMPAIGN_STATUS[c.status]} />}
        onBack={() => navigate("/marketing/campanas")}
        backLabel="Volver a campañas"
        actions={(
          <>
          {["borrador", "programada"].includes(c.status) && <Button variant="primary" onClick={() => act(launchCampaign, "Campaña lanzada")}>Lanzar</Button>}
          {c.status === "en_curso" && !isTriggered && <Button variant="secondary" startIcon={<PauseOutlinedIcon />} onClick={() => act(pauseCampaign, "Campaña pausada")}>Pausar</Button>}
          {c.status === "pausada" && <Button variant="secondary" startIcon={<PlayArrowOutlinedIcon />} onClick={() => act(resumeCampaign, "Campaña reanudada")}>Reanudar</Button>}
            {isTriggered && c.status === "en_curso" && <Button variant="secondary" startIcon={<BoltOutlinedIcon />} onClick={() => act(simulateTrigger, "Disparo simulado — se agregó un envío")}>Simular disparo</Button>}
          </>
        )}
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card className="entity-card" sx={{ height: "100%" }}>
            <Typography variant="h6" className="card-title">Embudo</Typography>
            {m.sent === 0
              ? <Typography variant="body2" color="text.secondary">La campaña todavía no se envió.</Typography>
              : <FunnelBar metrics={m} />}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Resultado</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, fontSize: "var(--text-sm)" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}><span className="text-secondary">Ingreso atribuido</span><strong className="mono">{money(m.revenue)}</strong></Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}><span className="text-secondary">Costo estimado</span><span className="mono text-tertiary">{money(-m.cost)}</span></Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", pt: 1, borderTop: "1px solid var(--border-subtle)" }}>
                <span className="text-secondary">Retorno (ingreso / costo)</span>
                <strong className="mono">{m.roas == null ? "—" : `${m.roas >= 100 ? Math.round(m.roas).toLocaleString("es-AR") : m.roas.toFixed(1)}×`}</strong>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}><span className="text-secondary">Tasa de apertura</span><span className="mono">{m.sent ? percent(m.openRate) : "—"}</span></Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}><span className="text-secondary">Tasa de click</span><span className="mono">{m.opened ? percent(m.clickRate) : "—"}</span></Box>
            </Box>
            {c.offer?.type !== "none" && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                Oferta: {c.offer.type === "coupon" ? <>cupón <span className="mono">{c.offer.couponCode}</span></> : `promoción ${c.offer.promotionId}`}
              </Typography>
            )}
          </Card>
        </Grid>
      </Grid>

      {conversions.length > 0 && (
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Pedidos atribuidos ({conversions.length})</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {conversions.map((cv) => (
              <Box key={cv.orderId} sx={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                <span><RouterLink to={`/pedidos/${cv.orderId}`} className="mono">Pedido #{cv.orderId}</RouterLink> · {cv.customerName} · vía {cv.via}</span>
                <span className="mono">{money(cv.revenue)}</span>
              </Box>
            ))}
          </Box>
        </Card>
      )}

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Destinatarios ({sends.length})</Typography>
        <DataTable columns={sendColumns} data={sends.map((s) => ({ ...s, id: s.id }))} emptyMessage="Sin envíos." />
      </Card>
    </Box>
  );
};

export default CampanaDetalle;
