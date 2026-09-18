/**
 * Una transferencia, en todos sus estados:
 *   borrador  → el destino arma renglones y envía
 *   pendiente → el origen la toma (preparada)
 *   preparada → el origen ajusta lo preparado, agrega renglones y CONFIRMA cada
 *               lista (enteros / granel): confirmar es reservar
 *   transito  → el destino recibe contando; el faltante queda en incidencia
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Autocomplete from "@mui/material/Autocomplete";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";

import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { QK } from "../../app/api/queryClient";
import { inventarioApi, ESTADOS_TRANSFER, PASOS_TRANSFER, num, fmtTam, formaDe, stamp } from "./api/inventarioApi";
import { useInventarioBase } from "./hooks/useInventario";
import { seguridadApi } from "../seguridad/api/seguridadApi";
import "./TransferenciaDetalle.css";

const TransferenciaDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, esJefe, check } = useAuth();
  const qc = useQueryClient();
  const { productos, productoDe, sucursalDe, cantidad } = useInventarioBase();

  const t = useQuery({ queryKey: QK.transferencia(id), queryFn: () => inventarioApi.transferencias.get(id) });
  const usuarios = useQuery({ queryKey: QK.usuarios, queryFn: seguridadApi.usuarios, enabled: esJefe });
  const data = t.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (data) setLabel(id, data.codigo || `Pedido #${id}`); }, [id, data, setLabel]);

  // Borrador: renglones locales hasta guardar. Recepción: lo contado.
  const [renglones, setRenglones] = useState([]);
  const [obs, setObs] = useState("");
  const [contado, setContado] = useState({});
  const [nuevo, setNuevo] = useState({ productoId: null, presId: null, cantidad: "" });
  useEffect(() => {
    if (!data) return;
    setRenglones((data.items || []).map((i) => ({ productoId: i.producto_id, presId: i.presentacion_id, cantidad: i.cantidad })));
    setObs(data.observaciones || "");
    setContado({});
  }, [data]);

  const invalidar = () => { qc.invalidateQueries({ queryKey: QK.transferencia(id) }); qc.invalidateQueries({ queryKey: QK.transferencias }); qc.invalidateQueries({ queryKey: QK.stock }); qc.invalidateQueries({ queryKey: QK.incidencias }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const useAccion = (fn, ok) => useMutation({ mutationFn: fn, onSuccess: (r) => { showToast(typeof ok === "function" ? ok(r) : ok, "success"); invalidar(); }, onError: err });
  const guardar = useAccion(() => inventarioApi.transferencias.guardarBorrador(id, { items: renglones.filter((r) => r.productoId), observaciones: obs }), (r) => `Borrador guardado (${r.renglones} renglones).`);
  const enviar = useAccion(async () => { await inventarioApi.transferencias.guardarBorrador(id, { items: renglones.filter((r) => r.productoId), observaciones: obs }); return inventarioApi.transferencias.enviar(id); }, (r) => `Pedido ${r.codigo} enviado.`);
  const descartar = useMutation({ mutationFn: () => inventarioApi.transferencias.descartar(id), onSuccess: () => { showToast("Borrador descartado.", "info"); qc.invalidateQueries({ queryKey: QK.transferencias }); navigate("/inventario/transferencias"); }, onError: err });
  const avanzar = useAccion(() => inventarioApi.transferencias.avanzar(id, data?.estado), (r) => (r.estado === "preparada" ? "Tomada: en preparación." : "Despachada: en tránsito."));
  const editarItem = useAccion(({ itemId, body }) => inventarioApi.transferencias.editarItem(id, itemId, body), "Renglón actualizado.");
  const agregarItem = useAccion((b) => inventarioApi.transferencias.agregarItem(id, b), "Renglón agregado.");
  const quitarItem = useAccion((itemId) => inventarioApi.transferencias.quitarItem(id, itemId), "Renglón quitado.");
  const confirmarLista = useAccion(({ tipo, listo }) => inventarioApi.transferencias.confirmarLista(id, tipo, listo), ({ listo, tipo }) => (listo ? `Lista ${tipo} confirmada: stock reservado.` : `Lista ${tipo} desconfirmada: stock liberado.`));
  const recibir = useAccion(() => inventarioApi.transferencias.recibir(id, { items: Object.entries(contado).map(([itemId, c]) => ({ itemId: Number(itemId), cantidadRecibida: Number(c) })), observaciones: obs !== data?.observaciones ? obs : undefined }), (r) => (r.incidencias?.length ? `Recibida. Faltantes en incidencia: ${r.incidencias.join(", ")}.` : "Recibida completa."));
  const cancelar = useAccion(() => inventarioApi.transferencias.cancelar(id), "Cancelada. Lo reservado volvió a disponible.");

  const esOrigen = esJefe || data?.origen_id === user?.sucursalId;
  const esDestino = esJefe || data?.destino_id === user?.sucursalId;
  const puedePedir = check("pedidos").allowed;
  const puedePreparar = check("preparar").allowed;
  const listaDe = (p) => (p?.tipo === "granel" ? "granel" : "enteros");
  const nombreUsuario = (uid) => (usuarios.data || []).find((u) => u.id === uid)?.nombre || (uid === user?.id ? user.nombre : "—");

  const items = useMemo(() => (data?.items || []).map((i) => ({ ...i, producto: productoDe(i.producto_id) })), [data, productoDe]);

  if (t.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!data) return <Box className="page"><Typography>Transferencia inexistente.</Typography></Box>;

  const estado = data.estado;
  const stepIndex = PASOS_TRANSFER.indexOf(estado);
  const origen = sucursalDe(data.origen_id)?.nombre || "—";
  const destino = sucursalDe(data.destino_id)?.nombre || "—";
  const unidadDe = (i) => (i.presentacion_id ? "paq." : i.producto?.tipo === "granel" ? "kg" : "u");

  const setRenglon = (idx, patch) => setRenglones(renglones.map((r, j) => (j === idx ? { ...r, ...patch } : r)));
  const prodNuevo = productoDe(nuevo.productoId);

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${origen} → ${destino}`}
        title={data.codigo || `Pedido en borrador #${data.id}`}
        subtitle={`${stamp(data.fecha)} · pedido por ${data.usuario_id ? nombreUsuario(data.usuario_id) : "—"}`}
        badges={<StatusBadge tone={ESTADOS_TRANSFER[estado]?.tone} label={ESTADOS_TRANSFER[estado]?.label} />}
        below={estado !== "cancelada" && estado !== "borrador" && (
          <Box className="inv-pipeline">
            {PASOS_TRANSFER.map((step, i) => <span key={step} className={`inv-pipeline__step ${i < stepIndex ? "inv-pipeline__step--done" : i === stepIndex ? "inv-pipeline__step--current" : ""}`}>{ESTADOS_TRANSFER[step].label}</span>)}
          </Box>
        )}
        onBack={() => navigate("/inventario/transferencias")}
        backLabel="Volver a transferencias"
        actions={(
          <>
            {estado === "borrador" && esDestino && puedePedir && <><Button size="small" variant="ghost" onClick={() => descartar.mutate()}>Descartar</Button><Button size="small" variant="secondary" loading={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Button><Button size="small" variant="primary" loading={enviar.isPending} onClick={() => enviar.mutate()}>Enviar pedido</Button></>}
            {estado === "pendiente" && esOrigen && puedePreparar && <><Button size="small" variant="ghost" onClick={() => cancelar.mutate()}>Cancelar</Button><Button size="small" variant="primary" loading={avanzar.isPending} onClick={() => avanzar.mutate()}>Tomar para preparar</Button></>}
            {estado === "preparada" && esOrigen && puedePreparar && <><Button size="small" variant="ghost" onClick={() => cancelar.mutate()}>Cancelar</Button><Button size="small" variant="primary" loading={avanzar.isPending} onClick={() => avanzar.mutate()}>Despachar</Button></>}
            {estado === "transito" && esDestino && puedePedir && <Button size="small" variant="primary" loading={recibir.isPending} onClick={() => recibir.mutate()}>Confirmar recepción</Button>}
          </>
        )}
      />

      {/* ---------------- borrador ---------------- */}
      {estado === "borrador" && (
        <Card className="entity-card">
          <Typography className="card-title" sx={{ mb: 1 }}>Renglones del pedido</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>El pedido no toca stock: lo pide el destino y el origen quizá todavía no tiene la mercadería. Se guarda y se sigue después; el borrador pasa de mano en mano entre turnos.</Typography>
          <Table size="small" className="inv-transfer-lines-table">
            <TableHead><TableRow><TableCell>Producto</TableCell><TableCell>Forma</TableCell><TableCell align="right">Cantidad</TableCell><TableCell align="right">Disp. en {origen}</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {renglones.map((r, idx) => {
                const p = productoDe(r.productoId);
                return (
                  <TableRow key={idx}>
                    <TableCell sx={{ minWidth: 260 }}>
                      <Autocomplete size="small" options={(productos.data || []).filter((x) => x.estado !== "archivado")} value={p || null} getOptionLabel={(o) => `${o.nombre} · ${o.codigoPropio}`} onChange={(_, v) => setRenglon(idx, { productoId: v?.id ?? null, presId: null })}
                        renderInput={(params) => <TextField {...params} placeholder="Producto" />} disabled={!esDestino || !puedePedir} />
                    </TableCell>
                    <TableCell>
                      {p && (p.presentaciones || []).length > 0 ? (
                        <TextField select size="small" value={r.presId ?? ""} onChange={(e) => setRenglon(idx, { presId: e.target.value || null })} sx={{ minWidth: 150 }}>
                          <MenuItem value="">{p.tipo === "granel" ? "Granel suelto" : "Unidad"}</MenuItem>
                          {p.presentaciones.map((pr) => <MenuItem key={pr.id} value={pr.id}>Paquete {fmtTam(pr.tamKg)}</MenuItem>)}
                        </TextField>
                      ) : <span className="text-tertiary">{formaDe(p, null)}</span>}
                    </TableCell>
                    <TableCell align="right"><TextField size="small" type="number" value={r.cantidad} onChange={(e) => setRenglon(idx, { cantidad: e.target.value })} sx={{ width: 100 }} disabled={!esDestino || !puedePedir} /></TableCell>
                    <TableCell align="right" className="text-tertiary">{p ? num(cantidad(p.id, data.origen_id, r.presId ? Number(r.presId) : null)) : "—"}</TableCell>
                    <TableCell><IconButton size="small" onClick={() => setRenglones(renglones.filter((_, j) => j !== idx))}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Box sx={{ display: "flex", gap: 2, mt: 2, alignItems: "center" }}>
            <Button size="small" variant="secondary" onClick={() => setRenglones([...renglones, { productoId: null, presId: null, cantidad: "" }])}>Agregar renglón</Button>
            <TextField size="small" label="Observaciones" value={obs} onChange={(e) => setObs(e.target.value)} sx={{ flex: 1 }} />
          </Box>
        </Card>
      )}

      {/* ---------------- pendiente / preparada / transito / recibida ---------------- */}
      {estado !== "borrador" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          {estado === "preparada" && esOrigen && (
            <Card className="entity-card" sx={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Cada encargado edita lo preparado de su lista y la CONFIRMA cuando la mercadería está apartada: confirmar es reservar. El despacho exige las listas presentes confirmadas.</Typography>
              {["enteros", "granel"].map((tipo) => {
                const hay = items.some((i) => listaDe(i.producto) === tipo);
                if (!hay) return null;
                const listo = tipo === "enteros" ? data.enteros_listo : data.granel_listo;
                return <FormControlLabel key={tipo} control={<Checkbox checked={Boolean(listo)} disabled={!puedePreparar} onChange={(e) => confirmarLista.mutate({ tipo, listo: e.target.checked })} />} label={`Lista ${tipo === "enteros" ? "Enteros" : "Fraccionados"} ${listo ? "confirmada" : "sin confirmar"}`} />;
              })}
            </Card>
          )}

          <Card className="entity-card">
            <Table size="small" className="inv-transfer-lines-table">
              <TableHead><TableRow>
                <TableCell>Producto</TableCell><TableCell>Lista</TableCell><TableCell align="right">Pedido</TableCell>
                <TableCell align="right">Preparado</TableCell>
                {(estado === "transito" || estado === "recibida") && <TableCell align="right">Recibido</TableCell>}
                {estado === "preparada" && esOrigen && <TableCell>Motivo</TableCell>}
                <TableCell />
              </TableRow></TableHead>
              <TableBody>
                {items.map((i) => {
                  const lista = listaDe(i.producto);
                  const bloqueada = lista === "enteros" ? data.enteros_listo : data.granel_listo;
                  const editable = estado === "preparada" && esOrigen && puedePreparar && !bloqueada;
                  return (
                    <TableRow key={i.id}>
                      <TableCell><strong>{i.producto?.nombre || `#${i.producto_id}`}</strong><Typography variant="caption" color="text.secondary" display="block">{formaDe(i.producto, i.presentacion_id)}{i.agregado ? " · agregado en preparación" : ""}</Typography></TableCell>
                      <TableCell><StatusBadge tone={lista === "granel" ? "info" : "neutral"} label={lista === "granel" ? "Fraccionados" : "Enteros"} showDot={false} /></TableCell>
                      <TableCell align="right">{num(i.cantidad)} {unidadDe(i)}</TableCell>
                      <TableCell align="right">
                        {editable
                          ? <TextField size="small" type="number" defaultValue={i.cantidad_preparada} onBlur={(e) => { if (Number(e.target.value) !== Number(i.cantidad_preparada)) editarItem.mutate({ itemId: i.id, body: { cantidadPreparada: Number(e.target.value) } }); }} sx={{ width: 100 }} />
                          : <span className={Number(i.cantidad_preparada) < Number(i.cantidad) ? "inv-adj-net--neg" : ""}>{num(i.cantidad_preparada)} {unidadDe(i)}</span>}
                      </TableCell>
                      {estado === "transito" && (
                        <TableCell align="right">
                          {esDestino && puedePedir
                            ? <TextField size="small" type="number" value={contado[i.id] ?? i.cantidad_preparada} onChange={(e) => setContado({ ...contado, [i.id]: e.target.value })} sx={{ width: 100 }} helperText={Number(contado[i.id] ?? i.cantidad_preparada) < Number(i.cantidad_preparada) ? "faltante → incidencia" : undefined} />
                            : num(i.cantidad_preparada)}
                        </TableCell>
                      )}
                      {estado === "recibida" && <TableCell align="right" className={Number(i.cantidad_recibida) < Number(i.cantidad_preparada) ? "inv-adj-net--neg" : "inv-adj-net--pos"}>{num(i.cantidad_recibida)} {unidadDe(i)}</TableCell>}
                      {estado === "preparada" && esOrigen && <TableCell>{editable ? <TextField size="small" defaultValue={i.motivo || ""} placeholder="No había…" onBlur={(e) => { if (e.target.value !== (i.motivo || "")) editarItem.mutate({ itemId: i.id, body: { motivo: e.target.value } }); }} sx={{ width: 160 }} /> : <span className="text-tertiary">{i.motivo || "—"}</span>}</TableCell>}
                      <TableCell>{editable && i.agregado && <IconButton size="small" onClick={() => quitarItem.mutate(i.id)}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {estado === "preparada" && esOrigen && puedePreparar && (
              <Box sx={{ display: "flex", gap: 2, mt: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Autocomplete size="small" sx={{ minWidth: 280 }} options={(productos.data || []).filter((x) => x.estado !== "archivado")} value={prodNuevo || null} getOptionLabel={(o) => `${o.nombre} · ${o.codigoPropio}`} onChange={(_, v) => setNuevo({ productoId: v?.id ?? null, presId: null, cantidad: "" })}
                  renderInput={(params) => <TextField {...params} label="Agregar renglón (llegó mercadería)" />} />
                {prodNuevo && (prodNuevo.presentaciones || []).length > 0 && (
                  <TextField select size="small" value={nuevo.presId ?? ""} onChange={(e) => setNuevo({ ...nuevo, presId: e.target.value || null })} sx={{ minWidth: 150 }}>
                    <MenuItem value="">{prodNuevo.tipo === "granel" ? "Granel suelto" : "Unidad"}</MenuItem>
                    {prodNuevo.presentaciones.map((pr) => <MenuItem key={pr.id} value={pr.id}>Paquete {fmtTam(pr.tamKg)}</MenuItem>)}
                  </TextField>
                )}
                <TextField size="small" type="number" label="Cantidad" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} sx={{ width: 120 }} />
                <Button size="small" variant="secondary" disabled={!nuevo.productoId || !(Number(nuevo.cantidad) > 0)} onClick={() => agregarItem.mutate({ productoId: nuevo.productoId, presId: nuevo.presId || undefined, cantidad: Number(nuevo.cantidad) })}>Agregar</Button>
              </Box>
            )}
            {estado === "transito" && esDestino && <TextField size="small" fullWidth label="Observaciones de la recepción" value={obs} onChange={(e) => setObs(e.target.value)} sx={{ mt: 2 }} />}
            {data.observaciones && estado !== "transito" && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Observaciones: {data.observaciones}</Typography>}
          </Card>

          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Historial</Typography>
            {(data.hist || []).map((h) => (
              <Typography key={h.id} variant="body2" color="text.secondary">{stamp(h.fecha)} · <strong>{ESTADOS_TRANSFER[h.estado]?.label || h.estado}</strong>{h.usuario_id ? ` · ${nombreUsuario(h.usuario_id)}` : ""}</Typography>
            ))}
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default TransferenciaDetalle;
