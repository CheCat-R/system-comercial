import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { listSuppliers, createSupplier, toggleSupplierActive, getSupplierAnalytics, getPortfolioSummary } from "./api/supplyApi";
import { money } from "./lib/time";
import "./Proveedores.css";

const emptySupplier = () => ({ name: "", taxId: "", contactName: "", email: "", phone: "", address: "", leadTimeDays: 10, paymentTerms: "" });

const Proveedores = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);

  const summary = getPortfolioSummary();
  const q = search.toLowerCase();
  const rows = listSuppliers()
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.contactName.toLowerCase().includes(q))
    .map((s) => ({ ...s, analytics: getSupplierAnalytics(s.id) }));

  const kpis = [
    { title: "Proveedores activos", value: String(summary.activeSuppliers), icon: <GroupsOutlinedIcon /> },
    { title: "OC abiertas", value: String(summary.openOrders), icon: <ReceiptLongOutlinedIcon /> },
    { title: "Monto comprometido", value: money(summary.committedAmount), icon: <AccountBalanceWalletOutlinedIcon /> },
    { title: "Monto comprado (histórico)", value: money(summary.purchasedTotal), icon: <PaymentsOutlinedIcon /> },
  ];

  const saveSupplier = () => {
    if (!modal.name?.trim()) return showToast("Poné un nombre al proveedor", "warning");
    createSupplier(modal);
    setModal(null);
    setTick((t) => t + 1);
    showToast("Proveedor creado", "success");
  };

  const columns = [
    {
      field: "name",
      headerName: "Proveedor",
      width: "30%",
      renderCell: (row) => (
        <Box className="prov-cell">
          <Avatar variant="rounded" className="prov-cell__avatar"><BusinessOutlinedIcon sx={{ fontSize: 18 }} /></Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="prov-cell__name">{row.name}</Typography>
            <Typography className="prov-cell__contact">{row.contactName}</Typography>
          </Box>
        </Box>
      ),
    },
    { field: "leadTimeDays", headerName: "Lead time", align: "right", renderCell: (row) => `${row.leadTimeDays} días` },
    { field: "openOrders", headerName: "OC abiertas", align: "right", renderCell: (row) => row.analytics.openOrders },
    { field: "purchasedTotal", headerName: "Monto comprado", align: "right", renderCell: (row) => money(row.analytics.purchasedTotal) },
    { field: "status", headerName: "Estado", align: "center", renderCell: (row) => <StatusBadge status={row.isActive ? "activo" : "inactivo"} /> },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (row) => (
        <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(row); }} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const toolbar = (
    <Box className="table-toolbar">
      <TextField
        size="small"
        placeholder="Buscar por nombre o contacto…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="table-toolbar__search"
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Proveedores"
        subtitle="Catálogo de proveedores, costos y condiciones de compra."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal(emptySupplier())}>Nuevo proveedor</Button>}
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/abastecimiento/proveedores/${row.id}`)}
        emptyMessage="No hay proveedores que coincidan con la búsqueda."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { navigate(`/abastecimiento/proveedores/${activeRow.id}`); setAnchor(null); }}>Ver perfil</MenuItem>
        <MenuItem onClick={() => { toggleSupplierActive(activeRow.id); setTick((t) => t + 1); setAnchor(null); }}>
          {activeRow?.isActive ? "Desactivar" : "Activar"}
        </MenuItem>
      </Menu>

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title="Nuevo proveedor"
        maxWidth="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button variant="primary" onClick={saveSupplier}>Guardar</Button>
          </>
        }
      >
        {modal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre / razón social" size="small" fullWidth value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="CUIT" size="small" fullWidth value={modal.taxId} onChange={(e) => setModal({ ...modal, taxId: e.target.value })} />
              <TextField label="Lead time (días)" type="number" size="small" fullWidth value={modal.leadTimeDays} onChange={(e) => setModal({ ...modal, leadTimeDays: e.target.value })} />
            </Box>
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Contacto" size="small" fullWidth value={modal.contactName} onChange={(e) => setModal({ ...modal, contactName: e.target.value })} />
              <TextField label="Teléfono" size="small" fullWidth value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} />
            </Box>
            <TextField label="Email" size="small" fullWidth value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} />
            <TextField label="Dirección" size="small" fullWidth value={modal.address} onChange={(e) => setModal({ ...modal, address: e.target.value })} />
            <TextField label="Condiciones de pago" size="small" fullWidth value={modal.paymentTerms} onChange={(e) => setModal({ ...modal, paymentTerms: e.target.value })} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Proveedores;
