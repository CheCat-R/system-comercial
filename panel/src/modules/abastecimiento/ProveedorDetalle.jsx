import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import SupplierHeader from "./components/SupplierHeader";
import {
  getSupplier, getSupplierAnalytics, getSupplierCatalog, listSkus,
  createSupplierSku, updateSupplierSku, deleteSupplierSku,
  listPurchaseOrders, listPurchases, updateSupplier,
} from "./api/supplyApi";
import { PO_STATUS } from "./lib/purchaseOrders";
import { money, formatDate, formatDateTime, relativeFromToday } from "./lib/time";
import "./ProveedorDetalle.css";

const TABS = ["Resumen", "Catálogo", "Órdenes de compra", "Compras"];

const emptyCatalogRow = (supplierId) => ({ supplierId, skuId: "", supplierSku: "", cost: "", minOrderQty: 1, isPreferred: false });

const ProveedorDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [, setTick] = useState(0);

  const [editModal, setEditModal] = useState(null);
  const [catalogModal, setCatalogModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);

  const supplier = getSupplier(id);

  if (!supplier) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró el proveedor {id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/abastecimiento/proveedores")}>Volver</Button>
      </Box>
    );
  }

  const analytics = getSupplierAnalytics(id);
  const catalog = getSupplierCatalog(id);
  const orders = listPurchaseOrders({ supplierId: id });
  const purchases = listPurchases({ supplierId: id });

  const saveSupplier = () => {
    updateSupplier(id, editModal);
    setEditModal(null);
    setTick((t) => t + 1);
    showToast("Proveedor actualizado", "success");
  };

  const saveCatalogRow = () => {
    if (!catalogModal.skuId || !catalogModal.cost) return showToast("Elegí el SKU y cargá el costo", "warning");
    if (catalogModal.id) updateSupplierSku(catalogModal.id, catalogModal);
    else createSupplierSku(catalogModal);
    setCatalogModal(null);
    setTick((t) => t + 1);
    showToast(catalogModal.id ? "Costo actualizado" : "SKU agregado al catálogo", "success");
  };

  const catalogColumns = [
    {
      field: "name", headerName: "Producto", width: "26%",
      renderCell: (row) => (
        <Box className="sup-catalog-cell">
          {row.isPreferred && <StarIcon className="sup-preferred-star" />}
          <Box>
            <Typography variant="body2">{row.name}</Typography>
            <Typography variant="caption" className="mono text-tertiary">{row.sku}</Typography>
          </Box>
        </Box>
      ),
    },
    { field: "supplierSku", headerName: "SKU del proveedor", renderCell: (row) => <span className="mono text-secondary">{row.supplierSku}</span> },
    { field: "cost", headerName: "Costo", align: "right", renderCell: (row) => money(row.cost) },
    { field: "minOrderQty", headerName: "Cant. mínima", align: "right" },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (row) => (
        <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(row); }} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const orderColumns = [
    { field: "id", headerName: "OC", renderCell: (row) => <span className="mono">{row.id}</span> },
    { field: "warehouseName", headerName: "Depósito destino" },
    { field: "expectedDate", headerName: "Fecha esperada", renderCell: (row) => formatDate(row.expectedDate) },
    { field: "total", headerName: "Monto", align: "right", renderCell: (row) => money(row.total) },
    { field: "pct", headerName: "% recibido", align: "right", renderCell: (row) => `${row.pct}%` },
    { field: "status", headerName: "Estado", align: "center", renderCell: (row) => <StatusBadge {...PO_STATUS[row.status]} /> },
  ];

  const purchaseColumns = [
    { field: "at", headerName: "Fecha", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.at)}</span> },
    { field: "orderId", headerName: "OC de origen", renderCell: (row) => <span className="mono">{row.orderId}</span> },
    { field: "warehouseName", headerName: "Depósito" },
    { field: "units", headerName: "Unidades", align: "right" },
    { field: "amount", headerName: "Monto", align: "right", renderCell: (row) => money(row.amount) },
  ];

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={supplier.name}
        onBack={() => navigate("/abastecimiento/proveedores")}
        backLabel="Volver a proveedores"
      />

      <SupplierHeader
        supplier={supplier}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditModal(supplier)}>Editar</Button>
            <Button variant="primary" onClick={() => navigate("/abastecimiento/ordenes-compra/nueva", { state: { supplierId: id } })}>Nueva Orden de Compra</Button>
          </>
        }
      />

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="Monto comprado" value={money(analytics.purchasedTotal)} icon={<PaymentsOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="OC abiertas" value={String(analytics.openOrders)} icon={<ReceiptLongOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="OC totales" value={String(analytics.ordersCount)} icon={<GroupsOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="Última compra" value={analytics.lastPurchaseAt ? relativeFromToday(analytics.lastPurchaseAt) : "Nunca"} icon={<EventOutlinedIcon />} /></Grid>
      </Grid>

      <Box className="sup-tabs" sx={{ mt: 4 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {TABS.map((t) => <Tab key={t} label={t} />)}
        </Tabs>
      </Box>

      {tab === 0 && (
        <Typography variant="body2" color="text.secondary">
          {supplier.name} provee {catalog.length} SKU{catalog.length === 1 ? "" : "s"} del catálogo,
          con {orders.filter((o) => ["enviada", "parcial"].includes(o.status)).length} orden(es) de compra
          abierta(s) por un total comprometido pendiente de recibir.
        </Typography>
      )}

      {tab === 1 && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <Button variant="primary" size="small" startIcon={<AddIcon />} onClick={() => setCatalogModal(emptyCatalogRow(id))}>
              Agregar SKU
            </Button>
          </Box>
          <DataTable columns={catalogColumns} data={catalog} emptyMessage="Este proveedor todavía no tiene SKUs cargados." />
        </Box>
      )}

      {tab === 2 && (
        <DataTable
          columns={orderColumns}
          data={orders}
          onRowClick={(row) => navigate(`/abastecimiento/ordenes-compra/${row.id}`)}
          emptyMessage="Todavía no hay Órdenes de Compra a este proveedor."
        />
      )}

      {tab === 3 && (
        <DataTable columns={purchaseColumns} data={purchases} emptyMessage="Todavía no se recibió ninguna compra de este proveedor." />
      )}

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setCatalogModal(activeRow); setAnchor(null); }}>Editar</MenuItem>
        {!activeRow?.isPreferred && (
          <MenuItem onClick={() => { updateSupplierSku(activeRow.id, { isPreferred: true }); setTick((t) => t + 1); setAnchor(null); showToast("Marcado como proveedor preferido", "success"); }}>
            Marcar preferido
          </MenuItem>
        )}
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => { deleteSupplierSku(activeRow.id); setTick((t) => t + 1); setAnchor(null); showToast("SKU quitado del catálogo", "info"); }}
        >
          Quitar del catálogo
        </MenuItem>
      </Menu>

      <Modal
        open={Boolean(editModal)}
        onClose={() => setEditModal(null)}
        title="Editar proveedor"
        maxWidth="sm"
        actions={<><Button variant="ghost" onClick={() => setEditModal(null)}>Cancelar</Button><Button variant="primary" onClick={saveSupplier}>Guardar</Button></>}
      >
        {editModal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={editModal.name} onChange={(e) => setEditModal({ ...editModal, name: e.target.value })} />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Contacto" size="small" fullWidth value={editModal.contactName} onChange={(e) => setEditModal({ ...editModal, contactName: e.target.value })} />
              <TextField label="Lead time (días)" type="number" size="small" fullWidth value={editModal.leadTimeDays} onChange={(e) => setEditModal({ ...editModal, leadTimeDays: e.target.value })} />
            </Box>
            <TextField label="Email" size="small" fullWidth value={editModal.email} onChange={(e) => setEditModal({ ...editModal, email: e.target.value })} />
            <TextField label="Teléfono" size="small" fullWidth value={editModal.phone} onChange={(e) => setEditModal({ ...editModal, phone: e.target.value })} />
            <TextField label="Condiciones de pago" size="small" fullWidth value={editModal.paymentTerms} onChange={(e) => setEditModal({ ...editModal, paymentTerms: e.target.value })} />
          </Box>
        )}
      </Modal>

      <Modal
        open={Boolean(catalogModal)}
        onClose={() => setCatalogModal(null)}
        title={catalogModal?.id ? "Editar costo" : "Agregar SKU al catálogo"}
        maxWidth="sm"
        actions={<><Button variant="ghost" onClick={() => setCatalogModal(null)}>Cancelar</Button><Button variant="primary" onClick={saveCatalogRow}>Guardar</Button></>}
      >
        {catalogModal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Select
              size="small" fullWidth displayEmpty
              value={catalogModal.skuId}
              disabled={Boolean(catalogModal.id)}
              onChange={(e) => setCatalogModal({ ...catalogModal, skuId: e.target.value })}
            >
              <MenuItem value="" disabled>SKU…</MenuItem>
              {listSkus().map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </Select>
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="SKU del proveedor" size="small" fullWidth value={catalogModal.supplierSku} onChange={(e) => setCatalogModal({ ...catalogModal, supplierSku: e.target.value })} />
              <TextField label="Costo" type="number" size="small" fullWidth value={catalogModal.cost} onChange={(e) => setCatalogModal({ ...catalogModal, cost: e.target.value })} />
            </Box>
            <TextField label="Cantidad mínima de compra" type="number" size="small" fullWidth value={catalogModal.minOrderQty} onChange={(e) => setCatalogModal({ ...catalogModal, minOrderQty: e.target.value })} />
            <FormControlLabel
              control={<Checkbox checked={catalogModal.isPreferred} onChange={(e) => setCatalogModal({ ...catalogModal, isPreferred: e.target.checked })} />}
              label="Proveedor preferido para este SKU"
            />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default ProveedorDetalle;
