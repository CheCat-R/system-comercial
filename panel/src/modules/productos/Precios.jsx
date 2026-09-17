/**
 * Precios y márgenes, contra la API.
 *
 * En este sistema el precio de venta NO se edita: se deriva del costo del
 * formato de compra activo y del markup de cada lista. Actualizar precios es
 * mover una de esas dos palancas — de a uno o en masa — y dejar que la API
 * recalcule. El panel previsualiza SIN tocar la red (tiene costos y márgenes
 * en memoria); a la API llegan sólo los cambios aprobados, que quedan en un
 * LOTE que se puede deshacer entero.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Tooltip from "@mui/material/Tooltip";

import SearchIcon from "@mui/icons-material/Search";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { productosApi, money, num } from "./api/productosApi";

const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Vista previa local del precio: la misma cuenta que la API, para no tocar la red mientras se escribe. */
const previsualizar = (costoPrecioUnitario, markup, iva, redondeo) => {
  const neto = costoPrecioUnitario * (1 + markup / 100);
  const final = neto * (1 + iva / 100);
  if (!redondeo) return Math.round(final * 100) / 100;
  return Math.round(final / redondeo) * redondeo;
};

const Precios = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const qc = useQueryClient();
  const puede = check("precios");

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [marca, setMarca] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [listaId, setListaId] = useState("");
  const [pct, setPct] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cambiosCosto, setCambiosCosto] = useState({});   // formatoId → costo
  const [cambiosMargen, setCambiosMargen] = useState({}); // productoListaId → markup
  const [confirmar, setConfirmar] = useState(null);       // "costos" | "margenes"

  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar });
  const catalogos = useQuery({ queryKey: QK.catalogos, queryFn: productosApi.catalogos });
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => productosApi.proveedores("mercaderia") });
  const listas = useQuery({ queryKey: QK.listas, queryFn: productosApi.listas });
  const cfg = useQuery({ queryKey: QK.configuracion("ventas"), queryFn: productosApi.configVentas });
  const historial = useQuery({ queryKey: QK.precios.historial({}), queryFn: () => productosApi.precios.historial({ limit: 200 }), enabled: tab === 1 });
  const ultimo = useQuery({ queryKey: QK.precios.ultimoCambio, queryFn: productosApi.precios.ultimoCambio });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: QK.productos });
    qc.invalidateQueries({ queryKey: ["precios"] });
    setCambiosCosto({}); setCambiosMargen({}); setMotivo(""); setPct(""); setConfirmar(null);
  };
  const err = (e) => showToast(e?.message || "No se pudo aplicar.", "error");
  const aplicarCostos = useMutation({
    mutationFn: (body) => productosApi.precios.costos(body),
    onSuccess: (r) => { showToast(`${r.actualizados} costo(s) actualizados. Lote ${r.lote}.`, "success"); invalidar(); }, onError: err,
  });
  const aplicarMargenes = useMutation({
    mutationFn: (body) => productosApi.precios.margenes(body),
    onSuccess: (r) => { showToast(`${r.actualizados} margen(es) actualizados.`, "success"); invalidar(); }, onError: err,
  });
  const revertir = useMutation({
    mutationFn: (lote) => productosApi.precios.revertir(lote),
    onSuccess: (r) => { showToast(`${r.revertidos} revertido(s)${r.salteados?.length ? `, ${r.salteados.length} salteado(s) porque cambiaron después` : ""}.`, "success"); invalidar(); }, onError: err,
  });

  const listasActivas = (listas.data?.listas || []).filter((l) => l.activa);
  const redondeo = Number(cfg.data?.redondeoPrecio ?? 1);

  /** Una fila por producto con su formato activo y la fila de la lista elegida. */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (productos.data || [])
      .filter((p) => p.estado !== "archivado")
      .filter((p) => !marca || String(p.marcaId) === String(marca))
      .filter((p) => !q || [p.nombre, p.codigoPropio, p.marca].some((v) => String(v || "").toLowerCase().includes(q)))
      .map((p) => {
        const activo = (p.formatosCompra || []).find((f) => f.usarParaPrecio) || p.formatosCompra?.[0] || null;
        const fila = listaId ? (p.listas || []).find((l) => l.listaId === Number(listaId)) : (p.listas || [])[p.listas?.length - 1];
        return { ...p, activo, fila };
      })
      .filter((p) => !proveedor || p.activo?.proveedorId === Number(proveedor));
  }, [productos.data, search, marca, proveedor, listaId]);

  const aplicarPorcentaje = () => {
    const n = Number(pct);
    if (!n) { showToast("Poné un porcentaje distinto de cero.", "warning"); return; }
    if (tab === 0) {
      const next = { ...cambiosCosto };
      rows.forEach((p) => { if (p.activo) next[p.activo.id] = Math.round(p.activo.costo * (1 + n / 100) * 100) / 100; });
      setCambiosCosto(next);
    } else {
      const next = { ...cambiosMargen };
      rows.forEach((p) => { if (p.fila && p.fila.modoPrecio !== "precio") next[p.fila.id] = Math.round(((p.fila.markup ?? 0) + n) * 100) / 100; });
      setCambiosMargen(next);
    }
  };

  const nCostos = Object.keys(cambiosCosto).length;
  const nMargenes = Object.keys(cambiosMargen).length;

  const colsComunes = [
    { field: "nombre", headerName: "Producto", width: "28%", renderCell: (p) => <Box><strong>{p.nombre}</strong><Typography variant="caption" color="text.secondary" display="block">{p.codigoPropio}{p.marca ? ` · ${p.marca}` : ""}</Typography></Box> },
  ];

  const colsCostos = [
    ...colsComunes,
    { field: "proveedor", headerName: "Proveedor activo", renderCell: (p) => (p.activo ? (proveedores.data || []).find((x) => x.id === p.activo.proveedorId)?.nombre || "—" : <StatusBadge tone="warning" label="sin formato" showDot={false} />) },
    { field: "costoActual", headerName: "Costo bulto", align: "right", renderCell: (p) => (p.activo ? <span className="nowrap">{money(p.activo.costo)} <span className="text-tertiary">×{num(p.activo.cantidad)}</span></span> : "—") },
    {
      field: "costoNuevo", headerName: "Nuevo costo", align: "right", sortable: false,
      renderCell: (p) => p.activo && (
        <TextField size="small" type="number" value={cambiosCosto[p.activo.id] ?? ""} placeholder={String(p.activo.costo)} disabled={!puede.allowed}
          onChange={(e) => setCambiosCosto((c) => { const n = { ...c }; if (e.target.value === "") delete n[p.activo.id]; else n[p.activo.id] = Number(e.target.value); return n; })}
          onClick={(e) => e.stopPropagation()} sx={{ width: 130 }} />
      ),
    },
    {
      field: "precioNuevo", headerName: "Mostrador → nuevo", align: "right",
      renderCell: (p) => {
        if (!p.activo || !p.fila) return <span className="text-tertiary">—</span>;
        const nuevoCosto = cambiosCosto[p.activo.id];
        if (nuevoCosto == null) return money(p.fila.precioFinalUnitario);
        const factor = p.activo.costo > 0 ? nuevoCosto / p.activo.costo : 1;
        const nuevo = p.fila.modoPrecio === "precio" ? p.fila.precioFinalUnitario : previsualizar(p.activo.costoPrecioUnitario * factor, p.fila.markup, p.iva, p.redondeo ?? redondeo);
        return <span className="nowrap">{money(p.fila.precioFinalUnitario)} → <strong>{money(nuevo)}</strong></span>;
      },
    },
  ];

  const colsMargenes = [
    ...colsComunes,
    { field: "lista", headerName: "Lista", renderCell: (p) => p.fila?.etiqueta || <StatusBadge tone="warning" label="sin lista" showDot={false} /> },
    { field: "costo", headerName: "Costo neto", align: "right", renderCell: (p) => money(p.costoNeto) },
    { field: "markup", headerName: "Markup %", align: "right", renderCell: (p) => (p.fila ? (p.fila.modoPrecio === "precio" ? <StatusBadge tone="info" label="precio fijo" showDot={false} /> : `${num(p.fila.markup, 2)}%`) : "—") },
    {
      field: "markupNuevo", headerName: "Nuevo markup", align: "right", sortable: false,
      renderCell: (p) => p.fila && p.fila.modoPrecio !== "precio" && (
        <TextField size="small" type="number" value={cambiosMargen[p.fila.id] ?? ""} placeholder={String(p.fila.markup ?? 0)} disabled={!puede.allowed}
          onChange={(e) => setCambiosMargen((c) => { const n = { ...c }; if (e.target.value === "") delete n[p.fila.id]; else n[p.fila.id] = Number(e.target.value); return n; })}
          onClick={(e) => e.stopPropagation()} sx={{ width: 110 }} />
      ),
    },
    {
      field: "precioNuevo", headerName: "Mostrador → nuevo", align: "right",
      renderCell: (p) => {
        if (!p.fila) return "—";
        const m = cambiosMargen[p.fila.id];
        if (m == null || p.fila.modoPrecio === "precio") return money(p.fila.precioFinalUnitario);
        return <span className="nowrap">{money(p.fila.precioFinalUnitario)} → <strong>{money(previsualizar(p.activo?.costoPrecioUnitario ?? 0, m, p.iva, p.redondeo ?? redondeo))}</strong></span>;
      },
    },
  ];

  const colsHistorial = [
    { field: "fecha", headerName: "Fecha", renderCell: (h) => <span className="nowrap">{stamp(h.fecha)}</span> },
    { field: "producto", headerName: "Producto", renderCell: (h) => <Box><strong>{h.producto}</strong><Typography variant="caption" color="text.secondary" display="block">{h.proveedor}</Typography></Box> },
    { field: "costoAnterior", headerName: "Antes", align: "right", renderCell: (h) => money(h.costoAnterior) },
    { field: "costo", headerName: "Después", align: "right", renderCell: (h) => <strong>{money(h.costo)}</strong> },
    { field: "origen", headerName: "Origen", renderCell: (h) => <StatusBadge tone={h.origen === "reversion" ? "warning" : "info"} label={h.origen} showDot={false} /> },
    { field: "motivo", headerName: "Motivo", renderCell: (h) => <span className="text-tertiary">{h.motivo || "—"}</span> },
    { field: "usuario", headerName: "Quién", renderCell: (h) => <span className="text-tertiary">{h.usuario || "—"}</span> },
    { field: "lote", headerName: "Lote", renderCell: (h) => (h.lote && h.origen !== "reversion" && puede.allowed
      ? <Tooltip title={`Deshacer el lote ${h.lote} entero`}><span><Button size="small" variant="ghost" startIcon={<UndoOutlinedIcon />} onClick={() => revertir.mutate(h.lote)}>Revertir</Button></span></Tooltip>
      : <code className="sec-code">{h.lote || "—"}</code>) },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Precios y márgenes"
        subtitle="El precio se deriva: costo del proveedor activo × (1 + markup) × (1 + IVA), redondeado a la góndola. Acá se mueven las palancas, de a uno o en masa."
        actions={ultimo.data?.fecha && <Typography variant="body2" color="text.secondary">Último cambio: {stamp(ultimo.data.fecha)} · {ultimo.data.productos} producto(s) · {ultimo.data.usuarioNombre || "—"}</Typography>}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Costos" />
        <Tab label="Márgenes por lista" />
        <Tab label="Historial y reversión" />
      </Tabs>

      {tab < 2 && (
        <>
          <Box className="table-toolbar">
            <TextField size="small" className="table-toolbar__search" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <Box className="table-toolbar__filters">
              <TextField select size="small" label="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">Todas</MenuItem>
                {(catalogos.data?.marcas || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Proveedor activo" value={proveedor} onChange={(e) => setProveedor(e.target.value)} sx={{ minWidth: 180 }}>
                <MenuItem value="">Todos</MenuItem>
                {(proveedores.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}
              </TextField>
              {tab === 1 && (
                <TextField select size="small" label="Lista" value={listaId} onChange={(e) => setListaId(e.target.value)} sx={{ minWidth: 180 }}>
                  <MenuItem value="">La del piso</MenuItem>
                  {listasActivas.map((l) => <MenuItem key={l.id} value={l.id}>{l.etiqueta}</MenuItem>)}
                </TextField>
              )}
            </Box>
          </Box>

          <Card className="entity-card" sx={{ mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <TextField size="small" type="number" label={tab === 0 ? "Subir costos %" : "Sumar al markup (puntos)"} value={pct} onChange={(e) => setPct(e.target.value)} sx={{ width: 200 }} disabled={!puede.allowed} />
            <Button variant="secondary" onClick={aplicarPorcentaje} disabled={!puede.allowed}>Aplicar a los {rows.length} filtrados</Button>
            <Box sx={{ flex: 1 }} />
            <TextField size="small" label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} sx={{ minWidth: 240 }} placeholder="Lista nueva del proveedor, ajuste de temporada…" />
            <Tooltip title={puede.allowed ? "" : puede.reason}>
              <span>
                <Button variant="primary" disabled={!puede.allowed || (tab === 0 ? !nCostos : !nMargenes)} onClick={() => setConfirmar(tab === 0 ? "costos" : "margenes")}>
                  Guardar {tab === 0 ? `${nCostos} costo(s)` : `${nMargenes} margen(es)`}
                </Button>
              </span>
            </Tooltip>
          </Card>

          <DataTable columns={tab === 0 ? colsCostos : colsMargenes} data={rows} loading={productos.isLoading} emptyMessage="Ningún producto coincide." pagination={{ pageSize: 25 }} />
        </>
      )}

      {tab === 2 && (
        <DataTable columns={colsHistorial} data={historial.data || []} loading={historial.isLoading} emptyMessage="Todavía no hubo cambios de costo." pagination={{ pageSize: 25 }} />
      )}

      <Modal open={Boolean(confirmar)} onClose={() => setConfirmar(null)} title="Confirmar actualización"
        subtitle={confirmar === "costos" ? `${nCostos} costo(s) cambian y los precios se recalculan. Queda en un lote que se puede deshacer.` : `${nMargenes} margen(es) cambian y los precios se recalculan.`}
        actions={(
          <>
            <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variant="primary" loading={aplicarCostos.isPending || aplicarMargenes.isPending} onClick={() => (confirmar === "costos"
              ? aplicarCostos.mutate({ cambios: Object.entries(cambiosCosto).map(([id, costo]) => ({ id: Number(id), costo })), origen: "masiva", motivo })
              : aplicarMargenes.mutate({ cambios: Object.entries(cambiosMargen).map(([id, valor]) => ({ id: Number(id), valor })), motivo }))}>
              Aplicar
            </Button>
          </>
        )}>
        <Typography variant="body2" color="text.secondary">Motivo: {motivo || "(sin motivo)"}</Typography>
      </Modal>
    </Box>
  );
};

export default Precios;
