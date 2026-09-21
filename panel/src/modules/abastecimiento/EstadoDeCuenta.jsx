/**
 * EL MAYOR DE UN PROVEEDOR: cada factura, gasto, nota, pago y ajuste al DEBE
 * o al HABER, desde cuándo arrastra deuda (FIFO), los documentos con saldo
 * para pagar, sus compromisos y la conciliación.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi } from "./api/proveedoresApi";
import { comprasApi, money, fecha, stamp, hoyISO } from "./api/comprasApi";
import PagoProveedorModal from "./components/PagoProveedorModal";
import "./Compras.css";

const KIND = { comprobante: "Factura", nc: "Nota de crédito", gasto: "Gasto", pago: "Pago", ajuste_debe: "Ajuste", ajuste_haber: "Ajuste" };

const EstadoDeCuenta = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null);
  const q = useQuery({ queryKey: ["edoc", Number(id)], queryFn: () => comprasApi.edoc.proveedor(id) });
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });
  const d = q.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (d?.proveedor?.nombre) setLabel(id, d.proveedor.nombre); }, [id, d?.proveedor?.nombre, setLabel]);
  const invalidar = () => { qc.invalidateQueries({ queryKey: ["edoc"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["gastos"] }); qc.invalidateQueries({ queryKey: QK.proveedor(id) }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mAjuste = useMutation({ mutationFn: (b) => comprasApi.edoc.ajuste(b), onSuccess: () => { showToast("Ajuste registrado.", "success"); setModal(null); invalidar(); }, onError: err });
  const mBorrarAjuste = useMutation({ mutationFn: (aid) => comprasApi.edoc.borrarAjuste(aid), onSuccess: () => { showToast("Ajuste borrado.", "info"); invalidar(); }, onError: err });
  const mConciliar = useMutation({ mutationFn: (des) => (des ? comprasApi.edoc.desconciliar(id) : comprasApi.edoc.conciliar(id)), onSuccess: () => { showToast("Conciliación actualizada.", "success"); invalidar(); }, onError: err });
  const mAnularPago = useMutation({ mutationFn: (pid) => comprasApi.pagos.anular(pid, "desde el estado de cuenta"), onSuccess: () => { showToast("Pago anulado.", "info"); invalidar(); }, onError: err });
  const puedePagar = can("compras.pagos", "gastos.pagos_proveedor", "ventas.caja");

  if (q.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!d) return <Box className="page"><Typography>Proveedor inexistente.</Typography></Box>;
  const p = d.proveedor;
  // El mayor mezcla ids de tablas distintas: la clave de fila es kind+id y el id original queda en docId.
  const movs = d.movs.map((m) => ({ ...m, docId: m.id, id: `${m.kind}-${m.id}` }));

  return (
    <Box className="page fade-in">
      <EntityHeader eyebrow={`Estado de cuenta${p.cuit ? ` · CUIT ${p.cuit}` : ""}`} title={p.nombre} subtitle={`${p.diasPago ? `${p.diasPago} días de plazo` : "sin plazo"} · ${p.modoCuenta === "libre" ? "cuenta libre" : "por facturas"}${p.medioHabitual ? ` · paga con ${p.medioHabitual}` : ""}`}
        badges={<>{d.saldo > 0.009 ? <StatusBadge tone="warning" label={`debe ${money(d.saldo)}`} /> : d.saldo < -0.009 ? <StatusBadge tone="info" label={`a favor ${money(-d.saldo)}`} /> : <StatusBadge tone="success" label="al día" />}{p.conciliadoHasta && <StatusBadge tone="neutral" label={`conciliado ${fecha(p.conciliadoHasta)}`} showDot={false} />}</>}
        onBack={() => navigate("/abastecimiento/cuentas")}
        actions={(
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="ghost" onClick={() => navigate(`/abastecimiento/proveedores/${id}`)}>Ficha</Button>
            <Button size="small" variant="secondary" onClick={() => setModal({ ajuste: { tipo: "haber", monto: "", motivo: "", fecha: hoyISO() } })}>Ajuste</Button>
            <Button size="small" variant="secondary" loading={mConciliar.isPending} onClick={() => mConciliar.mutate(Boolean(p.conciliadoHasta))}>{p.conciliadoHasta ? "Desconciliar" : "Conciliar hasta hoy"}</Button>
            {puedePagar && <Button size="small" variant="primary" onClick={() => setModal({ pagar: true })}>Registrar pago</Button>}
          </Box>
        )} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Debe" value={money(d.totDebe)} hint={`mercadería ${money(d.totales.mercaderia)} · gastos ${money(d.totales.gastos)}`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Haber" value={money(d.totHaber)} hint={`pagos ${money(d.totales.pagos)}${d.totales.fletes ? ` (fletes ${money(d.totales.fletes)})` : ""} · NC ${money(d.totales.notasCredito)}`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Saldo" value={money(d.saldo)} hint={d.deudaDesde ? `arrastra deuda desde ${fecha(d.deudaDesde)}` : "sin deuda"} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Pagos sin aplicar" value={money(d.pagosSinAplicar)} hint={`${d.docsPendientes.length} documento(s) con saldo`} /></Grid>
      </Grid>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}><Tab label="Mayor" /><Tab label={`Documentos con saldo (${d.docsPendientes.length})`} /><Tab label={`Compromisos (${d.compromisos.length})`} /><Tab label={`Cuentas bancarias (${d.cuentas.length})`} /></Tabs>

      {tab === 0 && (
        <DataTable columns={[
          { field: "fecha", headerName: "Fecha", renderCell: (m) => <span className="nowrap">{fecha(m.fecha)}</span> },
          { field: "etiqueta", headerName: "Movimiento", renderCell: (m) => <Box><strong>{m.etiqueta}</strong><Typography variant="caption" display="block" color="text.secondary">{KIND[m.kind]}{m.detalle ? ` · ${m.detalle}` : ""}{m.kind === "pago" ? ` · ${m.sucursalNombre || "administración"}${m.usuarioNombre ? ` · ${m.usuarioNombre}` : ""}${m.sinAplicar > 0.009 ? ` · sin aplicar ${money(m.sinAplicar)}` : ""}` : ""}</Typography></Box> },
          { field: "debe", headerName: "Debe", align: "right", renderCell: (m) => (m.debe ? <span className="edoc-mov--debe">{money(m.debe)}</span> : <span className="text-tertiary">—</span>) },
          { field: "haber", headerName: "Haber", align: "right", renderCell: (m) => (m.haber ? <span className="edoc-mov--haber">{money(m.haber)}</span> : <span className="text-tertiary">—</span>) },
          { field: "saldoDoc", headerName: "Saldo doc.", align: "right", renderCell: (m) => (m.saldoDoc != null && m.saldoDoc > 0.009 ? <span className="compras-num--saldo">{money(m.saldoDoc)}</span> : <span className="text-tertiary">—</span>) },
          { field: "acciones", headerName: "", sortable: false, renderCell: (m) => (
            <Box onClick={(e) => e.stopPropagation()}>
              {(m.kind === "ajuste_debe" || m.kind === "ajuste_haber") && <Button size="small" variant="ghost" onClick={() => { if (window.confirm("¿Borrar el ajuste?")) mBorrarAjuste.mutate(m.docId); }}>Borrar</Button>}
              {m.kind === "pago" && m.aplicado <= 0.009 && <Button size="small" variant="ghost" onClick={() => { if (window.confirm("¿Anular el pago?")) mAnularPago.mutate(m.docId); }}>Anular</Button>}
            </Box>) },
        ]} data={movs} emptyMessage="Sin movimientos." pagination={{ pageSize: 50 }} onRowClick={(m) => { if (m.kind === "comprobante" || m.kind === "nc") navigate(`/abastecimiento/compras/${m.docId}`); if (m.kind === "gasto") navigate(`/finanzas/gastos/${m.docId}`); }} />
      )}
      {tab === 1 && (
        <DataTable columns={[
          { field: "fecha", headerName: "Fecha", renderCell: (x) => fecha(x.fecha) }, { field: "etiqueta", headerName: "Documento", renderCell: (x) => <Box><strong>{x.etiqueta}</strong><Typography variant="caption" display="block" color="text.secondary">{x.detalle || ""}</Typography></Box> },
          { field: "vencimiento", headerName: "Vence", renderCell: (x) => fecha(x.vencimiento) }, { field: "total", headerName: "Total", align: "right", renderCell: (x) => money(x.total) },
          { field: "pagado", headerName: "Pagado", align: "right", renderCell: (x) => money(x.pagado) }, { field: "saldo", headerName: "Saldo", align: "right", renderCell: (x) => <strong className="compras-num--saldo">{money(x.saldo)}</strong> },
          { field: "acciones", headerName: "", sortable: false, renderCell: (x) => (puedePagar ? <Button size="small" variant="primary" onClick={(e) => { e.stopPropagation(); setModal({ pagar: true, doc: x }); }}>Pagar</Button> : null) },
        ]} data={d.docsPendientes} emptyMessage="No debe nada." onRowClick={(x) => navigate(x.tipo === "gasto" ? `/finanzas/gastos/${x.docId}` : `/abastecimiento/compras/${x.docId}`)} />
      )}
      {tab === 2 && (
        <DataTable columns={[
          { field: "fechaVenc", headerName: "Vence", renderCell: (k) => fecha(k.fechaVenc) }, { field: "comprobanteEtiqueta", headerName: "Documento", renderCell: (k) => (k.comprobanteEtiqueta || "manual") + (k.cuota ? ` · cuota ${k.cuota}/${k.cuotas}` : "") },
          { field: "importe", headerName: "Importe", align: "right", renderCell: (k) => money(k.importe) }, { field: "esEcheq", headerName: "Cómo", renderCell: (k) => (k.esEcheq ? "echeq" : "a pagar") },
          { field: "diasRest", headerName: "Días", align: "right", renderCell: (k) => (k.diasRest < 0 ? <span style={{ color: "var(--color-danger, #d32f2f)" }}>vencido</span> : k.diasRest) },
        ]} data={d.compromisos} emptyMessage="Sin compromisos pendientes." onRowClick={() => navigate("/abastecimiento/vencimientos")} />
      )}
      {tab === 3 && (
        <Card className="entity-card">
          {d.cuentas.length === 0 && <Typography color="text.secondary">Sin cuentas cargadas. Se editan en la ficha del proveedor.</Typography>}
          {d.cuentas.map((c) => <Typography key={c.id} sx={{ fontFamily: "monospace" }}>{c.cbuAlias}{c.descripcion ? ` — ${c.descripcion}` : ""}</Typography>)}
        </Card>
      )}
      {movs.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>Último movimiento {stamp(movs[0].fecha)}.</Typography>}

      <PagoProveedorModal open={Boolean(modal?.pagar)} onClose={() => setModal(null)} proveedores={proveedores.data || []} fijo={{ proveedorId: Number(id), ...(modal?.doc ? { destino: modal.doc.tipo === "gasto" ? "gastos" : "mercaderia", doc: modal.doc } : {}) }} onListo={invalidar} />
      <Modal open={Boolean(modal?.ajuste)} onClose={() => setModal(null)} title="Ajuste manual" subtitle="Importe positivo siempre; el tipo pone el signo. El motivo es obligatorio: sin explicación no se audita."
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mAjuste.isPending} onClick={() => mAjuste.mutate({ proveedorId: Number(id), ...modal.ajuste, monto: Number(modal.ajuste.monto) })}>Registrar</Button></>)}>
        {modal?.ajuste && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, pt: 1 }}>
            <TextField select size="small" label="Tipo" value={modal.ajuste.tipo} onChange={(e) => setModal({ ajuste: { ...modal.ajuste, tipo: e.target.value } })}><MenuItem value="debe">Debe (suma deuda)</MenuItem><MenuItem value="haber">Haber (resta deuda)</MenuItem></TextField>
            <TextField size="small" type="number" label="Monto" value={modal.ajuste.monto} onChange={(e) => setModal({ ajuste: { ...modal.ajuste, monto: e.target.value } })} />
            <TextField size="small" type="date" label="Fecha" value={modal.ajuste.fecha} onChange={(e) => setModal({ ajuste: { ...modal.ajuste, fecha: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" label="Motivo" value={modal.ajuste.motivo} onChange={(e) => setModal({ ajuste: { ...modal.ajuste, motivo: e.target.value } })} sx={{ gridColumn: "1 / -1" }} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default EstadoDeCuenta;
