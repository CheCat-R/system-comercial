/**
 * El catálogo, contra la API.
 *
 * Modelo del negocio: un producto es GRANEL (se compra en kg y se fracciona en
 * presentaciones) o ENTERO (unidades). El precio NO se edita: se deriva del
 * costo del formato de compra activo y del markup de cada lista — por eso la
 * columna «Precio» muestra el de mostrador ya calculado por la API.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";

import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import StatCard from "../../components/Cards/StatCard/StatCard";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import { QK } from "../../app/api/queryClient";
import { productosApi, money, num, ESTADOS_PRODUCTO, IVAS } from "./api/productosApi";
import "./Productos.css";

/** El BOM hace que Excel abra el CSV en UTF-8 sin romper los acentos. */
const downloadCsv = (rows, filename) => {
  const cell = (v) => { const s = String(v ?? ""); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map((r) => r.map(cell).join(";")).join("\n");
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const ALTA_VACIA = { nombre: "", esGranel: false, iva: 21, marcaId: "", categoriaId: "", proveedorId: "", costoInicial: "", codigoBarras: "" };

const Productos = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { check, can } = useAuth();
  const qc = useQueryClient();
  const puedeEditar = check("compras.productos");
  const veCostos = can("precios", "compras.productos", "compras.proveedores");

  const { filtros, setFiltros } = useVistaGuardada("productos", { search: "", categoria: "", marca: "", estado: "activo", tipo: "" });
  const { search, categoria, marca, estado, tipo } = filtros;
  const [alta, setAlta] = useState(null);

  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar });
  const catalogos = useQuery({ queryKey: QK.catalogos, queryFn: productosApi.catalogos });
  const stock = useQuery({ queryKey: QK.stock, queryFn: productosApi.stock });
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => productosApi.proveedores("mercaderia"), enabled: Boolean(alta) });

  const crear = useMutation({
    mutationFn: (body) => productosApi.crear(body),
    onSuccess: (p) => {
      showToast(`"${p.nombre}" creado.`, "success");
      qc.invalidateQueries({ queryKey: QK.productos });
      setAlta(null);
      navigate(`/productos/${p.id}`);
    },
    onError: (err) => showToast(err?.message || "No se pudo crear.", "error"),
  });

  /** Disponible total por producto (todas las sucursales, sólo el suelto). */
  const disponible = useMemo(() => {
    const m = {};
    (stock.data || []).forEach((s) => {
      if (s.estado !== "disponible" || s.presentacionId) return;
      m[s.productoId] = (m[s.productoId] || 0) + Number(s.cantidad);
    });
    return m;
  }, [stock.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (productos.data || []).filter((p) => {
      if (estado && p.estado !== estado) return false;
      if (tipo && p.tipo !== tipo) return false;
      if (categoria && String(p.categoriaId) !== String(categoria)) return false;
      if (marca && String(p.marcaId) !== String(marca)) return false;
      if (q && ![p.nombre, p.codigoPropio, p.codigoBarras, p.marca].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    }).map((p) => ({ ...p, disponible: disponible[p.id] || 0 }));
  }, [productos.data, search, estado, tipo, categoria, marca, disponible]);

  const resumen = useMemo(() => {
    const todos = productos.data || [];
    return {
      total: todos.length,
      activos: todos.filter((p) => p.estado === "activo").length,
      sinPrecio: todos.filter((p) => p.estado !== "archivado" && p.precio == null).length,
      granel: todos.filter((p) => p.tipo === "granel").length,
    };
  }, [productos.data]);

  const handleExport = () => {
    downloadCsv([
      ["Código", "Producto", "Marca", "Categoría", "Tipo", "IVA", "Costo neto", "Precio mostrador", "Disponible", "Estado"],
      ...rows.map((p) => [p.codigoPropio, p.nombre, p.marca, p.categoria, p.tipo, p.iva, p.costoNeto ?? "", p.precioFinal ?? "", p.disponible, p.estado]),
    ], `catalogo-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`${rows.length} producto(s) exportado(s)`, "success");
  };

  const columns = [
    {
      field: "nombre", headerName: "Producto", width: "34%",
      renderCell: (p) => (
        <Box className="producto-cell">
          <Avatar className="producto-cell__thumb" variant="rounded">{(p.nombre || "?")[0]}</Avatar>
          <Box>
            <Typography className="producto-cell__name">{p.nombre}</Typography>
            <Typography className="producto-cell__sku">{p.codigoPropio}{p.marca ? ` · ${p.marca}` : ""}{p.codigoBarras ? ` · ${p.codigoBarras}` : ""}</Typography>
          </Box>
        </Box>
      ),
    },
    { field: "tipo", headerName: "Tipo", renderCell: (p) => <StatusBadge tone={p.tipo === "granel" ? "info" : "neutral"} label={p.tipo === "granel" ? "Granel" : "Entero"} showDot={false} /> },
    { field: "categoria", headerName: "Categoría", renderCell: (p) => <span className="text-tertiary">{p.categoria || "—"}</span> },
    ...(veCostos ? [{ field: "costoNeto", headerName: "Costo neto", align: "right", renderCell: (p) => <span className="nowrap">{money(p.costoNeto)}<span className="text-tertiary">/{p.tipo === "granel" ? "kg" : "u"}</span></span> }] : []),
    {
      field: "precioFinal", headerName: "Precio mostrador", align: "right",
      renderCell: (p) => (p.precioFinal == null
        ? <Tooltip title="Sin formato de venta: no tiene precio y el POS lo bloquea."><span className="producto-cell__stock--zero">sin precio</span></Tooltip>
        : <span className="producto-cell__price">{money(p.precioFinal)}</span>),
    },
    { field: "disponible", headerName: "Disponible", align: "right", renderCell: (p) => <span className={p.disponible <= 0 ? "producto-cell__stock--zero" : "nowrap"}>{num(p.disponible)} {p.tipo === "granel" ? "kg" : "u"}</span> },
    { field: "estado", headerName: "Estado", renderCell: (p) => <StatusBadge tone={ESTADOS_PRODUCTO[p.estado]?.tone} label={ESTADOS_PRODUCTO[p.estado]?.label || p.estado} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Productos"
        subtitle="El catálogo. El precio se deriva del costo del proveedor activo y del margen de cada lista: no se escribe a mano."
        actions={(
          <>
            <Button variant="secondary" startIcon={<FileDownloadOutlinedIcon />} onClick={handleExport}>Exportar</Button>
            <Tooltip title={puedeEditar.allowed ? "" : puedeEditar.reason}>
              <span>
                <Button variant="primary" startIcon={<AddIcon />} disabled={!puedeEditar.allowed} onClick={() => setAlta({ ...ALTA_VACIA })}>Nuevo producto</Button>
              </span>
            </Tooltip>
          </>
        )}
      />

      <Box className="stats-grid" sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2, mb: 2 }}>
        <StatCard title="Productos" value={resumen.total} hint={`${resumen.activos} activos`} />
        <StatCard title="A granel" value={resumen.granel} hint="se fraccionan" />
        <StatCard title="Sin precio" value={resumen.sinPrecio} hint="sin formato de venta" />
      </Box>

      <Box className="table-toolbar">
        <TextField
          size="small" className="table-toolbar__search" placeholder="Buscar por nombre, código o marca…"
          value={search} onChange={(e) => setFiltros({ search: e.target.value })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <Box className="table-toolbar__filters">
          <TextField select size="small" label="Estado" value={estado} onChange={(e) => setFiltros({ estado: e.target.value })} sx={{ minWidth: 150 }}>
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(ESTADOS_PRODUCTO).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setFiltros({ tipo: e.target.value })} sx={{ minWidth: 130 }}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="granel">Granel</MenuItem>
            <MenuItem value="entero">Entero</MenuItem>
          </TextField>
          <TextField select size="small" label="Categoría" value={categoria} onChange={(e) => setFiltros({ categoria: e.target.value })} sx={{ minWidth: 170 }}>
            <MenuItem value="">Todas</MenuItem>
            {(catalogos.data?.categorias || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Marca" value={marca} onChange={(e) => setFiltros({ marca: e.target.value })} sx={{ minWidth: 170 }}>
            <MenuItem value="">Todas</MenuItem>
            {(catalogos.data?.marcas || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre}</MenuItem>)}
          </TextField>
        </Box>
      </Box>

      <DataTable
        columns={columns}
        data={rows}
        loading={productos.isLoading}
        emptyMessage={productos.isError ? "No se pudo cargar el catálogo." : "Ningún producto coincide."}
        onRowClick={(p) => navigate(`/productos/${p.id}`)}
        pagination={{ pageSize: 25 }}
      />

      <Modal open={Boolean(alta)} onClose={() => setAlta(null)} title="Nuevo producto" subtitle="Lo mínimo para que exista. El resto se completa en la ficha."
        actions={(
          <>
            <Button variant="ghost" onClick={() => setAlta(null)}>Cancelar</Button>
            <Button variant="primary" loading={crear.isPending} onClick={() => {
              if (!alta.nombre.trim()) { showToast("Poné el nombre.", "warning"); return; }
              crear.mutate({
                nombre: alta.nombre, esGranel: alta.esGranel, iva: Number(alta.iva),
                marcaId: alta.marcaId || null, categoriaId: alta.categoriaId || null, codigoBarras: alta.codigoBarras || "",
                proveedorId: alta.proveedorId || undefined, costoInicial: alta.costoInicial === "" ? undefined : Number(alta.costoInicial),
              });
            }}>Crear</Button>
          </>
        )}>
        {alta && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" required autoFocus value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
            <FormControlLabel control={<Switch checked={alta.esGranel} onChange={(e) => setAlta({ ...alta, esGranel: e.target.checked })} />}
              label="Es a granel (se compra por kilo y se fracciona en paquetes)" />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField select label="IVA" size="small" value={alta.iva} onChange={(e) => setAlta({ ...alta, iva: e.target.value })}>
                {IVAS.map((i) => <MenuItem key={i} value={i}>{i}%</MenuItem>)}
              </TextField>
              <TextField label="Código de barras" size="small" value={alta.codigoBarras} onChange={(e) => setAlta({ ...alta, codigoBarras: e.target.value })} helperText="Opcional. El código propio se genera solo." />
              <TextField select label="Marca" size="small" value={alta.marcaId} onChange={(e) => setAlta({ ...alta, marcaId: e.target.value })}>
                <MenuItem value="">Sin marca</MenuItem>
                {(catalogos.data?.marcas || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre}</MenuItem>)}
              </TextField>
              <TextField select label="Categoría" size="small" value={alta.categoriaId} onChange={(e) => setAlta({ ...alta, categoriaId: e.target.value })}>
                <MenuItem value="">Sin categoría</MenuItem>
                {(catalogos.data?.categorias || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
              </TextField>
              <TextField select label="Proveedor" size="small" value={alta.proveedorId} onChange={(e) => setAlta({ ...alta, proveedorId: e.target.value })} helperText="Queda como formato de compra activo.">
                <MenuItem value="">Después</MenuItem>
                {(proveedores.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}
              </TextField>
              <TextField label="Costo inicial (neto)" size="small" type="number" value={alta.costoInicial} onChange={(e) => setAlta({ ...alta, costoInicial: e.target.value })} disabled={!alta.proveedorId} helperText={alta.esGranel ? "Por kilo." : "Por unidad."} />
            </Box>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Productos;
