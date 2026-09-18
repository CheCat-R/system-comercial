/**
 * COBRANZAS — recibos de cuenta corriente. Se elige el cliente, se ve su
 * cuenta (saldo y comprobantes que deben), se cargan los medios y se imputa a
 * mano o en automático (los más viejos primero). Lo no imputado queda a cuenta.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { ventasApi, MEDIOS_PAGO, money, stamp } from "./api/ventasApi";
import { r2 } from "./domain/pos";

const ESTADOS = { confirmada: { label: "Confirmada", tone: "success" }, anulada: { label: "Anulada", tone: "error" } };

const Cobranzas = () => {
  const { showToast } = useToast();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(null);
  const [ver, setVer] = useState(null);
  const [anular, setAnular] = useState(null);

  const lista = useQuery({ queryKey: ["cobranzas"], queryFn: () => ventasApi.cobranzas.listar({ limit: 200 }) });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const clientes = useMemo(() => (boot.data?.clientes || []).filter((c) => !c.esConsumidorFinal && c.activo), [boot.data]);
  const cuenta = useQuery({ queryKey: ["cuenta", nuevo?.clienteId], queryFn: () => ventasApi.cuenta(nuevo.clienteId), enabled: Boolean(nuevo?.clienteId) });
  const detalle = useQuery({ queryKey: ["cobranza", ver], queryFn: () => ventasApi.cobranzas.get(ver), enabled: Boolean(ver) });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["cobranzas"] }); qc.invalidateQueries({ queryKey: ["cuenta"] }); qc.invalidateQueries({ queryKey: ["pos"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mCrear = useMutation({ mutationFn: (b) => ventasApi.cobranzas.crear(b), onSuccess: (r) => { showToast(`Recibo ${r.puntoVenta}-${String(r.numero).padStart(8, "0")} por ${money(r.total)}.`, "success"); setNuevo(null); invalidar(); }, onError: err });
  const mAnular = useMutation({ mutationFn: ({ id, motivo }) => ventasApi.cobranzas.anular(id, motivo), onSuccess: () => { showToast("Recibo anulado.", "success"); setAnular(null); setVer(null); invalidar(); }, onError: err });

  const abrirNuevo = () => setNuevo({ clienteId: null, pagos: [{ medio: "efectivo", importe: "", referencia: "" }], imputaciones: {}, auto: true, observaciones: "" });
  const total = nuevo ? r2(nuevo.pagos.reduce((a, p) => a + (Number(p.importe) || 0), 0)) : 0;
  const imputado = nuevo ? r2(Object.values(nuevo.imputaciones).reduce((a, v) => a + (Number(v) || 0), 0)) : 0;
  const setPago = (i, patch) => setNuevo({ ...nuevo, pagos: nuevo.pagos.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const guardar = () => {
    const pagos = nuevo.pagos.filter((p) => Number(p.importe) > 0).map((p) => ({ ...p, importe: Number(p.importe) }));
    const imputaciones = nuevo.auto ? undefined : Object.entries(nuevo.imputaciones).filter(([, v]) => Number(v) > 0).map(([ventaId, importe]) => ({ ventaId: Number(ventaId), importe: Number(importe) }));
    mCrear.mutate({ clienteId: nuevo.clienteId, pagos, imputaciones, auto: nuevo.auto, observaciones: nuevo.observaciones || undefined });
  };

  const columns = [
    { field: "fecha", headerName: "Fecha", renderCell: (c) => <span className="nowrap">{stamp(c.fecha)}</span> },
    { field: "numero", headerName: "Recibo", renderCell: (c) => <strong>{c.puntoVenta}-{String(c.numero).padStart(8, "0")}</strong> },
    { field: "clienteNombre", headerName: "Cliente" },
    { field: "pagos", headerName: "Medios", sortable: false, renderCell: (c) => <span className="text-tertiary">{(c.pagos || []).map((p) => MEDIOS_PAGO[p.medio] || p.medio).join(" + ")}</span> },
    { field: "total", headerName: "Total", align: "right", renderCell: (c) => <strong>{money(c.total)}</strong> },
    { field: "aCuenta", headerName: "A cuenta", align: "right", renderCell: (c) => (c.aCuenta > 0 ? money(c.aCuenta) : <span className="text-tertiary">—</span>) },
    { field: "estado", headerName: "Estado", renderCell: (c) => <StatusBadge tone={ESTADOS[c.estado]?.tone} label={ESTADOS[c.estado]?.label || c.estado} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Cobranzas" subtitle="Recibos de cuenta corriente: la plata que entra después de la venta, imputada a los comprobantes que la esperan." actions={<Button variant="primary" startIcon={<AddIcon />} onClick={abrirNuevo}>Nuevo recibo</Button>} />
      <DataTable columns={columns} data={lista.data || []} loading={lista.isLoading} emptyMessage="Todavía no hay recibos." onRowClick={(c) => setVer(c.id)} pagination={{ pageSize: 25 }} />

      <Modal open={Boolean(nuevo)} onClose={() => setNuevo(null)} title="Nuevo recibo" subtitle="Cargá los medios y a qué comprobantes se imputa. Lo que sobra queda a cuenta y baja igual el saldo." maxWidth="md"
        actions={(<><Button variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button><Button variant="primary" loading={mCrear.isPending} disabled={!nuevo?.clienteId || total <= 0 || (!nuevo?.auto && imputado > total + 0.009)} onClick={guardar}>Registrar {money(total)}</Button></>)}>
        {nuevo && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Autocomplete size="small" options={clientes} getOptionLabel={(c) => c.nombre} value={clientes.find((c) => c.id === nuevo.clienteId) || null} onChange={(_, c) => setNuevo({ ...nuevo, clienteId: c?.id ?? null, imputaciones: {} })} renderInput={(p) => <TextField {...p} label="Cliente" autoFocus />} />
            {cuenta.data && (
              <Box className="entity-card" sx={{ p: 2 }}>
                <Typography variant="body2"><strong>Saldo: {money(cuenta.data.saldo)}</strong>{cuenta.data.disponible != null ? ` · disponible ${money(cuenta.data.disponible)} de ${money(cuenta.data.limiteCredito)}` : ""} · facturado {money(cuenta.data.facturado)} · cobrado {money(cuenta.data.cobrado)}</Typography>
                <FormControlLabel control={<Checkbox checked={nuevo.auto} onChange={(e) => setNuevo({ ...nuevo, auto: e.target.checked })} />} label="Imputar en automático (los comprobantes más viejos primero)" />
                {cuenta.data.comprobantes.length === 0 && <Typography variant="caption" color="text.secondary">No hay comprobantes con saldo: todo queda a cuenta.</Typography>}
                {cuenta.data.comprobantes.map((c) => (
                  <Box key={c.id} sx={{ display: "grid", gridTemplateColumns: "1fr auto 140px", gap: 1, alignItems: "center", py: 0.5 }}>
                    <span>{c.etiqueta} <small className="text-tertiary">{stamp(c.fecha)}{c.vencimientoPago ? ` · vence ${stamp(c.vencimientoPago)}` : ""}</small></span>
                    <span className="text-tertiary">debe {money(c.saldo)}</span>
                    {!nuevo.auto && <TextField size="small" type="number" placeholder="0" value={nuevo.imputaciones[c.id] ?? ""} onChange={(e) => setNuevo({ ...nuevo, imputaciones: { ...nuevo.imputaciones, [c.id]: Math.min(c.saldo, Math.max(0, Number(e.target.value) || 0)) } })} />}
                  </Box>
                ))}
              </Box>
            )}
            <Box sx={{ display: "grid", gap: 1 }}>
              {nuevo.pagos.map((p, i) => (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 1, alignItems: "center" }}>
                  <TextField select size="small" label="Medio" value={p.medio} onChange={(e) => setPago(i, { medio: e.target.value })}>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
                  <TextField size="small" type="number" label="Importe" value={p.importe} onChange={(e) => setPago(i, { importe: e.target.value })} />
                  <TextField size="small" label="Referencia" value={p.referencia} onChange={(e) => setPago(i, { referencia: e.target.value })} />
                  <IconButton size="small" disabled={nuevo.pagos.length === 1} onClick={() => setNuevo({ ...nuevo, pagos: nuevo.pagos.filter((_, j) => j !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              ))}
              <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setNuevo({ ...nuevo, pagos: [...nuevo.pagos, { medio: "transferencia", importe: "", referencia: "" }] })}>Otro medio</Button></Box>
            </Box>
            {!nuevo.auto && imputado > total + 0.009 && <Alert severity="warning">Estás imputando {money(imputado)} y el recibo es de {money(total)}.</Alert>}
            {!nuevo.auto && total - imputado > 0.009 && <Typography variant="caption" color="text.secondary">{money(total - imputado)} quedan a cuenta.</Typography>}
            <TextField size="small" label="Observaciones" value={nuevo.observaciones} onChange={(e) => setNuevo({ ...nuevo, observaciones: e.target.value })} />
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(ver)} onClose={() => setVer(null)} title={detalle.data ? `Recibo ${detalle.data.puntoVenta}-${String(detalle.data.numero).padStart(8, "0")}` : "Recibo"} subtitle={detalle.data ? `${detalle.data.clienteNombre} · ${stamp(detalle.data.fecha)} · ${detalle.data.usuarioNombre || ""}` : ""} maxWidth="sm"
        actions={(<><Button variant="ghost" onClick={() => setVer(null)}>Cerrar</Button>{detalle.data?.estado === "confirmada" && <Tooltip title={can("devoluciones") ? "" : "Pide la llave devoluciones."}><span><Button variant="danger" disabled={!can("devoluciones")} onClick={() => setAnular("")}>Anular</Button></span></Tooltip>}</>)}>
        {detalle.data && (
          <Box sx={{ display: "grid", gap: 1, pt: 1 }}>
            {detalle.data.estado === "anulada" && <Alert severity="error">Anulado {stamp(detalle.data.anuladoEn)}: {detalle.data.anuladoMotivo}</Alert>}
            <Typography variant="subtitle2">Medios</Typography>
            {detalle.data.pagos.map((p) => <Box key={p.id} sx={{ display: "flex", justifyContent: "space-between" }}><span>{MEDIOS_PAGO[p.medio] || p.medio}{p.referencia ? ` · ${p.referencia}` : ""}</span><strong>{money(p.importe)}</strong></Box>)}
            <Typography variant="subtitle2" sx={{ mt: 1 }}>Imputaciones</Typography>
            {detalle.data.imputaciones.length === 0 && <Typography variant="body2" color="text.secondary">Todo a cuenta.</Typography>}
            {detalle.data.imputaciones.map((i) => <Box key={i.id} sx={{ display: "flex", justifyContent: "space-between" }}><span>{i.etiqueta}</span><strong>{money(i.importe)}</strong></Box>)}
            <Box sx={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", pt: 1, mt: 1 }}><span>Total {detalle.data.aCuenta > 0 ? `(a cuenta ${money(detalle.data.aCuenta)})` : ""}</span><strong>{money(detalle.data.total)}</strong></Box>
          </Box>
        )}
      </Modal>

      <Modal open={anular !== null} onClose={() => setAnular(null)} title="Anular el recibo" subtitle="Le saca la plata al arqueo del turno y le sube el saldo al cliente." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setAnular(null)}>Cancelar</Button><Button variant="danger-solid" loading={mAnular.isPending} disabled={!anular?.trim()} onClick={() => mAnular.mutate({ id: ver, motivo: anular })}>Anular</Button></>)}>
        <TextField fullWidth size="small" label="Motivo" value={anular || ""} onChange={(e) => setAnular(e.target.value)} sx={{ mt: 1 }} autoFocus />
      </Modal>
    </Box>
  );
};

export default Cobranzas;
