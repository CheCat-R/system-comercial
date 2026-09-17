import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import ConfirmationNumberOutlinedIcon from "@mui/icons-material/ConfirmationNumberOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import FunnelBar from "./components/FunnelBar";
import { getMarketingSummary, getCouponsSummary } from "./api/marketingApi";
import { CAMPAIGN_STATUS, OBJECTIVES } from "./lib/marketing";
import { money, percent, formatDate } from "./lib/time";

const Resumen = () => {
  const s = getMarketingSummary();
  const coupons = getCouponsSummary();

  const kpis = [
    { title: "Campañas en curso", value: String(s.activeCampaigns), icon: <CampaignOutlinedIcon /> },
    { title: "Ingreso atribuido", value: money(s.attributedRevenue), hint: `${s.conversions} conversiones`, icon: <PaymentsOutlinedIcon /> },
    { title: "Tasa de apertura promedio", value: percent(s.avgOpenRate), icon: <MarkEmailReadOutlinedIcon /> },
    { title: "Cupones activos", value: String(coupons.activos), hint: `${coupons.redenciones} redenciones`, icon: <ConfirmationNumberOutlinedIcon /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Marketing" subtitle="Performance de campañas, ofertas y comunicación." />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Campañas por ingreso atribuido</Typography>
            {s.topCampaigns.length === 0 && <Typography variant="body2" color="text.secondary">Todavía sin campañas con envíos.</Typography>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              {s.topCampaigns.map((c) => (
                <Box key={c.id}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                    <RouterLink to={`/marketing/campanas/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</RouterLink>
                    <span className="mono">{money(c.metrics.revenue)} · {c.metrics.conversions} conv.</span>
                  </Box>
                  <FunnelBar metrics={c.metrics} />
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Próximas campañas</Typography>
            {s.upcoming.length === 0 && <Typography variant="body2" color="text.secondary">Nada programado.</Typography>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {s.upcoming.map((c) => (
                <Box key={c.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
                  <Box>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="text-tertiary">{OBJECTIVES[c.objective]} · {formatDate(c.schedule.sendAt)}</div>
                  </Box>
                  <StatusBadge {...(CAMPAIGN_STATUS[c.status] || { label: c.status, tone: "neutral" })} />
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Resumen;
