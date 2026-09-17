import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarsOutlinedIcon from "@mui/icons-material/StarsOutlined";
import RedeemOutlinedIcon from "@mui/icons-material/RedeemOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import PointsLedgerTable from "./components/PointsLedgerTable";
import RewardModal from "./components/RewardModal";
import {
  getLoyaltyProgram, updateLoyaltyProgram, getLoyaltySummary,
  listRewards, updateReward, deleteReward, getPointsLedger,
} from "./api/marketingApi";
import { TIER_LABELS, REWARD_STATUS } from "./lib/loyalty";
import { describeDiscount } from "./lib/discounts";
import { money } from "./lib/time";

const BENEFIT_TIERS = ["vip", "frecuente"];

const ProgramaTab = () => {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => {
    const p = getLoyaltyProgram();
    return {
      per100: Math.round(p.earnRate * 100 * 100) / 100,
      pointValue: p.pointValue,
      minRedeem: p.minRedeem,
      expiryMonths: p.expiryMonths,
      tierMultipliers: { ...p.tierMultipliers },
      tierBenefits: JSON.parse(JSON.stringify(p.tierBenefits || {})),
    };
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setMult = (tier, v) => setForm((f) => ({ ...f, tierMultipliers: { ...f.tierMultipliers, [tier]: Number(v) } }));
  const setBenefit = (tier, patch) => setForm((f) => ({
    ...f, tierBenefits: { ...f.tierBenefits, [tier]: { ...(f.tierBenefits[tier] || {}), ...patch } },
  }));

  const handleSave = () => {
    updateLoyaltyProgram({
      earnRate: form.per100 / 100,
      pointValue: Number(form.pointValue),
      minRedeem: Number(form.minRedeem),
      expiryMonths: Number(form.expiryMonths),
      tierMultipliers: form.tierMultipliers,
      tierBenefits: form.tierBenefits,
    });
    showToast("Programa de puntos actualizado", "success");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Acumulación y canje</Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField size="small" type="number" label="Puntos por cada $100" value={form.per100} onChange={(e) => set({ per100: Number(e.target.value) })} sx={{ maxWidth: 180 }} />
          <TextField size="small" type="number" label="Valor de canje ($ / punto)" value={form.pointValue} onChange={(e) => set({ pointValue: e.target.value })} sx={{ maxWidth: 200 }} />
          <TextField size="small" type="number" label="Mínimo de canje (puntos)" value={form.minRedeem} onChange={(e) => set({ minRedeem: e.target.value })} sx={{ maxWidth: 200 }} />
          <TextField size="small" type="number" label="Vencimiento (meses)" value={form.expiryMonths} onChange={(e) => set({ expiryMonths: e.target.value })} sx={{ maxWidth: 170 }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
          Un pedido de {money(100000)} acumula {Math.round(100000 * (form.per100 / 100))} puntos ·
          canjearlos vale {money(Math.round(100000 * (form.per100 / 100) * Number(form.pointValue || 0)))}.
        </Typography>
      </Card>

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Multiplicador por tier</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
          El <strong>tier</strong> lo calcula el CRM (RFM). Un VIP acumula ×2 sobre la tasa base.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {Object.keys(TIER_LABELS).map((tier) => (
            <TextField
              key={tier} size="small" type="number" label={TIER_LABELS[tier]}
              value={form.tierMultipliers[tier] ?? 1} onChange={(e) => setMult(tier, e.target.value)}
              sx={{ maxWidth: 120 }}
            />
          ))}
        </Box>
      </Card>

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Beneficios por tier</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
          Capa declarativa sobre el tier — el motor de descuentos la aplica al cotizar el carrito.
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {BENEFIT_TIERS.map((tier) => (
            <Box key={tier} sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <StatusBadge label={TIER_LABELS[tier]} tone={tier === "vip" ? "warning" : "success"} />
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(form.tierBenefits[tier]?.freeShipping)} onChange={(e) => setBenefit(tier, { freeShipping: e.target.checked })} />}
                label="Envío gratis"
              />
              <TextField
                size="small" type="number" label="% extra"
                value={form.tierBenefits[tier]?.extraPercent ?? 0}
                onChange={(e) => setBenefit(tier, { extraPercent: Number(e.target.value) })}
                sx={{ maxWidth: 110 }}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(form.tierBenefits[tier]?.earlyAccess)} onChange={(e) => setBenefit(tier, { earlyAccess: e.target.checked })} />}
                label="Early access"
              />
            </Box>
          ))}
        </Box>
      </Card>

      <Box><Permitido permiso="marketing.fidelizacion">
  <Button variant="primary" onClick={handleSave}>Guardar programa</Button>
</Permitido></Box>
    </Box>
  );
};

const RecompensasTab = () => {
  const { showToast } = useToast();
  const [modal, setModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const program = getLoyaltyProgram();
  const rows = listRewards().map((r) => ({ ...r, id: r.id }));

  const columns = [
    { field: "name", headerName: "Recompensa", renderCell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { field: "pointsCost", headerName: "Costo", align: "right", renderCell: (r) => <span className="mono">{r.pointsCost.toLocaleString("es-AR")} pts</span> },
    { field: "discount", headerName: "Descuento", renderCell: (r) => <span className="text-tertiary">{describeDiscount(r.discount, money)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...(REWARD_STATUS[r.status] || { label: r.status, tone: "neutral" })} /> },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (r) => <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(r); }} aria-label="acciones"><MoreVertIcon fontSize="small" /></IconButton>,
    },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
        <Button variant="primary" size="small" startIcon={<AddIcon />} onClick={() => setModal({})}>Nueva recompensa</Button>
      </Box>
      <DataTable columns={columns} data={rows} onRowClick={(r) => setModal({ reward: r })} emptyMessage="Sin recompensas en el catálogo." />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ reward: activeRow }); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem onClick={() => { updateReward(activeRow.id, { status: activeRow.status === "activa" ? "inactiva" : "activa" }); setAnchor(null); refresh(); showToast("Estado actualizado", "success"); }}>
          {activeRow?.status === "activa" ? "Desactivar" : "Activar"}
        </MenuItem>
        <MenuItem onClick={() => { deleteReward(activeRow.id); setAnchor(null); refresh(); showToast("Recompensa eliminada", "info"); }}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <RewardModal
          reward={modal.reward} program={program}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}
    </Box>
  );
};

const Fidelizacion = () => {
  const [tab, setTab] = useState(0);
  const s = getLoyaltySummary();

  const kpis = [
    { title: "Puntos en circulación", value: s.inCirculation.toLocaleString("es-AR"), icon: <StarsOutlinedIcon /> },
    { title: "Puntos canjeados (30 días)", value: s.redeemedPeriod.toLocaleString("es-AR"), icon: <RedeemOutlinedIcon /> },
    { title: "Clientes con puntos", value: String(s.customersWithPoints), icon: <GroupOutlinedIcon /> },
    { title: "Puntos por vencer (30 días)", value: s.expiringSoon.toLocaleString("es-AR"), icon: <HourglassBottomOutlinedIcon /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Fidelización" subtitle="Programa de puntos, catálogo de canje y bitácora de movimientos." />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Programa" />
          <Tab label="Recompensas" />
          <Tab label="Movimientos" />
        </Tabs>
      </Box>

      {tab === 0 && <ProgramaTab />}
      {tab === 1 && <RecompensasTab />}
      {tab === 2 && <PointsLedgerTable rows={getPointsLedger()} />}
    </Box>
  );
};

export default Fidelizacion;
