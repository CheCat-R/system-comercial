import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import { listPurchases, listSuppliers, listWarehouses, getPurchasingSummary } from "./api/supplyApi";
import { money, formatDateTime } from "./lib/time";
import "./Compras.css";

const Compras = () => {
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const summary = getPurchasingSummary();
  const rows = listPurchases({ supplierId: supplierId || undefined, warehouseId: warehouseId || undefined });

  const kpis = [
    { title: "Monto comprado", value: money(summary.totalAmount), icon: <PaymentsOutlinedIcon /> },
    { title: "Unidades recibidas", value: String(summary.totalUnits), icon: <Inventory2OutlinedIcon /> },
    { title: "Proveedor principal", value: summary.topSupplier?.name || "—", hint: summary.topSupplier ? money(summary.topSupplier.amount) : undefined, icon: <StorefrontOutlinedIcon /> },
    { title: "SKU más comprado", value: summary.topSku?.name || "—", hint: summary.topSku ? `${summary.topSku.units} u.` : undefined, icon: <SellOutlinedIcon /> },
  ];

  const columns = [
    { field: "at", headerName: "Fecha", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.at)}</span> },
    { field: "supplierName", headerName: "Proveedor" },
    {
      field: "orderId", headerName: "OC de origen",
      renderCell: (row) => <RouterLink to={`/abastecimiento/ordenes-compra/${row.orderId}`} className="mono">{row.orderId}</RouterLink>,
    },
    { field: "warehouseName", headerName: "Depósito" },
    { field: "units", headerName: "Unidades", align: "right" },
    { field: "amount", headerName: "Monto", align: "right", renderCell: (row) => money(row.amount) },
  ];

  const toolbar = (
    <Box className="table-toolbar compras-toolbar">
      <Box className="table-toolbar__filters">
        <Select size="small" displayEmpty value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <MenuItem value="">Todos los proveedores</MenuItem>
          {listSuppliers().map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <MenuItem value="">Todos los depósitos</MenuItem>
          {listWarehouses().map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </Select>
      </Box>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Compras"
        subtitle="Registro histórico de lo efectivamente recibido — se genera solo desde cada Recepción."
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="Todavía no se registraron compras." />
    </Box>
  );
};

export default Compras;
