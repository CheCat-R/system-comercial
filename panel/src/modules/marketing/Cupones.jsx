import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ConfirmationNumberOutlinedIcon from "@mui/icons-material/ConfirmationNumberOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import RedeemOutlinedIcon from "@mui/icons-material/RedeemOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import CuponModal from "./components/CuponModal";
import { listCoupons, getCouponsSummary, setCouponStatus, deleteCoupon } from "./api/marketingApi";
import { COUPON_STATUS, COUPON_ORIGIN, describeDiscount } from "./lib/discounts";
import { money, formatDate, formatDateTime } from "./lib/time";

const TABS = [
  { key: "", label: "Todos" },
  { key: "activo", label: "Activos" },
  { key: "pausado", label: "Pausados" },
  { key: "vencido", label: "Vencidos" },
];

const Cupones = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const puedeActivar = check("marketing.activar_promocion");

  /** Reversible: se ofrece deshacer en vez de preguntar antes. */
  const cambiarEstado = (cupon, estado) => {
    const anterior = cupon.status;
    setCouponStatus(cupon.id, estado);
    setAnchor(null);
    refresh();
    showToast(
      estado === "activo" ? "Cupón activado" : "Cupón pausado",
      estado === "activo" ? "success" : "info",
      {
        action: {
          label: "Deshacer",
          onClick: () => { setCouponStatus(cupon.id, anterior); refresh(); },
        },
      }
    );
  };
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const summary = getCouponsSummary();
  const rows = listCoupons({ status: TABS[tab].key || undefined }).map((c) => ({ ...c, id: c.id }));

  const kpis = [
    { title: "Cupones activos", value: String(summary.activos), icon: <ConfirmationNumberOutlinedIcon /> },
    { title: "Por vencer (30 días)", value: String(summary.porVencer), icon: <EventBusyOutlinedIcon /> },
    { title: "Redenciones", value: String(summary.redenciones), icon: <RedeemOutlinedIcon /> },
    { title: "Descontado por cupones", value: money(summary.montoDescontado), icon: <TrendingDownOutlinedIcon /> },
  ];

  const columns = [
    {
      field: "code", headerName: "Cupón",
      renderCell: (r) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <span className="mono" style={{ fontWeight: 600 }}>{r.code}</span>
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{describeDiscount(r.discount, money)}</span>
        </Box>
      ),
    },
    {
      field: "limits", headerName: "Límites",
      renderCell: (r) => (
        <span className="text-tertiary">
          {r.limits?.maxRedemptions ? `${r.redemptionCount}/${r.limits.maxRedemptions} usos` : `${r.redemptionCount} usos`}
          {r.limits?.maxPerCustomer ? ` · ${r.limits.maxPerCustomer}/cliente` : ""}
        </span>
      ),
    },
    { field: "origin", headerName: "Origen", renderCell: (r) => <span className="text-tertiary">{COUPON_ORIGIN[r.origin] || r.origin}{r.campaignName ? ` · ${r.campaignName}` : ""}</span> },
    { field: "endsAt", headerName: "Vence", renderCell: (r) => <span className="text-tertiary nowrap">{r.endsAt ? formatDate(r.endsAt) : "sin fin"}</span> },
    { field: "redemptionAmount", headerName: "$ descontado", align: "right", renderCell: (r) => <span className="mono">{money(r.redemptionAmount)}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...COUPON_STATUS[r.status]} /> },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (r) => (
        <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(r); }} aria-label="acciones"><MoreVertIcon fontSize="small" /></IconButton>
      ),
    },
  ];

  const toolbar = (
    <Box className="table-tabs">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
        {TABS.map((t) => <Tab key={t.key} label={t.label} />)}
      </Tabs>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Cupones"
        subtitle="Códigos de descuento que el cliente ingresa en el checkout."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({})}>Nuevo cupón</Button>}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <DataTable
        toolbar={toolbar} columns={columns} data={rows}
        onRowClick={(r) => setDetail(r)}
        emptyMessage="No hay cupones en esta vista."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ coupon: activeRow }); setAnchor(null); }}>Editar</MenuItem>
        {/* Mismo grado que las promociones: cambia lo que paga el cliente. */}
        {activeRow?.status === "activo" && (
          <MenuItem
            disabled={!puedeActivar.allowed}
            title={puedeActivar.allowed ? "" : puedeActivar.reason}
            onClick={() => cambiarEstado(activeRow, "pausado")}
          >
            Pausar
          </MenuItem>
        )}
        {activeRow?.status === "pausado" && (
          <MenuItem
            disabled={!puedeActivar.allowed}
            title={puedeActivar.allowed ? "" : puedeActivar.reason}
            onClick={() => cambiarEstado(activeRow, "activo")}
          >
            Activar
          </MenuItem>
        )}
        <MenuItem onClick={() => { deleteCoupon(activeRow.id); setAnchor(null); refresh(); showToast("Cupón eliminado", "info"); }}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <CuponModal
          coupon={modal.coupon}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`Cupón ${detail.code}`} subtitle={detail.description}
          actions={<Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Typography variant="subtitle2">Redenciones ({detail.redemptionCount})</Typography>
            {detail.redemptions.length === 0 && <Typography variant="body2" color="text.secondary">Todavía sin usos.</Typography>}
            {detail.redemptions.map((rd) => (
              <Box key={rd.id} sx={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                <span>
                  <RouterLink to={`/pedidos/${rd.orderId}`} className="mono">Pedido #{rd.orderId}</RouterLink> · {rd.customerName} · {formatDateTime(rd.at)}
                </span>
                <span className="mono">{money(rd.amount)}</span>
              </Box>
            ))}
          </Box>
        </Modal>
      )}
    </Box>
  );
};

export default Cupones;
