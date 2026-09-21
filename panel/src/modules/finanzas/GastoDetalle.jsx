/**
 * El detalle de un gasto: el pie, los renglones, los pagos que lo cancelaron
 * (con su sucursal y turno), la foto del comprobante. Desde acá: pagar,
 * aplicar un pago a cuenta que ya existe, editar, anular.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { API_URL } from "../../app/api/httpClient";
import { leerSesion } from "../../app/api/sesion";
import { comprasApi, ESTADOS_GASTO, TIPOS_DOC_GASTO, MEDIOS_PAGO_PROV, money, fecha, stamp, r2 } from "../abastecimiento/api/comprasApi";
import GastoForm from "./components/GastoForm";
import PagoProveedorModal from "../abastecimiento/components/PagoProveedorModal";

/** El adjunto se pide con el token (no es una URL pública) y se abre en una pestaña. */
const abrirAdjunto = async (id) => {
  const token = leerSesion()?.token;
  const res = await fetch(`${API_URL}/gastos/adjuntos/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), "_blank");
};

const GastoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can, esJefe } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [motivo, setMotivo] = useState("");
  const fileRef = useRef(null);
  const q = useQuery({ queryKey: ["gastos", "detalle", Number(id)], queryFn: () => comprasApi.gastos.get(id) });
  const boot = useQuery({ queryKey: ["gastos", "bootstrap"], queryFn: comprasApi.gastos.bootstrap, staleTime: 60_000 });
  const g = q.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (g) setLabel(id, g.descripcion || `Gasto #${g.id}`); }, [id, g, setLabel]);
  const invalidar = () => { qc.invalidateQueries({ queryKey: ["gastos"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["edoc"] }); qc.invalidateQueries({ queryKey: ["caja"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mAnular = useMutation({ mutationFn: () => comprasApi.gastos.anular(id, motivo), onSuccess: () => { showToast("Gasto anulado.", "info"); setModal(null); invalidar(); }, onError: err });
  const mAplicar = useMutation({ mutationFn: ({ pagoId, importe }) => comprasApi.gastos.aplicarPago(id, pagoId, importe), onSuccess: () => { showToast("Pago aplicado.", "success"); setModal(null); invalidar(); }, onError: err });
  const mDesimputar = useMutation({ mutationFn: (impId) => comprasApi.pagos.desimputar(impId), onSuccess: () => { showToast("Pago desaplicado.", "success"); invalidar(); }, onError: err });
  const mAdjunto = useMutation({ mutationFn: ({ nombre, data }) => comprasApi.gastos.subirAdjunto(id, nombre, data), onSuccess: () => { showToast("Comprobante adjuntado.", "success"); invalidar(); }, onError: err });
  const mBorrarAdj = useMutation({ mutationFn: (aid) => comprasApi.gastos.borrarAdjunto(aid), onSuccess: () => { showToast("Adjunto borrado.", "info"); invalidar(); }, onError: err });
  const disponibles = useQuery({ queryKey: ["pagos", "disponibles", g?.proveedorId, "gastos"], queryFn: () => comprasApi.pagos.disponibles(g.proveedorId, "gastos"), enabled: Boolean(g?.proveedorId) && modal === "aplicar" });
  const puedeEditar = can("gastos.gastos");
  const puedePagar = can("gastos_pagar", "gastos_pagar_proveedor", "ventas.caja");
  const puedeImputar = can("gastos_imputar", "gastos.pagos_proveedor", "compras.pagos");
  const puedeAnular = can("gastos_anular");

  const subirArchivo = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => mAdjunto.mutate({ nombre: file.name, data: r.result });
    r.readAsDataURL(file);
  };

  if (q.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!g) return <Box className="page"><Typography>Gasto inexistente.</Typography></Box>;
  const vivo = g.estado !== "anulado";

  return (
    <Box className="page fade-in">
      <EntityHeader eyebrow={`${TIPOS_DOC_GASTO[g.tipoDoc] || g.tipoDoc} ${g.letra}${g.numero ? ` ${g.numero}` : ""} · ${fecha(g.fecha)}`} title={g.descripcion || `Gasto #${g.id}`}
        subtitle={`${g.categoriaNombre} · ${g.proveedorNombre || "sin proveedor"}${g.sucursalNombre ? ` · ${g.sucursalNombre}` : " · toda la empresa"}${g.vencimiento ? ` · vence ${fecha(g.vencimiento)}` : ""}`}
        badges={<><StatusBadge tone={ESTADOS_GASTO[g.estado]?.tone} label={ESTADOS_GASTO[g.estado]?.label} />{g.recurrenteId && <StatusBadge tone="info" label="gasto fijo" showDot={false} />}</>}
        onBack={() => navigate("/finanzas/gastos")}
        actions={(
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {vivo && puedeEditar && <Button size="small" variant="secondary" onClick={() => setModal("editar")}>Editar</Button>}
            {vivo && g.saldo > 0.009 && puedeImputar && g.proveedorId && <Button size="small" variant="secondary" onClick={() => setModal("aplicar")}>Aplicar pago a cuenta</Button>}
            {vivo && g.saldo > 0.009 && puedePagar && <Button size="small" variant="primary" onClick={() => setModal("pagar")}>Pagar {money(g.saldo)}</Button>}
            {vivo && puedeAnular && <Button size="small" variant="danger" onClick={() => setModal("anular")}>Anular</Button>}
          </Box>
        )} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Total" value={money(g.total)} hint={`neto ${money(g.neto)} · IVA ${money(g.iva)}${g.otros ? ` · otros ${money(g.otros)}` : ""}`} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Pagado" value={money(g.pagado)} hint={g.condicionPago === "cuenta_corriente" ? "cuenta corriente" : "contado"} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Saldo" value={money(g.saldo)} hint={g.vencimiento ? `vence ${fecha(g.vencimiento)}` : "sin vencimiento"} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard title="Pie" value={money(g.impInternos + g.percDgi + g.percDgr)} hint={`int. ${money(g.impInternos)} · DGI ${money(g.percDgi)} · DGR ${money(g.percDgr)}`} /></Grid>
      </Grid>

      <Box sx={{ display: "grid", gap: 2 }}>
        {(g.items || []).length > 0 && (
          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Renglones</Typography>
            <DataTable columns={[{ field: "concepto", headerName: "Concepto" }, { field: "monto", headerName: "Monto", align: "right", renderCell: (i) => <strong>{money(i.monto)}</strong> }]} data={g.items} />
          </Card>
        )}
        <Card className="entity-card">
          <Typography className="card-title" sx={{ mb: 1 }}>Pagos</Typography>
          <DataTable columns={[
            { field: "fecha", headerName: "Fecha", renderCell: (p) => stamp(p.fecha) },
            { field: "pagoId", headerName: "Pago", renderCell: (p) => `#${p.pagoId} · ${MEDIOS_PAGO_PROV[p.medio] || p.medio}` },
            { field: "concepto", headerName: "Concepto", renderCell: (p) => <span className="text-tertiary">{p.concepto || "—"}{p.referencia ? ` · ${p.referencia}` : ""}</span> },
            { field: "sucursalNombre", headerName: "De dónde", renderCell: (p) => <span className="text-tertiary">{p.cajaSesionId ? `caja #${p.cajaSesionId} · ` : ""}{p.sucursalNombre || "administración"}{esJefe ? ` · ${p.usuarioNombre}` : ""}</span> },
            { field: "importe", headerName: "Importe", align: "right", renderCell: (p) => <strong>{money(p.importe)}</strong> },
            ...(puedeImputar ? [{ field: "acciones", headerName: "", sortable: false, renderCell: (p) => (p.estado === "activo" ? <Button size="small" variant="ghost" onClick={() => { if (window.confirm("¿Desaplicar este pago?")) mDesimputar.mutate(p.imputacionId); }}>Desaplicar</Button> : null) }] : []),
          ]} data={g.pagos || []} emptyMessage="Todavía no se pagó." />
        </Card>
        <Card className="entity-card">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography className="card-title">Comprobante adjunto</Typography>
            {puedeEditar && vivo && <><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => { subirArchivo(e.target.files?.[0]); e.target.value = ""; }} /><Button size="small" variant="secondary" loading={mAdjunto.isPending} onClick={() => fileRef.current?.click()}>Subir foto o PDF</Button></>}
          </Box>
          {(g.adjuntos || []).length === 0 && <Typography variant="body2" color="text.secondary">Sin adjunto. La foto del ticket es el respaldo de la salida de plata.</Typography>}
          {(g.adjuntos || []).map((a) => (
            <Box key={a.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button size="small" variant="ghost" onClick={() => abrirAdjunto(a.id)}>{a.nombre} · {a.mime}</Button>
              <Typography variant="caption" color="text.secondary">{stamp(a.subidoEn)}</Typography>
              {puedeEditar && <Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Borrar el adjunto?")) mBorrarAdj.mutate(a.id); }}>Borrar</Button>}
            </Box>
          ))}
        </Card>
        {g.observaciones && <Card className="entity-card"><Typography className="card-title" sx={{ mb: 1 }}>Observaciones</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{g.observaciones}</Typography></Card>}
      </Box>

      <GastoForm open={modal === "editar"} onClose={() => setModal(null)} gasto={g} boot={boot.data} onListo={invalidar} />
      <PagoProveedorModal open={modal === "pagar"} onClose={() => setModal(null)} proveedores={boot.data?.proveedores || []} fijo={{ proveedorId: g.proveedorId || undefined, destino: "gastos", doc: { tipo: "gasto", docId: g.id, etiqueta: g.descripcion || `Gasto #${g.id}`, saldo: r2(g.saldo) } }} onListo={invalidar} />
      <Modal open={modal === "aplicar"} onClose={() => setModal(null)} title="Aplicar un pago a cuenta" subtitle="Plata que ya salió hacia este proveedor y todavía no se aplicó a nada.">
        <Box sx={{ display: "grid", gap: 1, pt: 1 }}>
          {(disponibles.data || []).length === 0 && <Typography color="text.secondary">No hay pagos sin aplicar de este proveedor en la bandeja de gastos.</Typography>}
          {(disponibles.data || []).map((p) => (
            <Box key={p.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Box><strong>Pago #{p.id} · {MEDIOS_PAGO_PROV[p.medio] || p.medio}</strong><Typography variant="caption" display="block" color="text.secondary">{p.concepto || "—"} · {stamp(p.fecha)} · sin aplicar {money(p.saldo)}</Typography></Box>
              <Button size="small" variant="primary" loading={mAplicar.isPending} onClick={() => mAplicar.mutate({ pagoId: p.id, importe: r2(Math.min(p.saldo, g.saldo)) })}>Aplicar {money(Math.min(p.saldo, g.saldo))}</Button>
            </Box>
          ))}
        </Box>
      </Modal>
      <Modal open={modal === "anular"} onClose={() => setModal(null)} title="Anular gasto" actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="danger-solid" loading={mAnular.isPending} onClick={() => mAnular.mutate()}>Anular</Button></>)}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Solo sin pagos registrados: la plata que salió tiene que quedar rastreable.</Typography>
        <TextField size="small" label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} fullWidth autoFocus />
      </Modal>
    </Box>
  );
};

export default GastoDetalle;
