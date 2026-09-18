/**
 * CAJA — el turno de la sucursal. Abrir con fondo, ver el arqueo en vivo
 * (por medio, ingresos/egresos, efectivo esperado), controles intermedios,
 * movimientos manuales (llave `diferencias`) y el cierre con la diferencia
 * declarada. Debajo, el historial de turnos cerrados.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import StatCard from "../../components/Cards/StatCard/StatCard";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { ventasApi, MEDIOS_PAGO, money, stamp } from "./api/ventasApi";
import "./Caja.css";

const Caja = () => {
  const { user, can, check } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const sucursalId = user?.sucursalId;
  const [modal, setModal] = useState(null); // { tipo: 'abrir'|'cerrar'|'control'|'movimiento', ...campos }

  const actual = useQuery({ queryKey: ["pos", "caja", sucursalId], queryFn: () => ventasApi.caja.actual(sucursalId), enabled: Boolean(sucursalId) });
  const turno = actual.data;
  const arqueo = useQuery({ queryKey: ["caja", "arqueo", turno?.id], queryFn: () => ventasApi.caja.arqueo(turno.id), enabled: Boolean(turno?.id), refetchInterval: 30_000 });
  const historial = useQuery({ queryKey: ["caja", "historial", sucursalId], queryFn: () => ventasApi.caja.listar({ estado: "cerrada", limit: 30 }) });
  const puede = check("ventas.caja");

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["pos", "caja", sucursalId] }); qc.invalidateQueries({ queryKey: ["caja"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mAbrir = useMutation({ mutationFn: (b) => ventasApi.caja.abrir(b), onSuccess: () => { showToast("Turno abierto.", "success"); setModal(null); invalidar(); }, onError: err });
  const mCerrar = useMutation({ mutationFn: (b) => ventasApi.caja.cerrar(turno.id, b), onSuccess: (c) => { showToast(`Turno cerrado. Diferencia: ${money(c.diferencia)}.`, c.diferencia === 0 ? "success" : "warning"); setModal(null); invalidar(); }, onError: err });
  const mControl = useMutation({ mutationFn: (b) => ventasApi.caja.control(turno.id, b), onSuccess: (c) => { showToast(`Control registrado. Diferencia: ${money(c.diferencia)}.`, c.diferencia === 0 ? "success" : "warning"); setModal(null); invalidar(); }, onError: err });
  const mMov = useMutation({ mutationFn: (b) => ventasApi.caja.movimiento(turno.id, b), onSuccess: () => { showToast("Movimiento registrado.", "success"); setModal(null); invalidar(); }, onError: err });

  const a = arqueo.data;
  const medios = a ? Object.entries(a.medios) : [];

  const columnasHist = [
    { field: "apertura", headerName: "Turno", renderCell: (t) => <Box><strong>#{t.id}</strong><Typography variant="caption" display="block" color="text.secondary">{stamp(t.apertura)} → {stamp(t.cierre)}</Typography></Box> },
    { field: "usuarioNombre", headerName: "Abrió", renderCell: (t) => <span className="text-tertiary">{t.usuarioNombre || "—"}</span> },
    { field: "montoInicial", headerName: "Fondo", align: "right", renderCell: (t) => money(t.montoInicial) },
    { field: "sistemaEfectivo", headerName: "Esperado", align: "right", renderCell: (t) => money(t.sistemaEfectivo) },
    { field: "declaradoEfectivo", headerName: "Declarado", align: "right", renderCell: (t) => money(t.declaradoEfectivo) },
    { field: "diferencia", headerName: "Diferencia", align: "right", renderCell: (t) => <strong className={t.diferencia < 0 ? "caja-neg" : t.diferencia > 0 ? "caja-pos" : ""}>{money(t.diferencia)}</strong> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Caja" subtitle={`${user?.sucursalNombre || ""}. Sin turno abierto no se cobra al contado; al cerrar se cuenta el efectivo y el arqueo queda firmado.`}
        actions={turno ? (<>
          <Button variant="ghost" onClick={() => setModal({ tipo: "control", contadoEfectivo: "", observaciones: "" })}>Control intermedio</Button>
          <Tooltip title={can("diferencias") ? "" : "Mover plata del cajón pide la llave diferencias."}><span><Button variant="secondary" disabled={!can("diferencias")} onClick={() => setModal({ tipo: "movimiento", tipoMov: "egreso", importe: "", motivo: "" })}>Ingreso / egreso</Button></span></Tooltip>
          <Button variant="primary" onClick={() => setModal({ tipo: "cerrar", declaradoEfectivo: "", observaciones: "" })}>Cerrar turno</Button>
        </>) : (
          <Tooltip title={puede.allowed ? "" : puede.reason}><span><Button variant="primary" disabled={!puede.allowed} onClick={() => setModal({ tipo: "abrir", montoInicial: "", observaciones: "" })}>Abrir turno</Button></span></Tooltip>
        )} />

      {!turno && !actual.isLoading && <Box className="caja-vacia"><Typography color="text.secondary">No hay un turno abierto en {user?.sucursalNombre}. Abrilo declarando el fondo inicial del cajón.</Typography></Box>}

      {turno && a && (
        <>
          <Box className="caja-cab">
            <StatusBadge tone="success" label={`Turno #${turno.id} abierto ${stamp(turno.apertura)}`} />
            {a.sesion?.usuarioId && <span className="text-tertiary">abrió usuario #{a.sesion.usuarioId}</span>}
          </Box>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Efectivo esperado" value={money(a.esperadoEfectivo)} hint={`fondo ${money(a.montoInicial)} + efectivo ${money(a.medios.efectivo?.total || 0)} + ${money(a.ingresos)} − ${money(a.egresos)}`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Cobrado (todos los medios)" value={money(a.totalCobrado)} hint={`${medios.length} medio(s)`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Cuenta corriente" value={money(a.ctaCte.total)} hint={`${a.ctaCte.cantidad} venta(s) sin plata en caja`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><StatCard title="Movimientos manuales" value={`${money(a.ingresos)} / −${money(a.egresos)}`} hint={`${a.movimientos.length} registro(s)`} /></Grid>
          </Grid>
          <Box className="caja-grid">
            <Box className="caja-bloque">
              <h6>Por medio de pago</h6>
              {medios.length === 0 && <Typography variant="body2" color="text.secondary">Todavía no entró plata.</Typography>}
              {medios.map(([m, v]) => <div key={m} className="caja-kv"><span>{MEDIOS_PAGO[m] || m}<small> ventas {money(v.ventas)} · recibos {money(v.cobranzas)}</small></span><strong>{money(v.total)}</strong></div>)}
            </Box>
            <Box className="caja-bloque">
              <h6>Movimientos manuales</h6>
              {a.movimientos.length === 0 && <Typography variant="body2" color="text.secondary">Ninguno.</Typography>}
              {a.movimientos.map((m) => <div key={m.id} className="caja-kv"><span>{m.motivo}<small>{stamp(m.fecha)}{m.usuarioNombre ? ` · ${m.usuarioNombre}` : ""}</small></span><strong className={m.tipo === "egreso" ? "caja-neg" : "caja-pos"}>{m.tipo === "egreso" ? "−" : "+"}{money(m.importe)}</strong></div>)}
            </Box>
            <Box className="caja-bloque">
              <h6>Controles del turno</h6>
              {a.controles.length === 0 && <Typography variant="body2" color="text.secondary">Sin conteos intermedios.</Typography>}
              {a.controles.map((c) => <div key={c.id} className="caja-kv"><span>{stamp(c.fecha)}{c.usuarioNombre ? ` · ${c.usuarioNombre}` : ""}<small>esperado {money(c.esperadoEfectivo)} · contado {money(c.contadoEfectivo)}{c.observaciones ? ` · ${c.observaciones}` : ""}</small></span><strong className={c.diferencia < 0 ? "caja-neg" : c.diferencia > 0 ? "caja-pos" : ""}>{money(c.diferencia)}</strong></div>)}
            </Box>
          </Box>
        </>
      )}

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Turnos cerrados</Typography>
      <DataTable columns={columnasHist} data={historial.data || []} loading={historial.isLoading} emptyMessage="Todavía no se cerró ningún turno." />

      <Modal open={modal?.tipo === "abrir"} onClose={() => setModal(null)} title="Abrir turno de caja" subtitle="El fondo inicial es obligatorio: es el punto de partida del arqueo." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mAbrir.isPending} onClick={() => mAbrir.mutate({ montoInicial: Number(modal.montoInicial), observaciones: modal.observaciones })}>Abrir</Button></>)}>
        {modal?.tipo === "abrir" && <Box sx={{ display: "grid", gap: 2, pt: 1 }}><TextField autoFocus size="small" type="number" label="Fondo inicial (efectivo en el cajón)" value={modal.montoInicial} onChange={(e) => setModal({ ...modal, montoInicial: e.target.value })} /><TextField size="small" label="Observaciones" value={modal.observaciones} onChange={(e) => setModal({ ...modal, observaciones: e.target.value })} /></Box>}
      </Modal>

      <Modal open={modal?.tipo === "cerrar"} onClose={() => setModal(null)} title="Cerrar el turno" subtitle={`Contá el efectivo del cajón. El sistema espera ${money(a?.esperadoEfectivo || 0)}.`} maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mCerrar.isPending} onClick={() => mCerrar.mutate({ declaradoEfectivo: Number(modal.declaradoEfectivo), observaciones: modal.observaciones || undefined })}>Cerrar turno</Button></>)}>
        {modal?.tipo === "cerrar" && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField autoFocus size="small" type="number" label="Efectivo contado" value={modal.declaradoEfectivo} onChange={(e) => setModal({ ...modal, declaradoEfectivo: e.target.value })} />
            {modal.declaradoEfectivo !== "" && <Typography variant="body2" className={Number(modal.declaradoEfectivo) - (a?.esperadoEfectivo || 0) < 0 ? "caja-neg" : "caja-pos"}>Diferencia: {money(Number(modal.declaradoEfectivo) - (a?.esperadoEfectivo || 0))}</Typography>}
            <TextField size="small" label="Observaciones" value={modal.observaciones} onChange={(e) => setModal({ ...modal, observaciones: e.target.value })} multiline minRows={2} />
          </Box>
        )}
      </Modal>

      <Modal open={modal?.tipo === "control"} onClose={() => setModal(null)} title="Control intermedio" subtitle="Un conteo sin cerrar: para que el faltante se vea a las 14 y no a la noche." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mControl.isPending} onClick={() => mControl.mutate({ contadoEfectivo: Number(modal.contadoEfectivo), observaciones: modal.observaciones })}>Registrar</Button></>)}>
        {modal?.tipo === "control" && <Box sx={{ display: "grid", gap: 2, pt: 1 }}><TextField autoFocus size="small" type="number" label="Efectivo contado" value={modal.contadoEfectivo} onChange={(e) => setModal({ ...modal, contadoEfectivo: e.target.value })} helperText={`Esperado ahora: ${money(a?.esperadoEfectivo || 0)}`} /><TextField size="small" label="Observaciones" value={modal.observaciones} onChange={(e) => setModal({ ...modal, observaciones: e.target.value })} /></Box>}
      </Modal>

      <Modal open={modal?.tipo === "movimiento"} onClose={() => setModal(null)} title="Ingreso / egreso manual" subtitle="Plata que entra o sale del cajón sin ser una venta (retiro, flete, cambio)." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" loading={mMov.isPending} onClick={() => mMov.mutate({ tipo: modal.tipoMov, importe: Number(modal.importe), motivo: modal.motivo })}>Registrar</Button></>)}>
        {modal?.tipo === "movimiento" && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField select size="small" label="Tipo" value={modal.tipoMov} onChange={(e) => setModal({ ...modal, tipoMov: e.target.value })}><MenuItem value="egreso">Egreso (sale plata)</MenuItem><MenuItem value="ingreso">Ingreso (entra plata)</MenuItem></TextField>
            <TextField autoFocus size="small" type="number" label="Importe" value={modal.importe} onChange={(e) => setModal({ ...modal, importe: e.target.value })} />
            <TextField size="small" label="Motivo" value={modal.motivo} onChange={(e) => setModal({ ...modal, motivo: e.target.value })} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Caja;
