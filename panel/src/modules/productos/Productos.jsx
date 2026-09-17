/**
 * El catálogo.
 *
 * ⭐ Hasta la auditoría, esta pantalla mostraba **cinco productos inventados** en
 * una constante del propio componente (`mockProducts`), mientras
 * `productos/api/catalogApi.js` servía los **catorce reales** que usan Tienda,
 * Marketing, Analytics y Precios. Que `/productos` y `/productos/precios`
 * mostraran catálogos distintos era la incoherencia más visible del panel.
 *
 * ── ⭐ Lo que esta pantalla NO hace, y lo dice ──────────────────────────
 *
 * `catalogApi` tiene exactamente **una** operación de escritura: `setPrice`, que
 * se creó en la F3 de Seguridad porque el cambio de precio es una superficie
 * vigilada. El alta, la edición y la baja de productos **no existen todavía**, y
 * acá se muestran deshabilitadas con el motivo en vez de ofrecer botones que no
 * llevan a ningún lado — el mismo criterio con el que el panel trata
 * `/configuracion` y los permisos declarados sin cablear.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import useVistaGuardada from "../../hooks/useVistaGuardada";
import { listProducts, listCategories, listBrands, getCatalogSummary, marginOf } from "./api/catalogApi";
import "./Productos.css";

const money = (v) => `$${Math.round(v || 0).toLocaleString("es-AR")}`;

/** El BOM hace que Excel abra el CSV en UTF-8 sin romper los acentos. */
const downloadCsv = (rows, filename) => {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(cell).join(";")).join("\n");
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const Productos = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ⭐ Los filtros viven en la URL: sobreviven a ir y volver, y sobre todo
  // **se pueden pasar por link**, que es lo que uno hace todo el día en un ERP.
  const { filtros, setFiltros, limpiar, hayFiltro } = useVistaGuardada("productos", {
    search: "", categoria: "", marca: "", estado: "",
  });
  const { search, categoria: categoryId, marca: brandId, estado: status } = filtros;

  const [anchorEl, setAnchorEl] = useState(null);
  const [activeRow, setActiveRow] = useState(null);

  const categories = useMemo(() => listCategories(), []);
  const brands = useMemo(() => listBrands(), []);
  const summary = useMemo(() => getCatalogSummary(), []);

  const rows = useMemo(() => listProducts({
    search,
    status: status || undefined,
    categoryIds: categoryId ? [categoryId] : undefined,
    brandIds: brandId ? [brandId] : undefined,
  }).map((p) => ({ ...p, margin: marginOf(p.price, p.cost) })),
  [search, status, categoryId, brandId]);

  const handleMenuOpen = (event, product) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setActiveRow(product);
  };
  const handleMenuClose = () => { setAnchorEl(null); setActiveRow(null); };

  const handleExport = () => {
    downloadCsv([
      ["SKU", "Producto", "Categoría", "Marca", "Precio", "Costo", "Margen %", "Stock", "Estado"],
      ...rows.map((p) => [
        p.sku, p.name, p.categoryName, p.brandName,
        p.price, p.cost, p.margin == null ? "" : (p.margin * 100).toFixed(1),
        p.stock, p.status,
      ]),
    ], `catalogo-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`${rows.length} producto(s) exportado(s)`, "success");
  };

  const columns = [
    {
      field: "name",
      headerName: "Producto",
      width: "32%",
      renderCell: (row) => (
        <Box className="producto-cell">
          <Avatar
            variant="rounded"
            className="producto-cell__thumb"
            sx={row.mediaColor ? { backgroundColor: row.mediaColor } : undefined}
          >
            {row.name.charAt(0)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="producto-cell__name">{row.name}</Typography>
            <Typography className="producto-cell__sku mono">{row.sku}</Typography>
          </Box>
        </Box>
      ),
    },
    { field: "categoryName", headerName: "Categoría" },
    { field: "brandName", headerName: "Marca" },
    {
      field: "price",
      headerName: "Precio",
      align: "right",
      renderCell: (row) => (
        <span className="producto-cell__price">
          {money(row.price)}
          {row.onSale && <em className="producto-cell__compare">{money(row.compareAtPrice)}</em>}
        </span>
      ),
    },
    {
      field: "margin",
      headerName: "Margen",
      align: "right",
      renderCell: (row) => (
        <StatusBadge
          tone={row.margin < 0 ? "danger" : (row.margin < 0.2 ? "warning" : "success")}
          label={row.margin == null ? "—" : `${(row.margin * 100).toFixed(1)} %`}
          showDot={false}
        />
      ),
    },
    {
      field: "stock",
      headerName: "Stock",
      align: "right",
      renderCell: (row) => (
        <span className={row.stock === 0 ? "producto-cell__stock--zero" : ""}>{row.stock} u.</span>
      ),
    },
    {
      field: "status",
      headerName: "Estado",
      align: "center",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      field: "actions",
      headerName: "",
      align: "right",
      width: 56,
      sortable: false,
      renderCell: (row) => (
        <IconButton size="small" onClick={(e) => handleMenuOpen(e, row)} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const toolbar = (
    <Box className="table-toolbar">
      <TextField
        size="small"
        placeholder="Buscar por nombre o SKU…"
        value={search}
        onChange={(e) => setFiltros({ search: e.target.value })}
        className="table-toolbar__search"
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          },
        }}
      />
      <Box className="table-toolbar__filters">
        <Select size="small" displayEmpty value={categoryId} onChange={(e) => setFiltros({ categoria: e.target.value })}>
          <MenuItem value="">Todas las categorías</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name} ({c.productCount})</MenuItem>
          ))}
        </Select>
        <Select size="small" displayEmpty value={brandId} onChange={(e) => setFiltros({ marca: e.target.value })}>
          <MenuItem value="">Todas las marcas</MenuItem>
          {brands.map((b) => (
            <MenuItem key={b.id} value={b.id}>{b.name} ({b.productCount})</MenuItem>
          ))}
        </Select>
        <Select size="small" displayEmpty value={status} onChange={(e) => setFiltros({ estado: e.target.value })}>
          <MenuItem value="">Todos los estados</MenuItem>
          <MenuItem value="Activo">Activo</MenuItem>
          <MenuItem value="Borrador">Borrador</MenuItem>
          <MenuItem value="Agotado">Agotado</MenuItem>
        </Select>
      </Box>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Productos"
        subtitle={`${summary.total} productos · ${summary.published} publicados · ${summary.outOfStock} sin stock · ${summary.onSale} en oferta.`}
        actions={(
          <>
            <Button variant="secondary" startIcon={<FileDownloadOutlinedIcon />} onClick={handleExport}>
              Exportar
            </Button>
            <Button variant="secondary" startIcon={<SellOutlinedIcon />} onClick={() => navigate("/productos/precios")}>
              Precios y márgenes
            </Button>
            {/* ⭐ El alta de catálogo no existe como operación. Se dice, no se finge. */}
            <Tooltip title="El alta de productos todavía no existe como operación: catalogApi sólo escribe precios (§4.1 de Seguridad). Se habilita cuando Productos tenga su capa de escritura.">
              <span>
                <Button variant="primary" startIcon={<AddIcon />} disabled>
                  Nuevo producto
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      />

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/productos/${row.id}`)}
        emptyState={{
          icon: <Inventory2OutlinedIcon />,
          title: "Ningún producto coincide con los filtros",
          description: "Probá quitando la categoría o la marca. El catálogo tiene "
            + `${summary.total} productos en total.`,
          action: hayFiltro
            ? <Button variant="ghost" onClick={limpiar}>Limpiar filtros</Button>
            : null,
        }}
      />

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem onClick={() => { navigate(`/productos/${activeRow.id}`); handleMenuClose(); }}>
          <ListItemIcon><VisibilityOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Ver el producto</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { navigate("/productos/precios"); handleMenuClose(); }}>
          <ListItemIcon><SellOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Cambiar el precio</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Productos;
