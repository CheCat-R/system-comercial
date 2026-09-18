/**
 * Un presupuesto: renglones con el stock disponible al lado (el faltante se
 * ve antes de confirmar), el armado (lo que se preparó de verdad), y las
 * transiciones: enviar, reabrir, confirmar, cancelar, aceptar (pedido web),
 * delegar y «Cerrar en el POS».
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { ventasApi, ENTREGAS, ESTADOS_PRESUPUESTO, money, num, stamp } from "./api/ventasApi";
import EditorPresupuesto from "./components/EditorPresupuesto";
import "./Ventas.css";

const PresupuestoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { setLabel } = useEntityLabel();
  const [editar, setEditar] = useState(null);
  const [armado, setArmado] = useState(null);
  const [cancelar, setCancelar] = useState(null);
  const [aceptar, setAceptar] = useState(null);
  const [delegar, setDelegar] = useState(null);

  const q = useQuery({ queryKey: ["presupuesto", id], queryFn: () => ventasApi.presupuestos.get(id) });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const catalogo = useQuery({ queryKey: ["pos", "catalogo", user?.sucursalId], queryFn: () => ventasApi.catalogo(user?.sucursalId), enabled: Boolean(editar) && Boolean(user?.sucursalId), staleTime: 5 * 60_000 });
  const p = q.data;
  useEffect(() => { if (p) setLabel(id, p.codigo || `Presupuesto #${id}`); }, [id, p, setLabel]);

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["presupuesto", id] }); qc.invalidateQueries({ queryKey: ["presupuestos"] }); qc.invalidateQueries({ queryKey: ["pos"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const useAccion = (fn, ok) => useMutation({ mutationFn: fn, onSuccess: (r) => { if (ok) showToast(typeof ok === "function" ? ok(r) : ok, "success"); invalidar(); setEditar(null); setArmado(null); setCancelar(null); setAceptar(null); setDelegar(null); }, onError: err });
  const mEnviar = useAccion(() => ventasApi.presupuestos.enviar(id), (r) => `Enviado: vale ${r.dias} días.`);
  const mReabrir = useAccion(() => ventasApi.presupuestos.reabrir(id), "Reabierto como borrador para re-cotizar.");
  const mConfirmar = useAccion(() => ventasApi.presupuestos.confirmar(id), (r) => (r.reservado ? "Confirmado: la mercadería quedó reservada." : "Confirmado."));
  const mCancelar = useAccion((motivo) => ventasApi.presupuestos.cancelar(id, motivo), "Cancelado.");
  const mActualizar = useAccion((b) => ventasApi.presupuestos.actualizar(id, b), "Presupuesto actualizado.");
  const mArmar = useAccion((items) => ventasApi.presupuestos.armar(id, items), "Armado guardado.");
  const mAceptar = useAccion((b) => ventasApi.presupuestos.aceptar(id, b), "Pedido aceptado: ahora es un presupuesto enviado.");
  const mDelegar = useAccion((vendedorId) => ventasApi.presupuestos.delegar(id, vendedorId), "Vendedor asignado.");

  if (q.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!p) return <Box className="page"><Typography>Presupuesto inexistente.</Typography></Box>;

  const est = p.estado;
  const abrirEdicion = () => setEditar({ clienteId: p.clienteId, entrega: p.entrega, observaciones: p.observaciones || "", items: p.items.map((it) => ({ productoId: it.productoId, presentacionId: it.presentacionId, nombre: it.nombre, detalle: it.detalle, cantidad: it.cantidad, precioLista: it.precioLista, descuento: it.descuento, iva: it.iva, listaId: it.listaId, lista: it.lista })) });
  const faltantes = p.items.filter((it) => !it.alcanza);

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${ENTREGAS[p.entrega] || p.entrega} · ${p.vendedorNombre ? `vendedor ${p.vendedorNombre}` : "sin vendedor"}`}
        title={`${p.codigo} · ${p.clienteNombre || (p.webCliente ? `${p.webCliente.nombre} ${p.webCliente.apellido}` : "sin cliente")}`}
        subtitle={`Cotizado ${stamp(p.fecha)}${p.vencimiento ? ` · vence ${stamp(p.vencimiento)}` : ""}${p.ventaId ? ` · cerrado en la venta #${p.ventaId}` : ""}`}
        badges={<><StatusBadge tone={p.vencido ? "error" : ESTADOS_PRESUPUESTO[est]?.tone} label={p.vencido ? "Vencido" : ESTADOS_PRESUPUESTO[est]?.label} />{p.reservado && est === "confirmado" && <StatusBadge tone="info" label="Stock reservado" showDot={false} />}{p.origen === "web" && <StatusBadge tone="neutral" label="Pedido web" showDot={false} />}</>}
        onBack={() => navigate("/ventas/presupuestos")}
        actions={(<>
          {est === "pendiente" && <Button size="small" variant="primary" onClick={() => setAceptar({ clienteId: p.clienteId ?? "", crearCliente: !p.clienteId })}>Aceptar pedido</Button>}
          {est === "borrador" && <><Button size="small" variant="ghost" onClick={abrirEdicion}>Editar</Button><Button size="small" variant="primary" loading={mEnviar.isPending} onClick={() => mEnviar.mutate()}>Enviar al cliente</Button></>}
          {est === "enviado" && <><Button size="small" variant="ghost" loading={mReabrir.isPending} onClick={() => mReabrir.mutate()}>Reabrir</Button><Button size="small" variant="primary" disabled={p.vencido} loading={mConfirmar.isPending} onClick={() => mConfirmar.mutate()}>El cliente confirmó</Button></>}
          {est === "confirmado" && <><Button size="small" variant="ghost" onClick={() => setArmado(Object.fromEntries(p.items.map((it) => [it.id, { cantidadArmada: it.cantidadArmada ?? it.cantidad, motivo: it.motivo || "" }])))}>Cargar armado</Button><Button size="small" variant="primary" startIcon={<PointOfSaleIcon />} onClick={() => navigate(`/ventas/pos?presupuesto=${p.id}`)}>Cerrar en el POS</Button></>}
          {!["cerrado", "cancelado"].includes(est) && <><Button size="small" variant="ghost" onClick={() => setDelegar(p.vendedorId ?? "")}>Vendedor…</Button><Button size="small" variant="danger" onClick={() => setCancelar("")}>Cancelar</Button></>}
          {p.ventaId && <Button size="small" variant="secondary" onClick={() => navigate(`/ventas/${p.ventaId}`)}>Ver venta</Button>}
        </>)}
      />

      {p.vencido && <Alert severity="warning" sx={{ mb: 2 }}>Venció: reabrilo y re-cotizalo antes de confirmar. Los precios pueden haber cambiado.</Alert>}
      {est === "confirmado" && faltantes.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{faltantes.length} renglón(es) no tienen stock suficiente en {user?.sucursalNombre}.</Alert>}
      {p.webCliente && <Alert severity="info" sx={{ mb: 2 }}>Datos del formulario web: {p.webCliente.nombre} {p.webCliente.apellido} · DNI {p.webCliente.dni} · tel. {p.webCliente.telefono}{p.webCliente.direccion ? ` · ${p.webCliente.direccion}, ${p.webCliente.localidad || ""}` : ""}</Alert>}

      <Box className="venta-detalle">
        <Box className="venta-bloque" sx={{ p: "0 !important" }}>
          <table className="venta-tabla">
            <thead><tr><th>Artículo</th><th className="r">Pedido</th>{est === "confirmado" && <th className="r">Armado</th>}<th className="r">Disponible</th><th>Lista</th><th className="r">Neto</th><th className="r">Desc.</th><th className="r">Total c/IVA</th></tr></thead>
            <tbody>
              {p.items.map((it) => (
                <tr key={it.id}>
                  <td><strong>{it.nombre}</strong> <small className="text-tertiary">{it.detalle}</small>{it.motivo && <Typography variant="caption" display="block" color="warning.main">{it.motivo}</Typography>}</td>
                  <td className="r">{num(it.cantidad, 3)}</td>
                  {est === "confirmado" && <td className="r">{it.cantidadArmada == null ? <span className="text-tertiary">—</span> : num(it.cantidadArmada, 3)}</td>}
                  <td className={`r ${it.alcanza ? "" : "ventas-num--neg"}`}>{num(it.disponible, 3)}</td>
                  <td><span className="text-tertiary">{it.lista || "—"}</span></td>
                  <td className="r">{money(it.precioLista)}</td>
                  <td className="r">{it.descuento > 0 ? `${num(it.descuento)}%` : "—"}</td>
                  <td className="r"><strong>{money(it.cantidad * it.precioLista * (1 - it.descuento / 100) * (1 + it.iva / 100))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box className="venta-bloque">
            <h6>Totales congelados</h6>
            <div className="venta-kv"><span>Neto</span><strong>{money(p.subtotalNeto)}</strong></div>
            <div className="venta-kv"><span>IVA</span><strong>{money(p.ivaTotal)}</strong></div>
            <div className="venta-kv venta-kv--total"><span>Total</span><strong>{money(p.total)}</strong></div>
          </Box>
          {p.observaciones && <Box className="venta-bloque"><h6>Observaciones</h6><div className="venta-obs">{p.observaciones}</div></Box>}
        </Box>
      </Box>

      <Modal open={Boolean(editar)} onClose={() => setEditar(null)} title={`Editar ${p.codigo}`} maxWidth="lg"
        actions={(<><Button variant="ghost" onClick={() => setEditar(null)}>Cancelar</Button><Button variant="primary" loading={mActualizar.isPending} disabled={!editar?.items.length} onClick={() => mActualizar.mutate(editar)}>Guardar</Button></>)}>
        {editar && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField select size="small" label="Entrega" value={editar.entrega} onChange={(e) => setEditar({ ...editar, entrega: e.target.value })} sx={{ maxWidth: 240 }}>{Object.entries(ENTREGAS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
            {catalogo.data ? <EditorPresupuesto valor={editar} onChange={setEditar} catalogo={catalogo.data.items} listas={catalogo.data.listas} /> : <Typography variant="body2" color="text.secondary">Cargando catálogo…</Typography>}
            <TextField size="small" label="Observaciones" value={editar.observaciones} onChange={(e) => setEditar({ ...editar, observaciones: e.target.value })} multiline minRows={2} />
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(armado)} onClose={() => setArmado(null)} title="Armado del pedido" subtitle="Lo que se preparó de verdad. Si falta algo, anotá el motivo: es lo que el POS carga al cerrar." maxWidth="sm"
        actions={(<><Button variant="ghost" onClick={() => setArmado(null)}>Cancelar</Button><Button variant="primary" loading={mArmar.isPending} onClick={() => mArmar.mutate(Object.entries(armado).map(([itemId, v]) => ({ itemId: Number(itemId), cantidadArmada: Number(v.cantidadArmada), motivo: v.motivo })))}>Guardar</Button></>)}>
        {armado && p.items.map((it) => (
          <Box key={it.id} sx={{ display: "grid", gridTemplateColumns: "1.4fr 110px 1fr", gap: 1, alignItems: "center", py: 0.5 }}>
            <span>{it.nombre} <small className="text-tertiary">pedido {num(it.cantidad, 3)}</small></span>
            <TextField size="small" type="number" label="Armado" value={armado[it.id].cantidadArmada} onChange={(e) => setArmado({ ...armado, [it.id]: { ...armado[it.id], cantidadArmada: e.target.value } })} />
            <TextField size="small" label="Motivo" value={armado[it.id].motivo} onChange={(e) => setArmado({ ...armado, [it.id]: { ...armado[it.id], motivo: e.target.value } })} />
          </Box>
        ))}
      </Modal>

      <Modal open={cancelar !== null} onClose={() => setCancelar(null)} title="Cancelar el presupuesto" subtitle={p.reservado ? "Libera la mercadería reservada." : undefined} maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setCancelar(null)}>Volver</Button><Button variant="danger-solid" loading={mCancelar.isPending} onClick={() => mCancelar.mutate(cancelar)}>Cancelar presupuesto</Button></>)}>
        <TextField fullWidth size="small" label="Motivo (opcional)" value={cancelar || ""} onChange={(e) => setCancelar(e.target.value)} sx={{ mt: 1 }} />
      </Modal>

      <Modal open={Boolean(aceptar)} onClose={() => setAceptar(null)} title="Aceptar el pedido web" subtitle="Pasa a enviado con el vencimiento configurado. Si el cliente no existe, se crea con los datos del formulario." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setAceptar(null)}>Cancelar</Button><Button variant="primary" loading={mAceptar.isPending} onClick={() => mAceptar.mutate({ clienteId: aceptar.clienteId || undefined, crearCliente: aceptar.crearCliente })}>Aceptar</Button></>)}>
        {aceptar && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField select size="small" label="Asignar a un cliente existente" value={aceptar.clienteId} onChange={(e) => setAceptar({ ...aceptar, clienteId: e.target.value })}><MenuItem value="">—</MenuItem>{(boot.data?.clientes || []).filter((c) => !c.esConsumidorFinal).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
            <FormControlLabel control={<Checkbox checked={aceptar.crearCliente} onChange={(e) => setAceptar({ ...aceptar, crearCliente: e.target.checked })} />} label="Si no hay coincidencia, crearlo como cliente nuevo" />
          </Box>
        )}
      </Modal>

      <Modal open={delegar !== null} onClose={() => setDelegar(null)} title="Vendedor del pedido" maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setDelegar(null)}>Cancelar</Button><Button variant="primary" loading={mDelegar.isPending} onClick={() => mDelegar.mutate(delegar ? Number(delegar) : null)}>Guardar</Button></>)}>
        <TextField select fullWidth size="small" label="Vendedor" value={delegar ?? ""} onChange={(e) => setDelegar(e.target.value)} sx={{ mt: 1 }}><MenuItem value="">Sin asignar</MenuItem>{(boot.data?.usuarios || []).filter((u) => u.activo).map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}</MenuItem>)}</TextField>
      </Modal>
    </Box>
  );
};

export default PresupuestoDetalle;
