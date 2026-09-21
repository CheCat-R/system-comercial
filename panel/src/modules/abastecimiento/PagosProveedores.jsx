/**
 * PAGOS A PROVEEDORES — la bandeja. Lo que se pagó y todavía no se aplicó a
 * nada (el contador que mira el dueño), y el historial completo. Registrar un
 * pago es el mismo modal desde cualquier pantalla; aplicarlo se hace acá o
 * desde el documento.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Checkbox from "@mui/material/Checkbox";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi } from "./api/proveedoresApi";
import { comprasApi, MEDIOS_PAGO_PROV, money, stamp, r2 } from "./api/comprasApi";
import PagoProveedorModal from "./components/PagoProveedorModal";
import "./Compras.css";

const TABS = [{ key: "sinAplicar", label: "Sin aplicar" }, { key: "todos", label: "Todos" }, { key: "fletes", label: "Fletes" }, { key: "anulados", label: "Anulados" }];

/** Aplicar un pago que ya existe a los documentos con saldo de su proveedor. */
const AplicarModal = ({ pago, onClose, onListo }) => {
  const { showToast } = useToast();
  const [sel, setSel] = useState({});
  const pend = useQuery({ queryKey: ["pagos", "pendientes", pago.proveedorId, pago.destino], queryFn: () => comprasApi.pagos.pendientes(pago.proveedorId, pago.destino) });
  const aplicado = r2(Object.values(sel).reduce((a, v) => a + (Number(v) || 0), 0));
  const m = useMutation({ mutationFn: (imps) => comprasApi.pagos.imputar(pago.id, imps), onSuccess: () => { showToast("Pago aplicado.", "success"); onListo(); onClose(); }, onError: (e) => showToast(e?.message || "No se pudo aplicar.", "error") });
  return (
    <Modal open onClose={onClose} title={`Aplicar pago #${pago.id}`} subtitle={`${pago.proveedorNombre} · ${money(pago.saldo)} sin aplicar`} maxWidth="md"
      actions={(<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} disabled={aplicado <= 0 || aplicado - pago.saldo > 0.009} onClick={() => m.mutate(Object.entries(sel).filter(([, v]) => Number(v) > 0).map(([k, v]) => { const [t, id] = k.split(":"); return t === "gasto" ? { gastoId: Number(id), importe: r2(v) } : { comprobanteId: Number(id), importe: r2(v) }; }))}>Aplicar {money(aplicado)}</Button></>)}>
      <Box sx={{ display: "grid", gap: 1, pt: 1 }}>
        {(pend.data || []).length === 0 && <Typography color="text.secondary">Este proveedor no tiene {pago.destino === "gastos" ? "gastos" : "facturas"} con saldo.</Typography>}
        {(pend.data || []).map((d) => { const k = `${d.tipo}:${d.docId}`; const on = sel[k] !== undefined; return (
          <Box key={k} sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 1, alignItems: "center" }}>
            <Checkbox size="small" checked={on} onChange={(e) => setSel((s) => { const n = { ...s }; if (e.target.checked) n[k] = r2(Math.min(d.saldo, Math.max(0, pago.saldo - aplicado))) || d.saldo; else delete n[k]; return n; })} />
            <Box><strong>{d.etiqueta}</strong><Typography variant="caption" display="block" color="text.secondary">{d.detalle || ""}</Typography></Box>
            <Typography variant="body2" color="text.secondary">saldo {money(d.saldo)}</Typography>
            <TextField size="small" type="number" value={on ? sel[k] : ""} disabled={!on} onChange={(e) => setSel({ ...sel, [k]: e.target.value })} sx={{ width: 130 }} />
          </Box>
        ); })}
      </Box>
    </Modal>
  );
};

const PagosProveedores = () => {
  const { showToast } = useToast();
  const { can, esJefe } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [proveedorId, setProveedorId] = useState("");
  const [modal, setModal] = useState(null);
  const puedeImputar = can("gastos_imputar", "gastos.pagos_proveedor", "compras.pagos");

  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });
  const params = useMemo(() => {
    const k = TABS[tab].key;
    return { proveedorId: proveedorId || undefined, sinAplicar: k === "sinAplicar" ? "true" : undefined, esFlete: k === "fletes" ? "true" : undefined, estado: k === "anulados" ? "anulado" : (k === "sinAplicar" ? undefined : "activo"), limit: 500 };
  }, [tab, proveedorId]);
  const lista = useQuery({ queryKey: ["pagos", "lista", params], queryFn: () => comprasApi.pagos.listar(params), placeholderData: (prev) => prev });
  const sinAplicar = useQuery({ queryKey: ["pagos", "sin-aplicar"], queryFn: () => comprasApi.pagos.sinAplicar() });
  const invalidar = () => { qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["gastos"] }); qc.invalidateQueries({ queryKey: ["edoc"] }); qc.invalidateQueries({ queryKey: ["caja"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mAnular = useMutation({ mutationFn: ({ id, motivo }) => comprasApi.pagos.anular(id, motivo), onSuccess: () => { showToast("Pago anulado.", "info"); invalidar(); }, onError: err });
  const mDestino = useMutation({ mutationFn: ({ id, destino }) => comprasApi.pagos.destino(id, destino), onSuccess: () => { showToast("Destino corregido.", "success"); invalidar(); }, onError: err });
  const mDesimputar = useMutation({ mutationFn: (impId) => comprasApi.pagos.desimputar(impId), onSuccess: () => { showToast("Desaplicado.", "success"); invalidar(); }, onError: err });

  const rows = lista.data || [];
  const totalFiltro = rows.reduce((a, p) => a + (p.estado === "activo" ? p.importe : 0), 0);
  const fletes = rows.filter((p) => p.esFlete && p.estado === "activo").reduce((a, p) => a + p.importe, 0);

  const columns = [
    { field: "fecha", headerName: "Fecha", renderCell: (p) => <span className="nowrap">{stamp(p.fecha)}</span> },
    { field: "id", headerName: "Pago", renderCell: (p) => <Box><strong>#{p.id} · {p.formas?.length > 1 ? `mixto (${p.formas.map((f) => MEDIOS_PAGO_PROV[f.medio] || f.medio).join(" + ")})` : (MEDIOS_PAGO_PROV[p.medio] || p.medio)}</strong><Typography variant="caption" display="block" color="text.secondary">{p.concepto || "—"}{p.referencia ? ` · ${p.referencia}` : ""}</Typography></Box> },
    { field: "proveedorNombre", headerName: "Proveedor" },
    { field: "destino", headerName: "Destino", renderCell: (p) => <StatusBadge tone={p.destino === "gastos" ? "neutral" : "info"} label={p.destino === "gastos" ? "Gastos" : "Mercadería"} showDot={false} /> },
    { field: "sucursalNombre", headerName: "De dónde", renderCell: (p) => <span className="text-tertiary">{p.cajaSesionId ? `caja #${p.cajaSesionId} · ` : ""}{p.sucursalNombre || "administración"}{esJefe && p.usuarioNombre ? ` · ${p.usuarioNombre}` : ""}</span> },
    { field: "importe", headerName: "Importe", align: "right", renderCell: (p) => <strong>{money(p.importe)}</strong> },
    { field: "saldo", headerName: "Sin aplicar", align: "right", renderCell: (p) => (p.estado !== "activo" ? <span className="text-tertiary">—</span> : p.saldo > 0.009 ? <span className="compras-num compras-num--saldo">{money(p.saldo)}</span> : <span className="text-tertiary">aplicado</span>) },
    { field: "imputadoA", headerName: "Aplicado a", sortable: false, renderCell: (p) => <span className="text-tertiary">{(p.imputadoA || []).map((x) => x.etiqueta).join(", ") || "—"}</span> },
    { field: "acciones", headerName: "", sortable: false, renderCell: (p) => (p.estado === "activo" ? (
      <Box sx={{ display: "flex", gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
        {puedeImputar && p.saldo > 0.009 && p.proveedorId && <Button size="small" variant="secondary" onClick={() => setModal({ aplicar: p })}>Aplicar</Button>}
        {puedeImputar && p.aplicado <= 0.009 && <Button size="small" variant="ghost" onClick={() => mDestino.mutate({ id: p.id, destino: p.destino === "gastos" ? "mercaderia" : "gastos" })}>→ {p.destino === "gastos" ? "mercadería" : "gastos"}</Button>}
        {puedeImputar && p.aplicado > 0.009 && (p.imputadoA || []).map((x) => <Button key={x.imputacionId} size="small" variant="ghost" onClick={() => { if (window.confirm(`¿Desaplicar ${money(x.importe)} de ${x.etiqueta}?`)) mDesimputar.mutate(x.imputacionId); }}>Desaplicar</Button>)}
        {p.aplicado <= 0.009 && <Button size="small" variant="danger" onClick={() => { const m = window.prompt("Motivo de la anulación:"); if (m !== null) mAnular.mutate({ id: p.id, motivo: m }); }}>Anular</Button>}
      </Box>
    ) : null) },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Pagos a proveedores" subtitle="Toda la plata que sale hacia un proveedor, salga del cajón de la sucursal o de administración. Un pago sin aplicar es un crédito contra el proveedor, no un gasto."
        actions={<Tooltip title=""><span><Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({ nuevo: true })}>Registrar pago</Button></span></Tooltip>} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Sin aplicar" value={money(sinAplicar.data?.total || 0)} hint={`${sinAplicar.data?.cantidad || 0} pago(s) esperan su factura`} icon={<PaymentsOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Total del filtro" value={money(totalFiltro)} hint={`${rows.length} pago(s)`} icon={<ReceiptLongOutlinedIcon />} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard title="Fletes adelantados" value={money(fletes)} hint="en el filtro" icon={<LocalShippingOutlinedIcon />} /></Grid>
      </Grid>
      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>{TABS.map((t) => <Tab key={t.key} label={t.label} />)}</Tabs>
        <TextField select size="small" label="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Todos</MenuItem>{(proveedores.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}
        </TextField>
      </Box>
      <DataTable columns={columns} data={rows} loading={lista.isLoading} emptyMessage="Sin pagos con ese filtro." pagination={{ pageSize: 25 }} />

      <PagoProveedorModal open={Boolean(modal?.nuevo)} onClose={() => setModal(null)} proveedores={proveedores.data || []} onListo={invalidar} />
      {modal?.aplicar && <AplicarModal pago={modal.aplicar} onClose={() => setModal(null)} onListo={invalidar} />}
    </Box>
  );
};

export default PagosProveedores;
