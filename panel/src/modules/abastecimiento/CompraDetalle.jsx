/**
 * El detalle de un comprobante de compra: el pie explicado, los renglones,
 * las notas que lo ajustan, los pagos que lo cancelaron (con su sucursal y
 * turno) y los compromisos. Desde acá: facturar un remito, pagar, anular.
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
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Alert from "@mui/material/Alert";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import DataTable from "../../components/DataTable/DataTable";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi } from "./api/proveedoresApi";
import { comprasApi, TIPOS_COMPROBANTE, ESTADOS_COMPROBANTE, LETRAS, MEDIOS_PAGO_PROV, money, num, fecha, stamp, hoyISO, r2 } from "./api/comprasApi";
import PagoProveedorModal from "./components/PagoProveedorModal";
import "./Compras.css";

const useAccion = (fn, ok, invalidar) => {
  const { showToast } = useToast();
  return useMutation({ mutationFn: fn, onSuccess: (r) => { showToast(typeof ok === "function" ? ok(r) : ok, "success"); invalidar(); }, onError: (e) => showToast(e?.message || "No se pudo.", "error") });
};

/** Llegó la factura del remito: número y letra del papel, precios reales por renglón, bonificación. El stock no se toca. */
const FacturarModal = ({ open, onClose, c, onFacturado }) => {
  const { showToast } = useToast();
  const [cab, setCab] = useState({ letra: "A", puntoVenta: c.puntoVenta, numero: "", fecha: hoyISO(), vencimientoPago: "", cae: "", bonificacion: "" });
  const [precios, setPrecios] = useState(Object.fromEntries((c.items || []).map((it) => [it.id, { costoUnitario: String(it.costoUnitario), descuento: String(it.descuento || ""), iva: String(it.iva) }])));
  const m = useMutation({ mutationFn: (b) => comprasApi.comprobantes.facturar(c.id, b), onSuccess: (r) => { showToast(`${r.etiqueta}: el remito pasó a ser la factura.`, "success"); onFacturado(); onClose(); }, onError: (e) => showToast(e?.message || "No se pudo facturar.", "error") });
  const total = (c.items || []).reduce((a, it) => { const p = precios[it.id]; const neto = it.cantidad * (Number(p.costoUnitario) || 0) * (1 - (Number(p.descuento) || 0) / 100); return a + neto * (1 + (Number(p.iva) || 0) / 100); }, 0) * (1 - (Number(cab.bonificacion) || 0) / 100);
  return (
    <Modal open={open} onClose={onClose} title={`Facturar ${c.etiqueta}`} subtitle="Producto y cantidad quedan como entraron al depósito; el papel trae número, letra y precios reales." maxWidth="md"
      actions={(<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ ...cab, numero: cab.numero ? Number(cab.numero) : undefined, vencimientoPago: cab.vencimientoPago || undefined, cae: cab.cae || undefined, bonificacion: Number(cab.bonificacion) || 0, items: Object.entries(precios).map(([itemId, p]) => ({ itemId: Number(itemId), costoUnitario: Number(p.costoUnitario) || 0, descuento: Number(p.descuento) || 0, iva: Number(p.iva) || 0 })) })}>Facturar ≈ {money(total)}</Button></>)}>
      <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "70px 110px 1fr 1fr 1fr 1fr", gap: 1 }}>
          <TextField select size="small" label="Letra" value={cab.letra} onChange={(e) => setCab({ ...cab, letra: e.target.value })}>{LETRAS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}</TextField>
          <TextField size="small" label="Pto. venta" value={cab.puntoVenta} onChange={(e) => setCab({ ...cab, puntoVenta: e.target.value })} />
          <TextField size="small" type="number" label="Número" value={cab.numero} onChange={(e) => setCab({ ...cab, numero: e.target.value })} autoFocus />
          <TextField size="small" type="date" label="Fecha del papel" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Vence" value={cab.vencimientoPago} onChange={(e) => setCab({ ...cab, vencimientoPago: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label="Bonif. %" value={cab.bonificacion} onChange={(e) => setCab({ ...cab, bonificacion: e.target.value })} />
        </Box>
        <Table size="small">
          <TableHead><TableRow><TableCell>Producto</TableCell><TableCell align="right">Cant.</TableCell><TableCell align="right" width={130}>Costo unit.</TableCell><TableCell align="right" width={90}>Desc. %</TableCell><TableCell align="right" width={90}>IVA %</TableCell></TableRow></TableHead>
          <TableBody>{(c.items || []).map((it) => (
            <TableRow key={it.id}><TableCell>{it.productoNombre}</TableCell><TableCell align="right">{num(it.cantidad)}</TableCell>
              <TableCell><TextField size="small" type="number" value={precios[it.id].costoUnitario} onChange={(e) => setPrecios({ ...precios, [it.id]: { ...precios[it.id], costoUnitario: e.target.value } })} /></TableCell>
              <TableCell><TextField size="small" type="number" value={precios[it.id].descuento} onChange={(e) => setPrecios({ ...precios, [it.id]: { ...precios[it.id], descuento: e.target.value } })} /></TableCell>
              <TableCell><TextField size="small" type="number" value={precios[it.id].iva} onChange={(e) => setPrecios({ ...precios, [it.id]: { ...precios[it.id], iva: e.target.value } })} /></TableCell></TableRow>
          ))}</TableBody>
        </Table>
        <TextField size="small" label="CAE (del QR)" value={cab.cae} onChange={(e) => setCab({ ...cab, cae: e.target.value })} />
      </Box>
    </Modal>
  );
};

const CompraDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, esJefe } = useAuth();
  const [modal, setModal] = useState(null);
  const [motivo, setMotivo] = useState("");
  const q = useQuery({ queryKey: ["comprobantes", "detalle", Number(id)], queryFn: () => comprasApi.comprobantes.get(id) });
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });
  const c = q.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (c?.etiqueta) setLabel(id, c.etiqueta); }, [id, c?.etiqueta, setLabel]);
  const invalidar = () => { qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: QK.stock }); qc.invalidateQueries({ queryKey: ["compromisos"] }); qc.invalidateQueries({ queryKey: ["echeqs"] }); };
  const mAnular = useAccion(() => comprasApi.comprobantes.anular(id, motivo), "Comprobante anulado.", () => { invalidar(); setModal(null); });
  const mConfirmar = useAccion(() => comprasApi.comprobantes.confirmar(id), "Comprobante confirmado.", invalidar);
  const mDescartar = useAccion(() => comprasApi.comprobantes.descartar(id), "Borrador descartado.", () => { invalidar(); navigate("/abastecimiento/compras"); });
  const mDesimputar = useAccion((impId) => comprasApi.pagos.desimputar(impId), "Pago desaplicado: vuelve a la bandeja de sin aplicar.", invalidar);
  const puedeCargar = can("facturas");
  const puedePagar = can("compras.pagos", "gastos.pagos_proveedor", "ventas.caja");
  const puedeImputar = can("gastos_imputar", "gastos.pagos_proveedor", "compras.pagos");

  if (q.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!c) return <Box className="page"><Typography>Comprobante inexistente.</Typography></Box>;
  const generaDeuda = ["factura", "liquidacion", "nota_debito"].includes(c.tipo);
  const T = TIPOS_COMPROBANTE[c.tipo] || {};

  return (
    <Box className="page fade-in">
      <EntityHeader eyebrow={`${c.proveedorNombre} · ${fecha(c.fecha)}${c.cae ? ` · CAE ${c.cae}` : ""}`} title={c.etiqueta} subtitle={c.observaciones || (c.recepcion ? `${c.tipo === "nota_credito" ? "Devolvió" : "Ingresó"} mercadería en ${c.sucursalNombre}` : "Sin movimiento de stock")}
        badges={<><StatusBadge tone={T.tone} label={T.corto || c.tipo} showDot={false} /><StatusBadge tone={ESTADOS_COMPROBANTE[c.estado]?.tone} label={ESTADOS_COMPROBANTE[c.estado]?.label} />{c.refEtiqueta && <StatusBadge tone="neutral" label={`ajusta ${c.refEtiqueta}`} showDot={false} />}</>}
        onBack={() => navigate("/abastecimiento/compras")}
        actions={(
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {c.estado === "borrador" && puedeCargar && <><Button size="small" variant="primary" loading={mConfirmar.isPending} onClick={() => mConfirmar.mutate()}>Confirmar</Button><Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Descartar el borrador?")) mDescartar.mutate(); }}>Descartar</Button></>}
            {c.estado === "confirmado" && c.tipo === "remito" && puedeCargar && <Button size="small" variant="primary" onClick={() => setModal("facturar")}>Llegó la factura</Button>}
            {c.estado === "confirmado" && c.tipo === "factura" && puedeCargar && <Button size="small" variant="secondary" onClick={() => navigate(`/abastecimiento/compras/nuevo?tipo=nota_credito&proveedorId=${c.proveedorId}`)}>Nota de crédito</Button>}
            {c.estado === "confirmado" && generaDeuda && c.saldo > 0.009 && puedePagar && <Button size="small" variant="primary" onClick={() => setModal("pagar")}>Pagar {money(c.saldo)}</Button>}
            {c.estado === "confirmado" && puedeCargar && <Button size="small" variant="danger" onClick={() => setModal("anular")}>Anular</Button>}
          </Box>
        )} />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Total" value={money(c.total)} hint={`neto ${money(c.subtotalNeto)} · IVA ${money(c.ivaTotal)}${c.percepcionesTotal ? ` · perc. ${money(c.percepcionesTotal)}` : ""}`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Pagado" value={money(c.pagado)} hint={c.condicionPago === "contado" ? "contado" : "cuenta corriente"} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Ajuste por notas" value={money(c.ajuste)} hint={c.notas?.length ? `${c.notas.length} nota(s)` : "sin notas"} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Saldo" value={generaDeuda ? money(c.saldo) : "—"} hint={c.vencimientoPago ? `vence ${fecha(c.vencimientoPago)}` : ""} /></Grid>
      </Grid>

      <Box sx={{ display: "grid", gap: 2 }}>
        <Card className="entity-card">
          <Typography className="card-title" sx={{ mb: 1 }}>Renglones</Typography>
          <DataTable columns={[
            { field: "productoNombre", headerName: "Producto", renderCell: (it) => <span onClick={(e) => { e.stopPropagation(); navigate(`/productos/${it.productoId}`); }} style={{ cursor: "pointer" }}>{it.productoNombre}{it.presentacionKg ? ` (${num(it.presentacionKg)} kg)` : ""}</span> },
            { field: "cantidad", headerName: "Cantidad", align: "right", renderCell: (it) => num(it.cantidad) },
            { field: "costoUnitario", headerName: "Costo unit.", align: "right", renderCell: (it) => money(it.costoUnitario) },
            { field: "descuento", headerName: "Desc.", align: "right", renderCell: (it) => (it.descuento ? `${num(it.descuento)}%` : "—") },
            { field: "iva", headerName: "IVA", align: "right", renderCell: (it) => `${num(it.iva)}%` },
            { field: "subtotal", headerName: "Neto", align: "right", renderCell: (it) => <strong>{money(it.subtotal)}</strong> },
          ]} data={c.items || []} emptyMessage="Sin renglones." />
          <Box className="compra-pie" sx={{ mt: 2 }}>
            {c.bonificacionImporte > 0 && <Box className="compra-pie__fila"><span>Bonificación {c.bonificacion ? `${num(c.bonificacion)}%` : ""}</span><span>−{money(c.bonificacionImporte)}</span></Box>}
            <Box className="compra-pie__fila"><span>Neto gravado</span><span>{money(c.subtotalNeto)}</span></Box>
            <Box className="compra-pie__fila"><span>IVA</span><span>{money(c.ivaTotal)}</span></Box>
            {(c.percepciones || []).map((p) => <Box key={p.id} className="compra-pie__fila"><span>{p.nombre} ({num(p.alicuota)}% s/ {p.base})</span><span>{money(p.importe)}</span></Box>)}
            <Box className="compra-pie__fila compra-pie__fila--total"><span>Total</span><span>{money(c.total)}</span></Box>
          </Box>
        </Card>

        {(c.notas || []).length > 0 && (
          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Notas que ajustan esta factura</Typography>
            <DataTable columns={[
              { field: "fecha", headerName: "Fecha", renderCell: (n) => fecha(n.fecha) }, { field: "etiqueta", headerName: "Nota" }, { field: "observaciones", headerName: "Detalle", renderCell: (n) => <span className="text-tertiary">{n.observaciones || "—"}</span> },
              { field: "total", headerName: "Importe", align: "right", renderCell: (n) => <strong className={n.signo < 0 ? "compras-num--neg" : ""}>{n.signo < 0 ? "−" : "+"}{money(n.total)}</strong> },
            ]} data={c.notas} onRowClick={(n) => navigate(`/abastecimiento/compras/${n.id}`)} />
          </Card>
        )}

        {generaDeuda && (
          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Pagos aplicados</Typography>
            <DataTable columns={[
              { field: "fecha", headerName: "Fecha", renderCell: (p) => stamp(p.fecha) },
              { field: "pagoId", headerName: "Pago", renderCell: (p) => <span>#{p.pagoId} · {MEDIOS_PAGO_PROV[p.medio] || p.medio}{p.esFlete ? " · flete adelantado" : ""}</span> },
              { field: "concepto", headerName: "Concepto", renderCell: (p) => <span className="text-tertiary">{p.concepto || "—"}{p.referencia ? ` · ${p.referencia}` : ""}</span> },
              { field: "sucursalNombre", headerName: "De dónde", renderCell: (p) => <span className="text-tertiary">{p.cajaSesionId ? `caja #${p.cajaSesionId} · ` : ""}{p.sucursalNombre || "administración"} · {p.usuarioNombre}</span> },
              { field: "importe", headerName: "Importe", align: "right", renderCell: (p) => <strong>{money(p.importe)}</strong> },
              ...(puedeImputar ? [{ field: "acciones", headerName: "", sortable: false, renderCell: (p) => (p.estado === "activo" ? <Button size="small" variant="ghost" onClick={(e) => { e.stopPropagation(); if (window.confirm("¿Desaplicar este pago? Vuelve a la bandeja de sin aplicar.")) mDesimputar.mutate(p.imputacionId); }}>Desaplicar</Button> : null) }] : []),
            ]} data={c.pagos || []} emptyMessage="Todavía no se pagó nada de este comprobante." />
          </Card>
        )}

        {(c.compromisos || []).length > 0 && (
          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Compromisos de pago</Typography>
            <DataTable columns={[
              { field: "cuota", headerName: "Cuota", renderCell: (k) => (k.cuota ? `${k.cuota} de ${k.cuotas}` : "único") }, { field: "fechaVenc", headerName: "Vence", renderCell: (k) => fecha(k.fechaVenc) },
              { field: "importe", headerName: "Importe", align: "right", renderCell: (k) => money(k.importe) },
              { field: "pagado", headerName: "Estado", renderCell: (k) => <StatusBadge tone={k.pagado ? "success" : "warning"} label={k.pagado ? "Pagado" : k.esEcheq ? "Echeq pendiente" : "Pendiente"} /> },
            ]} data={c.compromisos} onRowClick={() => navigate("/abastecimiento/vencimientos")} />
          </Card>
        )}
        {esJefe && c.usuarioNombre && <Typography variant="caption" color="text.secondary">Cargado por {c.usuarioNombre} el {stamp(c.fechaCarga)}.</Typography>}
      </Box>

      {modal === "facturar" && <FacturarModal open onClose={() => setModal(null)} c={c} onFacturado={invalidar} />}
      <PagoProveedorModal open={modal === "pagar"} onClose={() => setModal(null)} proveedores={proveedores.data || []} fijo={{ proveedorId: c.proveedorId, destino: "mercaderia", doc: { tipo: "comprobante", docId: c.id, etiqueta: c.etiqueta, saldo: r2(c.saldo) } }} onListo={invalidar} />
      <Modal open={modal === "anular"} onClose={() => setModal(null)} title={`Anular ${c.etiqueta}`} actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="danger-solid" loading={mAnular.isPending} disabled={!motivo.trim()} onClick={() => mAnular.mutate()}>Anular</Button></>)}>
        <Alert severity="warning" sx={{ mb: 2 }}>{c.recepcion ? "El movimiento de stock se revierte. " : ""}Solo se anula sin pagos aplicados ni notas confirmadas.</Alert>
        <TextField size="small" label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} fullWidth autoFocus />
      </Modal>
    </Box>
  );
};

export default CompraDetalle;
