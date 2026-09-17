/**
 * Existencias, contra la API. Una fila por Producto × Sucursal × Presentación,
 * con el desglose por estado (disponible, comprometido, en tránsito, retenido…).
 * Lo que se puede vender es lo DISPONIBLE; lo comprometido está apartado para
 * una transferencia o incidencia y lo que viaja sigue siendo del origen.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Tooltip from "@mui/material/Tooltip";

import SearchIcon from "@mui/icons-material/Search";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import { useAuth } from "../../context/AuthContext";
import { useInventarioBase } from "./hooks/useInventario";
import { ESTADOS_STOCK, num, money, formaDe } from "./api/inventarioApi";
import "./Stock.css";

const TABS = [
  { key: "", label: "Todo" },
  { key: "bajo", label: "Bajo mínimo" },
  { key: "sin", label: "Sin stock" },
  { key: "apartado", label: "Con apartados" },
];

const Stock = () => {
  const navigate = useNavigate();
  const { user, esJefe, can } = useAuth();
  const { productos, sucursales, stock, productoDe, sucursalDe, cargando } = useInventarioBase();
  const veCostos = can("precios", "compras.productos", "compras.proveedores");

  const { filtros, setFiltros } = useVistaGuardada("stock", { search: "", sucursal: "", tab: 0 });
  const { search, sucursal, tab } = filtros;
  const sucursalFiltro = esJefe ? sucursal : user?.sucursalId;

  /** Agrupa el stock por (producto, sucursal, presentación) con el desglose por estado. */
  const filas = useMemo(() => {
    const m = new Map();
    (stock.data || []).forEach((s) => {
      if (sucursalFiltro && s.sucursalId !== Number(sucursalFiltro)) return;
      const k = `${s.productoId}:${s.sucursalId}:${s.presentacionId ?? ""}`;
      if (!m.has(k)) m.set(k, { id: k, productoId: s.productoId, sucursalId: s.sucursalId, presentacionId: s.presentacionId ?? null, estados: {} });
      m.get(k).estados[s.estado] = (m.get(k).estados[s.estado] || 0) + Number(s.cantidad);
    });
    const q = search.trim().toLowerCase();
    return [...m.values()].map((f) => {
      const p = productoDe(f.productoId);
      const disponible = f.estados.disponible || 0;
      const apartado = (f.estados.comprometido || 0) + (f.estados.retenido || 0) + (f.estados.en_transito || 0);
      const unidad = f.presentacionId ? "paq." : (p?.tipo === "granel" ? "kg" : "u");
      const costo = f.presentacionId ? (p?.presentaciones || []).find((x) => x.id === f.presentacionId)?.costoNeto : p?.costoNeto;
      return { ...f, producto: p, nombre: p?.nombre || `#${f.productoId}`, forma: formaDe(p, f.presentacionId), sucursal: sucursalDe(f.sucursalId)?.nombre || "—", disponible, apartado, unidad, costo, valor: costo != null ? costo * disponible : null, bajoMinimo: !f.presentacionId && p?.stockMin > 0 && disponible < p.stockMin };
    }).filter((f) => {
      if (q && ![f.nombre, f.producto?.codigoPropio, f.producto?.marca].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      const t = TABS[tab]?.key;
      if (t === "bajo") return f.bajoMinimo;
      if (t === "sin") return f.disponible <= 0;
      if (t === "apartado") return f.apartado > 0;
      return true;
    }).sort((a, b) => a.nombre.localeCompare(b.nombre) || a.sucursal.localeCompare(b.sucursal));
  }, [stock.data, sucursalFiltro, search, tab, productoDe, sucursalDe]);

  const resumen = useMemo(() => ({
    formas: filas.length,
    bajo: filas.filter((f) => f.bajoMinimo).length,
    apartado: filas.filter((f) => f.apartado > 0).length,
    valor: filas.reduce((a, f) => a + (f.valor || 0), 0),
  }), [filas]);

  const columns = [
    {
      field: "nombre", headerName: "Producto", width: "30%",
      renderCell: (f) => (
        <Box className="inv-sku-cell">
          <Box>
            <Typography className="inv-sku-cell__name">{f.nombre}</Typography>
            <Typography className="inv-sku-cell__sku">{f.producto?.codigoPropio}{f.producto?.marca ? ` · ${f.producto.marca}` : ""} · {f.forma}</Typography>
          </Box>
        </Box>
      ),
    },
    { field: "sucursal", headerName: "Sucursal", renderCell: (f) => <span className="inv-warehouse-cell__branch">{f.sucursal}</span> },
    { field: "disponible", headerName: "Disponible", align: "right", sortValue: (f) => f.disponible, renderCell: (f) => <span className={f.disponible <= 0 ? "inv-mov-qty--neg" : "inv-available"}>{num(f.disponible)} {f.unidad}</span> },
    { field: "apartado", headerName: "Apartado", align: "right", sortValue: (f) => f.apartado, renderCell: (f) => (f.apartado > 0
      ? <Tooltip title={Object.entries(f.estados).filter(([k]) => k !== "disponible").map(([k, v]) => `${ESTADOS_STOCK[k]?.label || k}: ${num(v)}`).join(" · ")}><span className="inv-num">{num(f.apartado)}</span></Tooltip>
      : <span className="text-tertiary">—</span>) },
    { field: "minimo", headerName: "Mínimo", align: "right", renderCell: (f) => <span className="inv-num">{f.presentacionId ? "—" : num(f.producto?.stockMin || 0)}</span> },
    ...(veCostos ? [{ field: "valor", headerName: "Valor (costo)", align: "right", sortValue: (f) => f.valor || 0, renderCell: (f) => <span className="inv-num">{money(f.valor)}</span> }] : []),
    { field: "estado", headerName: "Estado", sortable: false, renderCell: (f) => (f.disponible <= 0 ? <StatusBadge tone="danger" label="Sin stock" /> : f.bajoMinimo ? <StatusBadge tone="warning" label="Bajo mínimo" /> : <StatusBadge tone="success" label="OK" />) },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Stock"
        subtitle={esJefe ? "Existencias de todas las sucursales." : `Existencias de ${user?.sucursalNombre}.`}
        actions={(
          <>
            <Button variant="secondary" startIcon={<SwapHorizOutlinedIcon />} onClick={() => navigate("/inventario/transferencias")}>Transferencias</Button>
            <Button variant="primary" startIcon={<TuneOutlinedIcon />} onClick={() => navigate("/inventario/ajustes")}>Operaciones</Button>
          </>
        )}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2, mb: 2 }}>
        <StatCard title="Formas con stock" value={resumen.formas} hint="producto × sucursal × forma" />
        <StatCard title="Bajo mínimo" value={resumen.bajo} hint="a reponer" />
        <StatCard title="Con apartados" value={resumen.apartado} hint="comprometido / en tránsito" />
        {veCostos && <StatCard title="Valorizado" value={money(resumen.valor)} hint="disponible × costo neto" />}
      </Box>
      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setFiltros({ tab: v })}>{TABS.map((t) => <Tab key={t.key} label={t.label} />)}</Tabs>
        <Box sx={{ flex: 1 }} />
        {esJefe && (
          <TextField select size="small" label="Sucursal" value={sucursal} onChange={(e) => setFiltros({ sucursal: e.target.value })} sx={{ minWidth: 180 }}>
            <MenuItem value="">Todas</MenuItem>
            {(sucursales.data || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
          </TextField>
        )}
        <TextField size="small" placeholder="Buscar producto…" value={search} onChange={(e) => setFiltros({ search: e.target.value })} sx={{ minWidth: 240 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Box>
      <DataTable columns={columns} data={filas} loading={cargando} emptyMessage="Sin existencias que mostrar." onRowClick={(f) => navigate(`/productos/${f.productoId}`)} pagination={{ pageSize: 25 }} />
    </Box>
  );
};

export default Stock;
