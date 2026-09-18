/**
 * La ficha de un cliente: datos, cuenta corriente (saldo, límite, comprobantes
 * que deben), sus ventas y sus recibos. Editar pide `ventas.clientes`; el
 * crédito, `cta_cte`. Con historial se desactiva; sin historial se borra.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import StatCard from "../../components/Cards/StatCard/StatCard";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { ventasApi, CONDICIONES_IVA, ESTADOS_VENTA, MEDIOS_PAGO, TIPOS_DOC, etiquetaVenta, money, stamp } from "../ventas/api/ventasApi";
import ClienteForm from "./components/ClienteForm";
import { CLIENTE_VACIO, aPayloadCliente } from "./lib/fichaCliente";
import "./ClienteDetalle.css";

const ClienteDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can, check } = useAuth();
  const qc = useQueryClient();
  const { setLabel } = useEntityLabel();
  const [tab, setTab] = useState(0);
  const [editar, setEditar] = useState(null);
  const puede = check("ventas.clientes");
  const puedeCredito = can("cta_cte");

  const q = useQuery({ queryKey: ["cliente", id], queryFn: () => ventasApi.clientes.get(id) });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const cuenta = useQuery({ queryKey: ["cuenta", Number(id)], queryFn: () => ventasApi.clientes.cuenta(id), enabled: Boolean(q.data) && !q.data.esConsumidorFinal });
  const ventas = useQuery({ queryKey: ["ventas", "cliente", id], queryFn: () => ventasApi.ventas({ clienteId: id, limit: 100 }), enabled: tab === 1 });
  const recibos = useQuery({ queryKey: ["cobranzas", "cliente", id], queryFn: () => ventasApi.cobranzas.listar({ clienteId: id, limit: 100 }), enabled: tab === 2 });
  const c = q.data;
  useEffect(() => { if (c) setLabel(id, c.nombre); }, [id, c, setLabel]);

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["cliente", id] }); qc.invalidateQueries({ queryKey: ["clientes"] }); qc.invalidateQueries({ queryKey: ["ventas", "bootstrap"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mEditar = useMutation({ mutationFn: (b) => ventasApi.clientes.editar(id, b), onSuccess: () => { showToast("Ficha guardada.", "success"); setEditar(null); invalidar(); }, onError: err });
  const mBorrar = useMutation({ mutationFn: () => ventasApi.clientes.borrar(id), onSuccess: (r) => { showToast(r.desactivado ? "Tiene historial: quedó desactivado." : "Cliente borrado.", "success"); invalidar(); if (!r.desactivado) navigate("/clientes"); }, onError: err });
  const mReactivar = useMutation({ mutationFn: () => ventasApi.clientes.reactivar(id), onSuccess: () => { showToast("Cliente reactivado.", "success"); invalidar(); }, onError: err });

  if (q.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!c) return <Box className="page"><Typography>Cliente inexistente.</Typography></Box>;

  const listas = boot.data?.listasCatalogo?.listas || [];
  const cta = cuenta.data;
  const abrirEdicion = () => setEditar({ ...CLIENTE_VACIO, ...c, vendedorId: c.vendedorId || "", sucursalId: c.sucursalId || "", observaciones: c.observaciones || "" });

  const colVentas = [
    { field: "fecha", headerName: "Fecha", renderCell: (v) => <span className="nowrap">{stamp(v.fecha)}</span> },
    { field: "numero", headerName: "Comprobante", renderCell: (v) => <strong>{etiquetaVenta(v)}</strong> },
    { field: "condicionPago", headerName: "Condición", renderCell: (v) => (v.condicionPago === "cuenta_corriente" ? "Cta. cte." : "Contado") },
    { field: "total", headerName: "Total", align: "right", renderCell: (v) => money(v.total) },
    { field: "saldo", headerName: "Saldo", align: "right", renderCell: (v) => (v.saldo > 0.009 && v.estado === "confirmada" && !v.tipo.startsWith("nota_credito") ? money(v.saldo) : <span className="text-tertiary">—</span>) },
    { field: "estado", headerName: "Estado", renderCell: (v) => <StatusBadge tone={ESTADOS_VENTA[v.estado]?.tone} label={ESTADOS_VENTA[v.estado]?.label} /> },
  ];
  const colRecibos = [
    { field: "fecha", headerName: "Fecha", renderCell: (r) => <span className="nowrap">{stamp(r.fecha)}</span> },
    { field: "numero", headerName: "Recibo", renderCell: (r) => <strong>{r.puntoVenta}-{String(r.numero).padStart(8, "0")}</strong> },
    { field: "pagos", headerName: "Medios", sortable: false, renderCell: (r) => <span className="text-tertiary">{(r.pagos || []).map((p) => MEDIOS_PAGO[p.medio] || p.medio).join(" + ")}</span> },
    { field: "total", headerName: "Total", align: "right", renderCell: (r) => money(r.total) },
    { field: "aCuenta", headerName: "A cuenta", align: "right", renderCell: (r) => (r.aCuenta > 0 ? money(r.aCuenta) : <span className="text-tertiary">—</span>) },
    { field: "estado", headerName: "Estado", renderCell: (r) => <StatusBadge tone={r.estado === "anulada" ? "error" : "success"} label={r.estado === "anulada" ? "Anulado" : "Confirmado"} /> },
  ];

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${CONDICIONES_IVA[c.condicionIva]?.label || ""}${c.numeroDoc ? ` · ${TIPOS_DOC[c.tipoDoc] || c.tipoDoc} ${c.numeroDoc}` : ""}`}
        title={c.nombre}
        subtitle={[c.nombreFantasia, c.localidad, c.telefono, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
        badges={<><StatusBadge tone={c.esConsumidorFinal ? "info" : c.activo ? "success" : "neutral"} label={c.esConsumidorFinal ? "Consumidor Final genérico" : c.activo ? "Activo" : "Inactivo"} />{c.ctaCteHabilitada && <StatusBadge tone="warning" label="Cuenta corriente" showDot={false} />}</>}
        onBack={() => navigate("/clientes")}
        actions={(<>
          <Tooltip title={puede.allowed ? "" : puede.reason}><span><Button size="small" variant="secondary" disabled={!puede.allowed} onClick={abrirEdicion}>Editar</Button></span></Tooltip>
          {!c.esConsumidorFinal && puede.allowed && (c.activo ? <Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Dar de baja al cliente? Con historial queda desactivado; sin historial se borra.")) mBorrar.mutate(); }}>Dar de baja</Button> : <Button size="small" variant="ghost" onClick={() => mReactivar.mutate()}>Reactivar</Button>)}
        </>)}
      />

      {!c.esConsumidorFinal && cta && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Saldo" value={money(cta.saldo)} hint={cta.saldo > 0.009 ? `${cta.comprobantes.length} comprobante(s) con saldo` : "al día"} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Crédito" value={c.ctaCteHabilitada ? (cta.limiteCredito > 0 ? money(cta.limiteCredito) : "sin tope") : "—"} hint={c.ctaCteHabilitada ? (cta.disponible != null ? `disponible ${money(cta.disponible)} · ${c.diasPlazo} días` : `${c.diasPlazo} días de plazo`) : "sin cuenta corriente"} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Facturado en cta. cte." value={money(cta.facturado)} hint={`acreditado ${money(cta.acreditado)}`} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Cobrado" value={money(cta.cobrado)} hint={`descuento ${c.descuento}% · ${c.listas?.length || 0} lista(s)`} /></Grid>
        </Grid>
      )}
      {c.esConsumidorFinal && <Alert severity="info" sx={{ mb: 2 }}>El Consumidor Final es el cliente del ticket de mostrador: no lleva cuenta corriente ni se le cambia lo fiscal.</Alert>}

      <Box className="table-tabs"><Tabs value={tab} onChange={(_, v) => setTab(v)}><Tab label="Cuenta corriente" /><Tab label="Ventas" /><Tab label="Recibos" /></Tabs></Box>
      {tab === 0 && (
        <Box>
          {c.esConsumidorFinal ? <Typography color="text.secondary" sx={{ p: 2 }}>No aplica.</Typography> : cta && (
            <>
              {cta.comprobantes.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Sin comprobantes con saldo.</Typography>}
              {cta.comprobantes.length > 0 && <DataTable columns={[
                { field: "fecha", headerName: "Fecha", renderCell: (v) => <span className="nowrap">{stamp(v.fecha)}</span> },
                { field: "etiqueta", headerName: "Comprobante", renderCell: (v) => <strong>{v.etiqueta}</strong> },
                { field: "vencimientoPago", headerName: "Vence", renderCell: (v) => (v.vencimientoPago ? stamp(v.vencimientoPago) : "—") },
                { field: "total", headerName: "Total", align: "right", renderCell: (v) => money(v.total) },
                { field: "cobrado", headerName: "Cobrado", align: "right", renderCell: (v) => money(v.cobrado + v.acreditado) },
                { field: "saldo", headerName: "Debe", align: "right", renderCell: (v) => <strong>{money(v.saldo)}</strong> },
              ]} data={cta.comprobantes} onRowClick={(v) => navigate(`/ventas/${v.id}`)} />}
              <Box sx={{ mt: 2 }}><Button variant="primary" onClick={() => navigate("/ventas/cobranzas")}>Registrar un recibo</Button></Box>
            </>
          )}
        </Box>
      )}
      {tab === 1 && <DataTable columns={colVentas} data={ventas.data || []} loading={ventas.isLoading} emptyMessage="Sin ventas." onRowClick={(v) => navigate(`/ventas/${v.id}`)} />}
      {tab === 2 && <DataTable columns={colRecibos} data={recibos.data || []} loading={recibos.isLoading} emptyMessage="Sin recibos." />}

      <Modal open={Boolean(editar)} onClose={() => setEditar(null)} title={`Editar ${c.nombre}`} maxWidth="md"
        actions={(<><Button variant="ghost" onClick={() => setEditar(null)}>Cancelar</Button><Button variant="primary" loading={mEditar.isPending} disabled={!editar?.nombre?.trim()} onClick={() => mEditar.mutate(aPayloadCliente(editar, puedeCredito))}>Guardar</Button></>)}>
        {editar && <ClienteForm valor={editar} onChange={setEditar} listas={listas} usuarios={boot.data?.usuarios || []} sucursales={boot.data?.sucursales || []} puedeCredito={puedeCredito} esConsumidorFinal={c.esConsumidorFinal} />}
      </Modal>
    </Box>
  );
};

export default ClienteDetalle;
