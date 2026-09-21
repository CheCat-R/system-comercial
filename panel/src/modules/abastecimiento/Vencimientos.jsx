/**
 * VENCIMIENTOS — el compromiso como entidad ("esta factura se paga el día X")
 * y la cartera de echeqs propios. Pagar un compromiso crea el pago real del
 * sistema (con su caja y su bandeja); cobrar un echeq es EL momento contable.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import AddIcon from "@mui/icons-material/Add";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";

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
import { ventasApi } from "../ventas/api/ventasApi";
import { comprasApi, ESTADOS_ECHEQ, MEDIOS_PAGO_PROV, money, fecha, hoyISO, aDia } from "./api/comprasApi";
import "./Compras.css";

const FILTROS_K = [["pendientes", "Pendientes"], ["vencidos", "Vencidos"], ["semana", "Esta semana"], ["mes", "Este mes"], ["futuros", "Futuros"], ["pagados", "Pagados"], ["todos", "Todos"]];
const FILTROS_E = [["activos", "Activos"], ["vencidos", "Vencidos"], ["semana", "Esta semana"], ["cobrados", "Cobrados"], ["anulados", "Anulados"], ["todos", "Todos"]];
const dias = (n) => (n == null ? "—" : n < 0 ? <span style={{ color: "var(--color-danger, #d32f2f)", fontWeight: 600 }}>vencido hace {-n} d</span> : n === 0 ? <strong>hoy</strong> : `en ${n} d`);

const Vencimientos = () => {
  const { showToast } = useToast();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(can("proveedores.ctasctes") ? 0 : 1);
  const [fk, setFk] = useState("pendientes");
  const [fe, setFe] = useState("activos");
  const [proveedorId, setProveedorId] = useState("");
  const [modal, setModal] = useState(null);
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });
  const comps = useQuery({ queryKey: ["compromisos", fk, proveedorId], queryFn: () => comprasApi.compromisos.listar({ filtro: fk, proveedorId: proveedorId || undefined }), enabled: tab === 0 });
  const statsK = useQuery({ queryKey: ["compromisos", "stats"], queryFn: comprasApi.compromisos.stats, enabled: can("proveedores.ctasctes") });
  const echeqs = useQuery({ queryKey: ["echeqs", fe, proveedorId], queryFn: () => comprasApi.echeqs.listar({ filtro: fe, proveedorId: proveedorId || undefined }), enabled: tab === 1 });
  const statsE = useQuery({ queryKey: ["echeqs", "stats"], queryFn: comprasApi.echeqs.stats, enabled: can("proveedores.echeqs") });
  const caja = useQuery({ queryKey: ["pos", "caja", user?.sucursalId], queryFn: () => ventasApi.caja.actual(user.sucursalId), enabled: Boolean(user?.sucursalId) });
  const invalidar = () => { qc.invalidateQueries({ queryKey: ["compromisos"] }); qc.invalidateQueries({ queryKey: ["echeqs"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["edoc"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const cerrar = (msg) => () => { showToast(msg, "success"); setModal(null); invalidar(); };
  const mCrearK = useMutation({ mutationFn: (b) => comprasApi.compromisos.crear(b), onSuccess: cerrar("Compromiso creado."), onError: err });
  const mEditarK = useMutation({ mutationFn: ({ id, ...b }) => comprasApi.compromisos.editar(id, b), onSuccess: cerrar("Compromiso actualizado."), onError: err });
  const mPagarK = useMutation({ mutationFn: ({ id, ...b }) => comprasApi.compromisos.pagar(id, b), onSuccess: (r) => { showToast(r.aviso || `Compromiso pagado (pago #${r.pago?.id}).`, "success"); setModal(null); invalidar(); }, onError: err });
  const mBorrarK = useMutation({ mutationFn: (id) => comprasApi.compromisos.borrar(id), onSuccess: cerrar("Compromiso borrado."), onError: err });
  const mCrearE = useMutation({ mutationFn: (b) => comprasApi.echeqs.crear(b), onSuccess: cerrar("Echeq cargado."), onError: err });
  const mEditarE = useMutation({ mutationFn: ({ id, ...b }) => comprasApi.echeqs.editar(id, b), onSuccess: cerrar("Echeq actualizado."), onError: err });
  const mEstadoE = useMutation({ mutationFn: ({ id, estado }) => comprasApi.echeqs.estado(id, estado), onSuccess: cerrar("Estado actualizado."), onError: err });
  const mBorrarE = useMutation({ mutationFn: (id) => comprasApi.echeqs.borrar(id), onSuccess: cerrar("Echeq borrado."), onError: err });

  const provNombre = (id) => (proveedores.data || []).find((p) => p.id === Number(id))?.nombre || "";
  const sk = statsK.data;
  const se = statsE.data;

  return (
    <Box className="page fade-in">
      <PageHeader title="Vencimientos y echeqs" subtitle="La promesa de pago de cada factura y la cartera de echeqs. La deuda nace en Compras; acá se administra cuándo y con qué se paga."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal(tab === 0 ? { compromiso: { proveedorId: "", importe: "", fechaVenc: hoyISO(), obs: "" } } : { echeq: { proveedorId: "", numero: "", banco: "", importe: "", fechaEmision: hoyISO(), fechaVenc: hoyISO(), obs: "" } })}>{tab === 0 ? "Compromiso manual" : "Nuevo echeq"}</Button>} />
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {tab === 0 ? (<>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Vencidos" value={money(sk?.vencidos?.monto || 0)} hint={`${sk?.vencidos?.n || 0} compromiso(s)`} icon={<EventBusyOutlinedIcon />} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Próximos 3 días" value={money(sk?.prox3?.monto || 0)} hint={`${sk?.prox3?.n || 0}`} icon={<EventAvailableOutlinedIcon />} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Esta semana" value={money(sk?.semana?.monto || 0)} hint={`${sk?.semana?.n || 0}`} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Pendiente total" value={money(sk?.total?.monto || 0)} hint={`${sk?.total?.n || 0}`} /></Grid>
        </>) : (<>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="En cartera" value={money(se?.activos?.monto || 0)} hint={`${se?.activos?.n || 0} echeq(s)`} icon={<AccountBalanceOutlinedIcon />} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Vencidos sin cobrar" value={money(se?.vencidos?.monto || 0)} hint={`${se?.vencidos?.n || 0}`} icon={<EventBusyOutlinedIcon />} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Se debitan en 3 días" value={money(se?.prox3?.monto || 0)} hint={`${se?.prox3?.n || 0}`} icon={<EventAvailableOutlinedIcon />} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><StatCard title="Por banco" value={se?.porBanco?.[0]?.banco || "—"} hint={se?.porBanco?.map((b) => `${b.banco}: ${money(b.monto)}`).join(" · ") || ""} /></Grid>
        </>)}
      </Grid>
      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}><Tab label="Compromisos" disabled={!can("proveedores.ctasctes")} /><Tab label="Echeqs" disabled={!can("proveedores.echeqs")} /></Tabs>
        <Box sx={{ display: "flex", gap: 1 }}>
          {tab === 0
            ? <TextField select size="small" value={fk} onChange={(e) => setFk(e.target.value)} sx={{ minWidth: 150 }}>{FILTROS_K.map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
            : <TextField select size="small" value={fe} onChange={(e) => setFe(e.target.value)} sx={{ minWidth: 150 }}>{FILTROS_E.map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>}
          <TextField select size="small" label="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} sx={{ minWidth: 200 }}><MenuItem value="">Todos</MenuItem>{(proveedores.data || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}</TextField>
        </Box>
      </Box>

      {tab === 0 && (
        <DataTable columns={[
          { field: "fechaVenc", headerName: "Vence", renderCell: (k) => <Box><strong>{fecha(k.fechaVenc)}</strong><Typography variant="caption" display="block">{k.pagado ? "pagado" : dias(k.diasRest)}</Typography></Box> },
          { field: "proveedorNombre", headerName: "Proveedor" },
          { field: "comprobanteEtiqueta", headerName: "Documento", renderCell: (k) => <span>{k.comprobanteEtiqueta || <span className="text-tertiary">manual</span>}{k.cuota ? ` · cuota ${k.cuota}/${k.cuotas}` : ""}</span> },
          { field: "obs", headerName: "Obs.", renderCell: (k) => <span className="text-tertiary">{k.obs || "—"}</span> },
          { field: "importe", headerName: "Importe", align: "right", renderCell: (k) => <strong>{money(k.importe)}</strong> },
          { field: "pagado", headerName: "Estado", renderCell: (k) => <StatusBadge tone={k.pagado ? "success" : k.diasRest < 0 ? "danger" : "warning"} label={k.pagado ? "Pagado" : k.diasRest < 0 ? "Vencido" : "Pendiente"} /> },
          { field: "acciones", headerName: "", sortable: false, renderCell: (k) => (!k.pagado ? (
            <Box sx={{ display: "flex", gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
              <Button size="small" variant="primary" onClick={() => setModal({ pagar: k, medio: "transferencia", referencia: "", usarCaja: true })}>Pagar</Button>
              <Button size="small" variant="ghost" onClick={() => setModal({ compromiso: { id: k.id, proveedorId: k.proveedorId, importe: String(k.importe), fechaVenc: aDia(k.fechaVenc), obs: k.obs || "" } })}>Editar</Button>
              <Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Borrar el compromiso?")) mBorrarK.mutate(k.id); }}>Borrar</Button>
            </Box>) : null) },
        ]} data={comps.data?.filas || []} loading={comps.isLoading} emptyMessage="Sin compromisos con ese filtro." pagination={{ pageSize: 25 }} />
      )}

      {tab === 1 && (
        <DataTable columns={[
          { field: "fechaVenc", headerName: "Se debita", renderCell: (e) => <Box><strong>{fecha(e.fechaVenc)}</strong><Typography variant="caption" display="block">{["emitido", "entregado"].includes(e.estado) ? dias(e.diasRest) : ""}</Typography></Box> },
          { field: "numero", headerName: "Echeq", renderCell: (e) => <Box><strong>{e.numero || "—"}</strong><Typography variant="caption" display="block" color="text.secondary">{e.banco || "banco a definir"}{e.numero?.startsWith("PEND-") ? " · completar" : ""}</Typography></Box> },
          { field: "proveedorNombre", headerName: "Proveedor" },
          { field: "importe", headerName: "Importe", align: "right", renderCell: (e) => <strong>{money(e.importe)}</strong> },
          { field: "estado", headerName: "Estado", renderCell: (e) => <StatusBadge tone={ESTADOS_ECHEQ[e.estado]?.tone} label={ESTADOS_ECHEQ[e.estado]?.label} /> },
          { field: "acciones", headerName: "", sortable: false, renderCell: (e) => (["emitido", "entregado"].includes(e.estado) ? (
            <Box sx={{ display: "flex", gap: 0.5 }} onClick={(ev) => ev.stopPropagation()}>
              {e.estado === "emitido" && <Button size="small" variant="ghost" onClick={() => mEstadoE.mutate({ id: e.id, estado: "entregado" })}>Entregado</Button>}
              <Button size="small" variant="primary" onClick={() => { if (window.confirm(`¿Marcar cobrado? Se registra el pago de ${money(e.importe)} con fecha ${fecha(e.fechaVenc)}.`)) mEstadoE.mutate({ id: e.id, estado: "cobrado" }); }}>Cobrado</Button>
              <Button size="small" variant="ghost" onClick={() => setModal({ echeq: { id: e.id, proveedorId: e.proveedorId, numero: e.numero?.startsWith("PEND-") ? "" : e.numero, banco: e.banco === "A definir" ? "" : e.banco, importe: String(e.importe), fechaEmision: aDia(e.fechaEmision), fechaVenc: aDia(e.fechaVenc), obs: e.obs || "", compromisoId: e.compromisoId } })}>Editar</Button>
              <Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Anular el echeq?")) mEstadoE.mutate({ id: e.id, estado: "anulado" }); }}>Anular</Button>
            </Box>) : e.estado === "anulado" ? <Button size="small" variant="ghost" onClick={() => mBorrarE.mutate(e.id)}>Borrar</Button> : null) },
        ]} data={echeqs.data?.filas || []} loading={echeqs.isLoading} emptyMessage="Sin echeqs con ese filtro." pagination={{ pageSize: 25 }} />
      )}

      <Modal open={Boolean(modal?.compromiso)} onClose={() => setModal(null)} title={modal?.compromiso?.id ? "Editar compromiso" : "Compromiso manual"} subtitle="Una promesa de pago suelta, sin factura atrás."
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mCrearK.isPending || mEditarK.isPending} onClick={() => { const c = modal.compromiso; const b = { importe: Number(c.importe), fechaVenc: c.fechaVenc, obs: c.obs }; c.id ? mEditarK.mutate({ id: c.id, ...b }) : mCrearK.mutate({ ...b, proveedorId: Number(c.proveedorId) }); }}>Guardar</Button></>)}>
        {modal?.compromiso && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Autocomplete size="small" options={proveedores.data || []} getOptionLabel={(p) => p.nombre} disabled={Boolean(modal.compromiso.id)} value={(proveedores.data || []).find((p) => p.id === Number(modal.compromiso.proveedorId)) || null} onChange={(_, v) => setModal({ compromiso: { ...modal.compromiso, proveedorId: v?.id || "" } })} renderInput={(p) => <TextField {...p} label="Proveedor" />} />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField size="small" type="number" label="Importe" value={modal.compromiso.importe} onChange={(e) => setModal({ compromiso: { ...modal.compromiso, importe: e.target.value } })} />
              <TextField size="small" type="date" label="Vence" value={modal.compromiso.fechaVenc} onChange={(e) => setModal({ compromiso: { ...modal.compromiso, fechaVenc: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <TextField size="small" label="Observaciones" value={modal.compromiso.obs} onChange={(e) => setModal({ compromiso: { ...modal.compromiso, obs: e.target.value } })} />
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(modal?.pagar)} onClose={() => setModal(null)} title={`Pagar compromiso #${modal?.pagar?.id}`} subtitle={modal?.pagar ? `${modal.pagar.proveedorNombre} · ${modal.pagar.comprobanteEtiqueta || "manual"} · ${money(modal.pagar.importe)}` : ""}
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mPagarK.isPending} onClick={() => mPagarK.mutate({ id: modal.pagar.id, medio: modal.medio, referencia: modal.referencia || undefined, cajaSesionId: modal.medio === "efectivo" && modal.usarCaja ? caja.data?.id : undefined })}>Pagar</Button></>)}>
        {modal?.pagar && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary">La promesa decía cuenta corriente; acá se dice con qué salió la plata de verdad. Si la factura tiene notas, se paga su saldo vivo.</Typography>
            <TextField select size="small" label="Medio real" value={modal.medio} onChange={(e) => setModal({ ...modal, medio: e.target.value })}>{Object.entries(MEDIOS_PAGO_PROV).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
            {modal.medio === "efectivo" && <FormControlLabel control={<Switch checked={modal.usarCaja} onChange={(e) => setModal({ ...modal, usarCaja: e.target.checked })} />} label={caja.data ? `Sale del cajón (turno #${caja.data.id})` : "Sale del cajón (no hay turno abierto)"} />}
            <TextField size="small" label="Referencia" value={modal.referencia} onChange={(e) => setModal({ ...modal, referencia: e.target.value })} />
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(modal?.echeq)} onClose={() => setModal(null)} title={modal?.echeq?.id ? "Editar echeq" : "Nuevo echeq"} subtitle={modal?.echeq?.compromisoId ? "Nació de una factura: su importe es el del compromiso." : "Un echeq suelto: al cobrarse queda como pago a cuenta del proveedor."}
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mCrearE.isPending || mEditarE.isPending} onClick={() => { const e = modal.echeq; const b = { numero: e.numero, banco: e.banco, fechaEmision: e.fechaEmision, fechaVenc: e.fechaVenc, obs: e.obs, ...(e.compromisoId ? {} : { importe: Number(e.importe) }) }; e.id ? mEditarE.mutate({ id: e.id, ...b }) : mCrearE.mutate({ ...b, proveedorId: Number(e.proveedorId) }); }}>Guardar</Button></>)}>
        {modal?.echeq && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Autocomplete size="small" options={proveedores.data || []} getOptionLabel={(p) => p.nombre} disabled={Boolean(modal.echeq.id)} value={(proveedores.data || []).find((p) => p.id === Number(modal.echeq.proveedorId)) || null} onChange={(_, v) => setModal({ echeq: { ...modal.echeq, proveedorId: v?.id || "" } })} renderInput={(p) => <TextField {...p} label={modal.echeq.id ? provNombre(modal.echeq.proveedorId) || "Proveedor" : "Proveedor"} />} />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
              <TextField size="small" label="Número" value={modal.echeq.numero} onChange={(e) => setModal({ echeq: { ...modal.echeq, numero: e.target.value } })} />
              <TextField size="small" label="Banco" value={modal.echeq.banco} onChange={(e) => setModal({ echeq: { ...modal.echeq, banco: e.target.value } })} />
              <TextField size="small" type="number" label="Importe" value={modal.echeq.importe} disabled={Boolean(modal.echeq.compromisoId)} onChange={(e) => setModal({ echeq: { ...modal.echeq, importe: e.target.value } })} />
              <TextField size="small" type="date" label="Emisión" value={modal.echeq.fechaEmision} onChange={(e) => setModal({ echeq: { ...modal.echeq, fechaEmision: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="Se debita" value={modal.echeq.fechaVenc} onChange={(e) => setModal({ echeq: { ...modal.echeq, fechaVenc: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <TextField size="small" label="Observaciones" value={modal.echeq.obs} onChange={(e) => setModal({ echeq: { ...modal.echeq, obs: e.target.value } })} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Vencimientos;
