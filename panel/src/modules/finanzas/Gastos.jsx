/**
 * GASTOS — lo que la empresa paga y no es mercadería. Las pestañas responden
 * las preguntas de todos los días: qué se cargó, qué hay que pagar, qué se
 * repite todos los meses, en qué rubros y en qué se va la plata.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { comprasApi, ESTADOS_GASTO, TIPOS_DOC_GASTO, FRECUENCIAS, money, fecha, hoyISO } from "../abastecimiento/api/comprasApi";
import GastoForm from "./components/GastoForm";
import PagoProveedorModal from "../abastecimiento/components/PagoProveedorModal";

const TABS = [{ key: "gastos", label: "Gastos", permiso: "gastos.gastos,gastos.pagos,gastos.resumen" }, { key: "pagar", label: "Cuentas a pagar", permiso: "gastos.pagos" }, { key: "fijos", label: "Gastos fijos", permiso: "gastos.fijos" }, { key: "rubros", label: "Rubros", permiso: "gastos.categorias" }, { key: "resumen", label: "Resumen", permiso: "gastos.resumen" }];
const mesActual = () => hoyISO().slice(0, 7);
const inicioMes = () => `${mesActual()}-01`;
const dias = (n) => (n == null ? <span className="text-tertiary">sin fecha</span> : n < 0 ? <span style={{ color: "var(--color-danger, #d32f2f)", fontWeight: 600 }}>vencido hace {-n} d</span> : n === 0 ? <strong>vence hoy</strong> : `en ${n} d`);

const Gastos = () => {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { showToast } = useToast();
  const { can, esJefe } = useAuth();
  const qc = useQueryClient();
  const tabs = TABS.filter((t) => can(...t.permiso.split(",")));
  const tabKey = sp.get("tab") || tabs[0]?.key || "gastos";
  const setTab = (k) => setSp({ tab: k });
  const [f, setF] = useState({ desde: inicioMes(), hasta: "", categoriaId: "", estado: "", q: "" });
  const [modal, setModal] = useState(null);
  const [periodo, setPeriodo] = useState(mesActual());

  const boot = useQuery({ queryKey: ["gastos", "bootstrap"], queryFn: comprasApi.gastos.bootstrap, staleTime: 60_000 });
  const pendientes = useQuery({ queryKey: ["gastos", "pendientes"], queryFn: comprasApi.gastos.pendientes, enabled: can("gastos.gastos", "gastos.pagos") });
  const params = useMemo(() => ({ desde: f.desde || undefined, hasta: f.hasta || undefined, categoriaId: f.categoriaId || undefined, estado: f.estado || undefined, q: f.q || undefined, limit: 500 }), [f]);
  const lista = useQuery({ queryKey: ["gastos", "lista", params], queryFn: () => comprasApi.gastos.listar(params), enabled: tabKey === "gastos", placeholderData: (prev) => prev });
  const aPagar = useQuery({ queryKey: ["gastos", "cuentas-a-pagar"], queryFn: () => comprasApi.gastos.cuentasAPagar(), enabled: tabKey === "pagar" });
  const resumen = useQuery({ queryKey: ["gastos", "resumen", f.desde, f.hasta], queryFn: () => comprasApi.gastos.resumen({ desde: f.desde || undefined, hasta: f.hasta || undefined }), enabled: tabKey === "resumen" });
  const recurrentes = useQuery({ queryKey: ["gastos", "recurrentes"], queryFn: comprasApi.gastos.recurrentes, enabled: tabKey === "fijos" });
  const previa = useQuery({ queryKey: ["gastos", "previa", periodo], queryFn: () => comprasApi.gastos.previaPeriodo(periodo), enabled: tabKey === "fijos" && /^\d{4}-\d{2}$/.test(periodo) });
  const invalidar = () => { qc.invalidateQueries({ queryKey: ["gastos"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["caja"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mGenerar = useMutation({ mutationFn: (ids) => comprasApi.gastos.generarPeriodo(periodo, ids), onSuccess: (r) => { showToast(`${r.creados} gasto(s) generado(s) para ${periodo}.`, "success"); invalidar(); }, onError: err });
  const mRec = useMutation({ mutationFn: ({ id, ...b }) => (id ? comprasApi.gastos.editarRecurrente(id, b) : comprasApi.gastos.crearRecurrente(b)), onSuccess: () => { showToast("Gasto fijo guardado.", "success"); setModal(null); invalidar(); }, onError: err });
  const mBorrarRec = useMutation({ mutationFn: (id) => comprasApi.gastos.borrarRecurrente(id), onSuccess: () => { showToast("Plantilla borrada; los gastos ya generados quedan.", "info"); invalidar(); }, onError: err });
  const mCat = useMutation({ mutationFn: ({ id, ...b }) => (id ? comprasApi.gastos.editarCategoria(id, b) : comprasApi.gastos.crearCategoria(b)), onSuccess: () => { showToast("Rubro guardado.", "success"); setModal(null); invalidar(); }, onError: err });
  const mBorrarCat = useMutation({ mutationFn: (id) => comprasApi.gastos.borrarCategoria(id), onSuccess: () => { showToast("Rubro borrado.", "info"); invalidar(); }, onError: err });
  const puedeCargar = can("gastos.gastos");
  const puedePagar = can("gastos_pagar", "gastos_pagar_proveedor", "ventas.caja");

  const rows = lista.data || [];
  const totalFiltro = rows.filter((g) => g.estado !== "anulado").reduce((a, g) => a + g.total, 0);

  const colsGasto = [
    { field: "fecha", headerName: "Fecha", renderCell: (g) => <span className="nowrap">{fecha(g.fecha)}</span> },
    { field: "descripcion", headerName: "Gasto", renderCell: (g) => <Box><strong>{g.descripcion || `Gasto #${g.id}`}</strong><Typography variant="caption" display="block" color="text.secondary">{TIPOS_DOC_GASTO[g.tipoDoc]} {g.letra}{g.numero ? ` ${g.numero}` : ""} · {g.proveedorNombre || "sin proveedor"}</Typography></Box> },
    { field: "categoriaNombre", headerName: "Rubro", renderCell: (g) => <span>{g.categoriaNombre}{esJefe && g.sucursalNombre ? <Typography variant="caption" display="block" color="text.secondary">{g.sucursalNombre}</Typography> : null}</span> },
    { field: "total", headerName: "Total", align: "right", renderCell: (g) => <strong>{money(g.total)}</strong> },
    { field: "saldo", headerName: "Saldo", align: "right", renderCell: (g) => (g.estado === "anulado" ? <span className="text-tertiary">—</span> : g.saldo > 0.009 ? <span style={{ color: "var(--color-warning, #ed6c02)", fontWeight: 600 }}>{money(g.saldo)}</span> : <span className="text-tertiary">pagado</span>) },
    { field: "estado", headerName: "Estado", renderCell: (g) => <StatusBadge tone={ESTADOS_GASTO[g.estado]?.tone} label={ESTADOS_GASTO[g.estado]?.label} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Gastos" subtitle="Todo lo que se paga y no es mercadería: alquiler, servicios, fletes, el plomero. Se carga el comprobante, se imputa a un rubro y se paga."
        actions={<Tooltip title={puedeCargar ? "" : "Tu rol no carga gastos."}><span><Button variant="primary" startIcon={<AddIcon />} disabled={!puedeCargar} onClick={() => setModal({ gasto: null })}>Nuevo gasto</Button></span></Tooltip>} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Por pagar" value={money(pendientes.data?.saldo || 0)} hint={`${pendientes.data?.pendientes || 0} gasto(s) con saldo`} icon={<PaymentsOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Vencidos" value={String(pendientes.data?.vencidos || 0)} hint="vencieron o vencen hoy" icon={<PendingActionsOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title={tabKey === "gastos" ? "Total del filtro" : "Gastos fijos"} value={tabKey === "gastos" ? money(totalFiltro) : String((boot.data?.recurrentes || []).filter((r) => r.activo).length)} hint={tabKey === "gastos" ? `${rows.length} gasto(s)` : "plantillas activas"} icon={tabKey === "gastos" ? <ReceiptLongOutlinedIcon /> : <RepeatOutlinedIcon />} /></Grid>
      </Grid>
      <Box className="table-tabs">
        <Tabs value={Math.max(0, tabs.findIndex((t) => t.key === tabKey))} onChange={(_, v) => setTab(tabs[v].key)}>{tabs.map((t) => <Tab key={t.key} label={t.label} />)}</Tabs>
        {(tabKey === "gastos" || tabKey === "resumen") && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <TextField size="small" type="date" label="Desde" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Hasta" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            {tabKey === "gastos" && (<>
              <TextField select size="small" label="Rubro" value={f.categoriaId} onChange={(e) => setF({ ...f, categoriaId: e.target.value })} sx={{ minWidth: 160 }}><MenuItem value="">Todos</MenuItem>{(boot.data?.categorias || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
              <TextField select size="small" label="Estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} sx={{ minWidth: 130 }}><MenuItem value="">Todos</MenuItem>{Object.entries(ESTADOS_GASTO).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField>
              <TextField size="small" placeholder="Buscar…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            </>)}
          </Box>
        )}
      </Box>

      {tabKey === "gastos" && <DataTable columns={colsGasto} data={rows} loading={lista.isLoading} emptyMessage="Sin gastos con ese filtro." onRowClick={(g) => navigate(`/finanzas/gastos/${g.id}`)} pagination={{ pageSize: 25 }} />}

      {tabKey === "pagar" && (
        <DataTable columns={[
          { field: "vencimiento", headerName: "Vence", renderCell: (g) => <Box><strong>{fecha(g.vencimiento)}</strong><Typography variant="caption" display="block">{dias(g.dias)}</Typography></Box> },
          ...colsGasto.filter((c) => ["descripcion", "categoriaNombre", "total", "saldo"].includes(c.field)),
          { field: "acciones", headerName: "", sortable: false, renderCell: (g) => (puedePagar ? <Button size="small" variant="primary" onClick={(e) => { e.stopPropagation(); setModal({ pagar: g }); }}>Pagar</Button> : null) },
        ]} data={aPagar.data || []} loading={aPagar.isLoading} emptyMessage="Nada por pagar." onRowClick={(g) => navigate(`/finanzas/gastos/${g.id}`)} pagination={{ pageSize: 25 }} />
      )}

      {tabKey === "fijos" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Card className="entity-card">
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
              <Typography className="card-title">Generar el período</Typography>
              <TextField size="small" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
              <Button size="small" variant="primary" loading={mGenerar.isPending} disabled={!previa.data?.pendientes?.length} onClick={() => mGenerar.mutate(undefined)}>Generar {previa.data?.pendientes?.length || 0} pendiente(s)</Button>
              <Typography variant="caption" color="text.secondary">Idempotente: lo que ya está emitido no se repite. El importe es el estimado hasta que llegue el papel.</Typography>
            </Box>
            {(previa.data?.pendientes || []).map((x) => <Typography key={x.plantilla.id} variant="body2">• {x.plantilla.nombre} · {money(x.plantilla.importeEstimado)} · vence {fecha(x.vencimiento)}</Typography>)}
            {(previa.data?.emitidos || []).map((x) => <Typography key={x.gastoId} variant="body2" color="text.secondary">✓ {x.plantilla.nombre} ya generado ({fecha(x.fecha)}) — <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate(`/finanzas/gastos/${x.gastoId}`)}>ver</span></Typography>)}
          </Card>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button variant="secondary" startIcon={<AddIcon />} onClick={() => setModal({ rec: { nombre: "", categoriaId: "", proveedorId: "", sucursalId: "", importeEstimado: "", frecuencia: "mensual", diaVencimiento: 10, activo: true, observaciones: "" } })}>Nuevo gasto fijo</Button></Box>
          <DataTable columns={[
            { field: "nombre", headerName: "Gasto fijo", renderCell: (r) => <Box><strong>{r.nombre}</strong><Typography variant="caption" display="block" color="text.secondary">{r.categoriaNombre}{r.proveedorNombre ? ` · ${r.proveedorNombre}` : ""}</Typography></Box> },
            { field: "frecuencia", headerName: "Cada", renderCell: (r) => FRECUENCIAS[r.frecuencia] }, { field: "diaVencimiento", headerName: "Vence el", align: "right", renderCell: (r) => `día ${r.diaVencimiento}` },
            { field: "importeEstimado", headerName: "Estimado", align: "right", renderCell: (r) => money(r.importeEstimado) },
            { field: "activo", headerName: "Estado", renderCell: (r) => <StatusBadge tone={r.activo ? "success" : "neutral"} label={r.activo ? "Activo" : "Pausado"} /> },
            { field: "acciones", headerName: "", sortable: false, renderCell: (r) => <Box sx={{ display: "flex", gap: 0.5 }}><Button size="small" variant="ghost" onClick={() => setModal({ rec: { ...r, importeEstimado: String(r.importeEstimado), proveedorId: r.proveedorId || "", sucursalId: r.sucursalId || "", observaciones: r.observaciones || "" } })}>Editar</Button><Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Borrar la plantilla?")) mBorrarRec.mutate(r.id); }}>Borrar</Button></Box> },
          ]} data={recurrentes.data || []} loading={recurrentes.isLoading} emptyMessage="Sin gastos fijos: alquiler, internet, seguro…" />
        </Box>
      )}

      {tabKey === "rubros" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button variant="secondary" startIcon={<AddIcon />} onClick={() => setModal({ cat: { nombre: "", tipo: "variable", descripcion: "", activa: true, orden: 500 } })}>Nuevo rubro</Button></Box>
          <DataTable columns={[
            { field: "nombre", headerName: "Rubro", renderCell: (c) => <Box><strong>{c.nombre}</strong>{c.descripcion && <Typography variant="caption" display="block" color="text.secondary">{c.descripcion}</Typography>}</Box> },
            { field: "tipo", headerName: "Tipo", renderCell: (c) => <StatusBadge tone={c.tipo === "fijo" ? "info" : "neutral"} label={c.tipo} showDot={false} /> }, { field: "orden", headerName: "Orden", align: "right" },
            { field: "activa", headerName: "Estado", renderCell: (c) => <StatusBadge tone={c.activa ? "success" : "neutral"} label={c.activa ? "Activo" : "De baja"} /> },
            { field: "acciones", headerName: "", sortable: false, renderCell: (c) => <Box sx={{ display: "flex", gap: 0.5 }}><Button size="small" variant="ghost" onClick={() => setModal({ cat: { ...c } })}>Editar</Button><Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Borrar el rubro? Con gastos imputados no se borra: se da de baja.")) mBorrarCat.mutate(c.id); }}>Borrar</Button></Box> },
          ]} data={boot.data?.categorias || []} loading={boot.isLoading} emptyMessage="Sin rubros." />
        </Box>
      )}

      {tabKey === "resumen" && resumen.data && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Total del período" value={money(resumen.data.total)} hint={`${resumen.data.cantidad} gasto(s)`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Fijos / variables" value={money(resumen.data.porTipo.fijos)} hint={`variables ${money(resumen.data.porTipo.variables)}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="IVA (crédito fiscal)" value={money(resumen.data.iva)} hint={`neto ${money(resumen.data.neto)}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Pagado / saldo" value={money(resumen.data.pagado)} hint={`falta ${money(resumen.data.saldo)}`} /></Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><Card className="entity-card"><Typography className="card-title" sx={{ mb: 1 }}>Por rubro</Typography><DataTable columns={[{ field: "nombre", headerName: "Rubro" }, { field: "cantidad", headerName: "N", align: "right" }, { field: "total", headerName: "Total", align: "right", renderCell: (c) => <strong>{money(c.total)}</strong> }]} data={resumen.data.porCategoria} emptyMessage="Sin datos." /></Card></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Card className="entity-card"><Typography className="card-title" sx={{ mb: 1 }}>Por proveedor</Typography><DataTable columns={[{ field: "nombre", headerName: "Proveedor" }, { field: "cantidad", headerName: "N", align: "right" }, { field: "total", headerName: "Total", align: "right", renderCell: (c) => <strong>{money(c.total)}</strong> }]} data={resumen.data.porProveedor} emptyMessage="Sin datos." /></Card></Grid>
            <Grid size={{ xs: 12 }}><Card className="entity-card"><Typography className="card-title" sx={{ mb: 1 }}>Por mes</Typography><DataTable columns={[{ field: "mes", headerName: "Mes" }, { field: "total", headerName: "Total", align: "right", renderCell: (c) => <strong>{money(c.total)}</strong> }]} data={resumen.data.porMes} emptyMessage="Sin datos." /></Card></Grid>
          </Grid>
        </Box>
      )}

      <GastoForm open={modal !== null && "gasto" in modal} onClose={() => setModal(null)} gasto={modal?.gasto} boot={boot.data} onListo={(g) => { if (!modal?.gasto) navigate(`/finanzas/gastos/${g.id}`); }} />
      <PagoProveedorModal open={Boolean(modal?.pagar)} onClose={() => setModal(null)} proveedores={boot.data?.proveedores || []} fijo={modal?.pagar ? { proveedorId: modal.pagar.proveedorId || undefined, destino: "gastos", doc: { tipo: "gasto", docId: modal.pagar.id, etiqueta: modal.pagar.descripcion || `Gasto #${modal.pagar.id}`, saldo: modal.pagar.saldo } } : {}} onListo={invalidar} />

      <Modal open={Boolean(modal?.rec)} onClose={() => setModal(null)} title={modal?.rec?.id ? "Editar gasto fijo" : "Nuevo gasto fijo"} subtitle="No es un gasto todavía: es el recordatorio de que va a llegar."
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mRec.isPending} onClick={() => mRec.mutate({ ...modal.rec, categoriaId: Number(modal.rec.categoriaId), proveedorId: modal.rec.proveedorId ? Number(modal.rec.proveedorId) : null, sucursalId: modal.rec.sucursalId ? Number(modal.rec.sucursalId) : null, importeEstimado: Number(modal.rec.importeEstimado) || 0, diaVencimiento: Number(modal.rec.diaVencimiento) || 10 })}>Guardar</Button></>)}>
        {modal?.rec && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, pt: 1 }}>
            <TextField size="small" label="Nombre" value={modal.rec.nombre} onChange={(e) => setModal({ rec: { ...modal.rec, nombre: e.target.value } })} autoFocus />
            <TextField select size="small" label="Rubro" value={modal.rec.categoriaId} onChange={(e) => setModal({ rec: { ...modal.rec, categoriaId: e.target.value } })}>{(boot.data?.categorias || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
            <TextField select size="small" label="Proveedor" value={modal.rec.proveedorId} onChange={(e) => setModal({ rec: { ...modal.rec, proveedorId: e.target.value } })}><MenuItem value="">—</MenuItem>{(boot.data?.proveedores || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}</TextField>
            <TextField select size="small" label="Sucursal" value={modal.rec.sucursalId} onChange={(e) => setModal({ rec: { ...modal.rec, sucursalId: e.target.value } })}><MenuItem value="">Toda la empresa</MenuItem>{(boot.data?.sucursales || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}</TextField>
            <TextField size="small" type="number" label="Importe estimado" value={modal.rec.importeEstimado} onChange={(e) => setModal({ rec: { ...modal.rec, importeEstimado: e.target.value } })} />
            <TextField select size="small" label="Frecuencia" value={modal.rec.frecuencia} onChange={(e) => setModal({ rec: { ...modal.rec, frecuencia: e.target.value } })}>{Object.entries(FRECUENCIAS).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}</TextField>
            <TextField size="small" type="number" label="Día de vencimiento" value={modal.rec.diaVencimiento} onChange={(e) => setModal({ rec: { ...modal.rec, diaVencimiento: e.target.value } })} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Switch checked={modal.rec.activo !== false} onChange={(e) => setModal({ rec: { ...modal.rec, activo: e.target.checked } })} /><Typography variant="body2">Activo</Typography></Box>
            <TextField size="small" label="Observaciones" value={modal.rec.observaciones} onChange={(e) => setModal({ rec: { ...modal.rec, observaciones: e.target.value } })} sx={{ gridColumn: "1 / -1" }} />
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(modal?.cat)} onClose={() => setModal(null)} title={modal?.cat?.id ? "Editar rubro" : "Nuevo rubro"}
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mCat.isPending} onClick={() => mCat.mutate({ ...modal.cat, orden: Number(modal.cat.orden) || 500 })}>Guardar</Button></>)}>
        {modal?.cat && (
          <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 2, pt: 1 }}>
            <TextField size="small" label="Nombre" value={modal.cat.nombre} onChange={(e) => setModal({ cat: { ...modal.cat, nombre: e.target.value } })} autoFocus />
            <TextField select size="small" label="Tipo" value={modal.cat.tipo} onChange={(e) => setModal({ cat: { ...modal.cat, tipo: e.target.value } })}><MenuItem value="fijo">Fijo</MenuItem><MenuItem value="variable">Variable</MenuItem></TextField>
            <TextField size="small" type="number" label="Orden" value={modal.cat.orden} onChange={(e) => setModal({ cat: { ...modal.cat, orden: e.target.value } })} />
            <TextField size="small" label="Descripción" value={modal.cat.descripcion || ""} onChange={(e) => setModal({ cat: { ...modal.cat, descripcion: e.target.value } })} sx={{ gridColumn: "1 / 3" }} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Checkbox checked={modal.cat.activa !== false} onChange={(e) => setModal({ cat: { ...modal.cat, activa: e.target.checked } })} /><Typography variant="body2">Activo</Typography></Box>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Gastos;
