import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import ShoppingCartCheckoutOutlinedIcon from "@mui/icons-material/ShoppingCartCheckoutOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import PromocionModal from "./components/PromocionModal";
import { listPromotions, getPromotionsSummary, setPromotionStatus, deletePromotion } from "./api/marketingApi";
import { PROMO_STATUS, describeDiscount, describeConditions } from "./lib/discounts";
import { money, formatDate } from "./lib/time";

const TABS = [
  { key: "", label: "Todas" },
  { key: "activa", label: "Activas" },
  { key: "programada", label: "Programadas" },
  { key: "pausada", label: "Pausadas" },
  { key: "borrador", label: "Borradores" },
];

const Promociones = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const puedeActivar = check("marketing.activar_promocion");

  /**
   * ⭐ Pausar una promoción es reversible, así que se ofrece deshacerlo.
   *
   * No es un diálogo de confirmación disfrazado: un diálogo interrumpe **siempre**,
   * incluidas las 99 veces que la persona sí quería pausarla. Deshacer no
   * interrumpe nunca y arregla la vez que no.
   */
  const cambiarEstado = (promo, estado) => {
    const anterior = promo.status;
    setPromotionStatus(promo.id, estado);
    setAnchor(null);
    refresh();
    showToast(
      estado === "activa" ? "Promoción activada" : "Promoción pausada",
      estado === "activa" ? "success" : "info",
      {
        action: {
          label: "Deshacer",
          onClick: () => { setPromotionStatus(promo.id, anterior); refresh(); },
        },
      }
    );
  };
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null); // null | { promotion? }
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const summary = getPromotionsSummary();
  const rows = listPromotions({ status: TABS[tab].key || undefined }).map((p) => ({ ...p, id: p.id }));

  const kpis = [
    { title: "Promociones activas", value: String(summary.activas), icon: <LocalOfferOutlinedIcon /> },
    { title: "Programadas", value: String(summary.programadas), icon: <EventAvailableOutlinedIcon /> },
    { title: "Usos totales", value: String(summary.usos), icon: <ShoppingCartCheckoutOutlinedIcon /> },
    { title: "Descontado por promos", value: money(summary.montoDescontado), icon: <TrendingDownOutlinedIcon /> },
  ];

  const columns = [
    {
      field: "name", headerName: "Promoción",
      renderCell: (r) => (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600 }}>{r.name}</span>
          <span className="text-tertiary" style={{ fontSize: "var(--text-xs)" }}>{describeDiscount(r.discount, money)}</span>
        </Box>
      ),
    },
    { field: "conditions", headerName: "Condiciones", renderCell: (r) => <span className="text-tertiary">{describeConditions(r.conditions, money)}</span> },
    { field: "vigencia", headerName: "Vigencia", renderCell: (r) => <span className="text-tertiary nowrap">{formatDate(r.startsAt)} → {r.endsAt ? formatDate(r.endsAt) : "sin fin"}</span> },
    { field: "usage", headerName: "Usos", align: "right", renderCell: (r) => <span className="mono">{r.usage.length}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (r) => <StatusBadge {...PROMO_STATUS[r.status]} /> },
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
        title="Promociones"
        subtitle="Descuentos automáticos que se aplican en el carrito sin código."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({})}>Nueva promoción</Button>}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>)}
      </Grid>

      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="No hay promociones en esta vista." />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ promotion: activeRow }); setAnchor(null); }}>Editar</MenuItem>
        {/* ⭐ Activar o pausar una promoción cambia lo que paga el cliente en el
            próximo checkout: es «con motivo» en el catálogo. El ítem se apaga
            con el porqué en vez de dejar que el clic termine en un toast rojo. */}
        {activeRow?.status !== "activa" && (
          <MenuItem
            disabled={!puedeActivar.allowed}
            title={puedeActivar.allowed ? "" : puedeActivar.reason}
            onClick={() => cambiarEstado(activeRow, "activa")}
          >
            Activar
          </MenuItem>
        )}
        {activeRow?.status === "activa" && (
          <MenuItem
            disabled={!puedeActivar.allowed}
            title={puedeActivar.allowed ? "" : puedeActivar.reason}
            onClick={() => cambiarEstado(activeRow, "pausada")}
          >
            Pausar
          </MenuItem>
        )}
        <MenuItem onClick={() => { deletePromotion(activeRow.id); setAnchor(null); refresh(); showToast("Promoción eliminada", "info"); }}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <PromocionModal
          promotion={modal.promotion}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}

      <Box sx={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
        Las audiencias y campañas que promocionan estas ofertas se gestionan en{" "}
        <RouterLink to="/marketing/campanas" className="mono">Campañas</RouterLink> (Fase 2).
      </Box>
    </Box>
  );
};

export default Promociones;
