/**
 * PUNTO DE VENTA. Dos columnas: el ticket (buscador + renglones) y el panel
 * de cierre (cliente, totales, promos, cobrar). Los tickets abiertos de la
 * sucursal viven como pestañas para retomarlos. Atajos: F2 cobra, F4 vuelve
 * al buscador, Ins abre un ticket nuevo, Esc vuelve a la lista.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { usePos } from "./hooks/usePos";
import { buscarEnCatalogo, calcularRenglon, parseEtiquetaBalanza } from "./domain/pos";
import { ventasApi, ORIGEN_LISTA, money, num, stamp } from "./api/ventasApi";
import { httpClient } from "../../app/api/httpClient";
import CobroModal from "./components/CobroModal";
import { imprimirVenta } from "./components/imprimirVenta";
import "./Pos.css";

const IVAS_EXTRA = [21, 10.5, 0];

/* ------------------------------ Buscador ------------------------------ */

const Buscador = ({ catalogo, config, onElegir, inputRef }) => {
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const resultados = useMemo(() => (q.trim() ? buscarEnCatalogo(catalogo, q, 8) : []), [catalogo, q]);

  const elegir = (item, cantidad) => { onElegir(item, cantidad); setQ(""); setActivo(0); };
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const t = q.trim();
      const bal = parseEtiquetaBalanza(t, config);
      if (bal) {
        const item = catalogo.find((i) => i.codigoBarras && String(i.codigoBarras).endsWith(bal.codigoItem));
        if (!item) return;
        elegir(item, bal.cantidad ?? (bal.importe && item.precioFinal > 0 ? Number((bal.importe / item.precioFinal).toFixed(3)) : 1));
        return;
      }
      // "3*codigo" carga 3 unidades de una.
      const m = /^(\d+(?:[.,]\d+)?)\s*[*x×]\s*(.+)$/i.exec(t);
      if (m) {
        const hit = buscarEnCatalogo(catalogo, m[2], 1)[0];
        if (hit) elegir(hit, Number(m[1].replace(",", ".")));
        return;
      }
      if (resultados.length) elegir(resultados[activo] ?? resultados[0], 1);
    } else if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape" && q) { e.stopPropagation(); setQ(""); setActivo(0); }
  };

  return (
    <Box className="pos-buscador">
      <TextField inputRef={inputRef} fullWidth size="small" autoFocus placeholder="Escaneá o escribí: código, nombre o marca · «3*harina» carga 3" value={q}
        onChange={(e) => { setQ(e.target.value); setActivo(0); }} onKeyDown={onKeyDown} autoComplete="off" />
      {resultados.length > 0 && (
        <Box className="pos-resultados">
          {resultados.map((r, i) => (
            <button type="button" key={r.key} className={`pos-resultado ${i === activo ? "pos-resultado--activo" : ""}`} onMouseEnter={() => setActivo(i)} onClick={() => elegir(r, 1)}>
              <span className="pos-resultado__nombre">{r.nombre} <small>{r.detalle}</small>{r.marca ? <small> · {r.marca}</small> : null}</span>
              <span className="pos-resultado__precio">{r.sinFormato ? <em>sin precio</em> : money(r.precioFinal)}</span>
              <span className={`pos-resultado__stock ${r.stock <= 0 ? "pos-resultado__stock--sin" : ""}`}>{num(r.stock, 3)} {r.unidad}</span>
            </button>
          ))}
        </Box>
      )}
    </Box>
  );
};

/* ------------------------------ Pantalla ------------------------------ */

const Pos = () => {
  const pos = usePos();
  const { user, esJefe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const buscadorRef = useRef(null);
  const [cobro, setCobro] = useState(false);
  const [emitida, setEmitida] = useState(null); // { venta, vuelto }
  const [extra, setExtra] = useState(null);     // { concepto, importe, iva }
  const [delegarA, setDelegarA] = useState(null);
  const empresaQ = useQuery({ queryKey: ["configuracion", "empresa"], queryFn: () => httpClient.get("/configuracion/empresa"), staleTime: 10 * 60_000 });

  const { ticket, dispatch, totales, activaId, clienteActual, catalogo, config } = pos;
  const enfocar = useCallback(() => setTimeout(() => buscadorRef.current?.focus(), 60), []);

  // Llegar con ?presupuesto=ID (desde Presupuestos) abre un ticket que lo cierra.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("presupuesto");
    if (!id || pos.cargando || activaId) return;
    (async () => {
      const pr = await ventasApi.presupuestos.get(Number(id)).catch(() => null);
      if (!pr) return;
      const b = await pos.nuevaVenta({ clienteId: pr.clienteId, presupuestoId: pr.id });
      if (!b) return;
      for (const it of pr.items) {
        const item = catalogo.find((c) => c.productoId === it.productoId && (c.presentacionId ?? null) === (it.presentacionId ?? null));
        if (item) pos.agregar(item, Number(it.cantidadArmada ?? it.cantidad));
      }
      navigate("/ventas/pos", { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, pos.cargando, catalogo.length]);

  // Atajos de teclado del puesto.
  useEffect(() => {
    const h = (e) => {
      if (cobro || emitida || extra) return;
      if (e.key === "F2") { e.preventDefault(); cobrar(); }
      else if (e.key === "F4") { e.preventDefault(); enfocar(); }
      else if (e.key === "Insert") { e.preventDefault(); pos.nuevaVenta().then(enfocar); }
      else if (e.key === "Escape" && activaId && !e.target.value) { pos.irALista(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const cobrar = async () => {
    if (!pos.puedeCobrar) {
      showToast(pos.problemas[0] || (!activaId ? "Abrí una venta primero." : "No hay un turno de caja abierto: abrila en Ventas › Caja."), "error");
      return;
    }
    await pos.flushGuardado();
    setCobro(true);
  };

  const onCobrado = (venta, vuelto) => {
    setCobro(false);
    setEmitida({ venta, vuelto });
    try { localStorage.setItem("checat.ultimoTicket", String(venta.id)); } catch { /* sin storage */ }
  };

  const cerrarEmitida = async () => { setEmitida(null); await pos.trasCobrar(); enfocar(); };

  const reimprimir = async () => {
    let id = null;
    try { id = Number(localStorage.getItem("checat.ultimoTicket")); } catch { /* sin storage */ }
    if (!id) { showToast("Todavía no hay un ticket cobrado en este puesto.", "error"); return; }
    const v = await ventasApi.venta(id).catch(() => null);
    if (v) imprimirVenta(v, empresaQ.data);
  };

  if (pos.cargando) return <div className="route-loading" aria-busy="true" />;
  if (pos.errorCatalogo) return <Box className="page"><Alert severity="error">{pos.errorCatalogo.message}</Alert></Box>;

  const listaDeRenglon = (r) => (pos.preciosDe(r.key) ?? []).map((p) => ({ ...p, lista: pos.listasPorId.get(p.listaId) })).filter((p) => p.lista);

  /* ------------------------------ Lista de tickets abiertos ------------------------------ */
  if (!activaId) {
    return (
      <Box className="page fade-in">
        <PageHeader title="Punto de venta" subtitle={`${user?.sucursalNombre || ""} · ${pos.cajaAbierta ? "Caja abierta" : "Sin turno de caja"}${pos.requiereCaja && !pos.cajaAbierta ? " — hace falta abrirla para cobrar al contado" : ""}`}
          actions={(<>
            <Button variant="ghost" startIcon={<PrintOutlinedIcon />} onClick={reimprimir}>Reimprimir último</Button>
            <Button variant="ghost" startIcon={<RefreshIcon />} onClick={pos.refrescar}>Actualizar precios</Button>
            {!pos.cajaAbierta && <Button variant="secondary" onClick={() => navigate("/ventas/caja")}>Abrir caja</Button>}
            <Button variant="primary" startIcon={<AddIcon />} onClick={() => pos.nuevaVenta().then(enfocar)}>Nuevo ticket · Ins</Button>
          </>)} />
        <Box className="pos-abiertas">
          {pos.abiertas.length === 0 && <Typography color="text.secondary">No hay tickets abiertos. Abrí uno con <kbd>Ins</kbd>.</Typography>}
          {pos.abiertas.map((v) => {
            const ult = v.items?.[v.items.length - 1];
            const item = ult ? catalogo.find((c) => c.productoId === ult.productoId && (c.presentacionId ?? null) === (ult.presentacionId ?? null)) : null;
            return (
              <button type="button" key={v.id} className="pos-abierta" onClick={() => pos.abrirVenta(v.id).then(enfocar)}>
                <span className="pos-abierta__quien">{v.clienteNombre}<small>{v.cajeroNombre} · {stamp(v.updatedAt || v.fecha)}</small></span>
                <span className="pos-abierta__ultimo">{item ? `${item.nombre} · ${num(ult.cantidad, 3)} ${item.unidad}` : "vacío"}<small>{v.items?.length || 0} renglón(es)</small></span>
                <span className="pos-abierta__total">{money(v.total)}</span>
              </button>
            );
          })}
        </Box>
      </Box>
    );
  }

  /* ------------------------------ El ticket ------------------------------ */
  return (
    <Box className="page fade-in pos">
      <Box className="pos-top">
        <Tooltip title="Volver a los tickets abiertos (Esc)"><IconButton size="small" onClick={pos.irALista}><ArrowBackIcon fontSize="small" /></IconButton></Tooltip>
        <Box className="pos-pestanas">
          {pos.abiertas.map((v) => (
            <button type="button" key={v.id} className={`pos-pestana ${v.id === activaId ? "pos-pestana--activa" : ""}`} onClick={() => pos.abrirVenta(v.id).then(enfocar)}>
              #{v.id} · {v.clienteNombre?.split(" ")[0]} · {money(v.total)}
            </button>
          ))}
          <button type="button" className="pos-pestana pos-pestana--nueva" onClick={() => pos.nuevaVenta().then(enfocar)}>+ nuevo</button>
        </Box>
        <span className="pos-guardado">{pos.guardando ? "guardando…" : `ticket #${activaId}`}</span>
        <StatusBadge tone={pos.cajaAbierta ? "success" : "warning"} label={pos.cajaAbierta ? "Caja abierta" : "Sin turno de caja"} />
      </Box>

      <Box className="pos-cuerpo">
        <Box className="pos-izq">
          <Buscador catalogo={catalogo} config={config} inputRef={buscadorRef} onElegir={(item, c) => pos.agregar(item, c)} />

          <Box className="pos-tabla-wrap">
            <table className="pos-tabla">
              <thead><tr><th>Artículo</th><th className="r">Cant.</th><th>Lista</th><th className="r">Precio</th><th className="r">Desc. %</th><th className="r">Subtotal</th><th /></tr></thead>
              <tbody>
                {ticket.renglones.map((r) => {
                  const c = calcularRenglon(r);
                  const listas = listaDeRenglon(r);
                  const org = ORIGEN_LISTA[r.listaOrigen] || ORIGEN_LISTA.base;
                  return (
                    <tr key={r.uid} className={r.key === pos.ultimoKey ? "pos-fila--ultima" : ""}>
                      <td>
                        <div className="pos-art">{r.nombre} <small>{r.detalle}</small></div>
                        {(r.oferta || r.descuentoNombre || r.listaMotivo) && (
                          <div className="pos-art__tags">
                            {r.oferta && <Chip size="small" color="secondary" icon={<LocalOfferOutlinedIcon />} label={`${r.oferta}${r.ofertaDetalle ? ` · ${r.ofertaDetalle}` : ""} · −${money(r.ofertaDescuento)}`} />}
                            {r.descuentoNombre && <Chip size="small" label={`${r.descuentoNombre} ${r.descuento}%`} />}
                          </div>
                        )}
                        {!config.permitirStockNegativo && r.cantidad > r.stock + 1e-9 && <small className="pos-art__alerta">hay {num(r.stock, 3)} {r.unidad}</small>}
                      </td>
                      <td className="r"><input className="pos-in pos-in--cant" type="number" step={r.fraccionable ? "0.001" : "1"} min="0" value={r.cantidad} onChange={(e) => dispatch({ tipo: "cantidad", uid: r.uid, valor: e.target.value })} onFocus={(e) => e.target.select()} /></td>
                      <td>
                        <Tooltip title={org.ayuda}>
                          <select className="pos-in pos-in--lista" value={r.listaId ?? ""} onChange={(e) => {
                            const v = e.target.value;
                            if (v === "auto") { dispatch({ tipo: "lista", uid: r.uid, manual: false }); return; }
                            const p = listas.find((x) => String(x.listaId) === v);
                            if (p) dispatch({ tipo: "lista", uid: r.uid, lista: p.lista, precio: p.precio });
                          }} disabled={!pos.puedePisarPrecio && Boolean(config.overrideListaRequiereAdmin)}>
                            {listas.map((p) => <option key={p.listaId} value={p.listaId}>{p.lista.etiqueta} · {money(p.precioFinal)}</option>)}
                            {r.listaManual && <option value="auto">↺ automático</option>}
                          </select>
                        </Tooltip>
                        <StatusBadge tone={org.tone} label={org.corto} showDot={false} />
                      </td>
                      <td className="r">{pos.puedePisarPrecio ? <input className="pos-in pos-in--precio" type="number" step="0.01" value={r.precioUnitario} onChange={(e) => dispatch({ tipo: "precio", uid: r.uid, valor: e.target.value })} onFocus={(e) => e.target.select()} /> : <span className="pos-num">{money(r.precioUnitario)}</span>}<small className="pos-final">final {money(r.precioUnitario * (1 + r.iva / 100))}</small></td>
                      <td className="r"><input className="pos-in pos-in--desc" type="number" step="0.5" min="0" max="100" value={r.descuentoBase ?? r.descuento} onChange={(e) => dispatch({ tipo: "descuento", uid: r.uid, valor: e.target.value })} onFocus={(e) => e.target.select()} /></td>
                      <td className="r pos-num"><strong>{money(c.total)}</strong></td>
                      <td><IconButton size="small" onClick={() => dispatch({ tipo: "quitar", uid: r.uid })} aria-label="Quitar"><DeleteOutlineIcon fontSize="small" /></IconButton></td>
                    </tr>
                  );
                })}
                {ticket.extras.map((e) => (
                  <tr key={`e${e.uid}`} className="pos-fila--extra">
                    <td colSpan={5}>{e.concepto} <small>IVA {e.iva}%</small></td>
                    <td className="r pos-num">{money(e.importe * (1 + e.iva / 100))}</td>
                    <td><IconButton size="small" onClick={() => dispatch({ tipo: "extraQuitar", uid: e.uid })} aria-label="Quitar"><DeleteOutlineIcon fontSize="small" /></IconButton></td>
                  </tr>
                ))}
                {!ticket.renglones.length && <tr><td colSpan={7} className="pos-vacio">Escaneá o buscá un artículo para empezar.</td></tr>}
              </tbody>
            </table>
          </Box>
          <Box className="pos-pie-izq">
            <Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setExtra({ concepto: "Envío", importe: "", iva: 21 })}>Cargo extra</Button>
            {pos.modalidades.length > 1 && (
              <TextField select size="small" label="Lista para todo el ticket" defaultValue="" sx={{ minWidth: 220 }} onChange={(e) => pos.aplicarModalidadATodo(e.target.value)} disabled={!pos.puedePisarPrecio && Boolean(config.overrideListaRequiereAdmin)}>
                <MenuItem value="auto">Automático</MenuItem>
                {pos.modalidades.map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.nombre}</MenuItem>)}
              </TextField>
            )}
            <span className="pos-hint"><kbd>F2</kbd> cobrar · <kbd>F4</kbd> buscar · <kbd>Ins</kbd> nuevo · <kbd>Esc</kbd> lista</span>
          </Box>
        </Box>

        <Box className="pos-der">
          <Box className="pos-cliente">
            <PersonOutlineIcon fontSize="small" />
            <Autocomplete size="small" fullWidth options={pos.clientes.filter((c) => c.activo)} value={clienteActual} getOptionLabel={(c) => c?.nombre || ""} isOptionEqualToValue={(a, b) => a?.id === b?.id}
              onChange={(_, c) => { if (c) pos.cambiarCliente(c.id); enfocar(); }} renderInput={(params) => <TextField {...params} placeholder="Cliente" />} disableClearable />
          </Box>
          {clienteActual && !clienteActual.esConsumidorFinal && (
            <Typography variant="caption" color="text.secondary" className="pos-cliente__meta">
              {clienteActual.descuento > 0 ? `${clienteActual.descuento}% de descuento · ` : ""}{clienteActual.ctaCteHabilitada ? "cuenta corriente" : "sin cuenta corriente"}{clienteActual.listas?.length ? ` · ${clienteActual.listas.length} lista(s) asignada(s)` : ""}
            </Typography>
          )}

          {pos.sugerenciaMonto && (
            <Alert severity="info" className="pos-sug" action={<Button size="small" onClick={() => dispatch({ tipo: "monto", modalidadId: pos.sugerenciaMonto.modalidadId })}>Aplicar</Button>}>
              Supera {money(pos.sugerenciaMonto.monto)}: habilita <strong>{pos.sugerenciaMonto.modalidad}</strong> en {pos.sugerenciaMonto.renglones} renglón(es){pos.sugerenciaMonto.mediosPago?.length ? ` pagando con ${pos.sugerenciaMonto.mediosPago.join(" / ")}` : ""}.
            </Alert>
          )}
          {ticket.montoAplicado && <Chip size="small" onDelete={() => dispatch({ tipo: "monto", modalidadId: null })} label="Precio por monto aplicado" color="warning" />}
          {pos.sugerenciasOferta.map((o) => (
            <Alert key={o.id} severity="success" className="pos-sug" action={<Button size="small" onClick={() => dispatch({ tipo: "ofertaTicket", ofertaId: o.id })}>Aplicar</Button>}>
              <strong>{o.nombre}</strong>: {o.porcentaje}% al ticket{o.mediosPago.length ? ` pagando con ${o.mediosPago.join(" / ")}` : ""}.
            </Alert>
          ))}
          {ticket.ofertaTicket && <Chip size="small" color="success" onDelete={() => dispatch({ tipo: "ofertaTicket", ofertaId: null })} label="Oferta de ticket aplicada" />}

          {pos.descuentosDelTicket.length > 0 && (
            <Box className="pos-descuentos">
              <Typography variant="caption" color="text.secondary">Descuentos autorizados</Typography>
              <Box className="pos-descuentos__chips">
                {pos.descuentosDelTicket.map((d) => (
                  <Tooltip key={d.id} title={d.motivo || `${d.porcentaje}% sobre ${d.lista}`}>
                    <span><Chip size="small" label={`${d.nombre} ${d.porcentaje}%`} color={d.puesto ? "primary" : "default"} variant={d.puesto ? "filled" : "outlined"} disabled={!d.aplicable} onClick={() => pos.alternarDescuento(d)} /></span>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          )}

          <Box className="pos-totales">
            <div><span>Bruto</span><span>{money(totales.bruto)}</span></div>
            {totales.descuento > 0 && <div className="pos-totales__desc"><span>Descuentos{totales.ahorro > 0 ? ` (promos ${money(totales.ahorro)})` : ""}</span><span>−{money(totales.descuento)}</span></div>}
            {totales.extras > 0 && <div><span>Extras</span><span>{money(totales.extras)}</span></div>}
            <div><span>Neto</span><span>{money(totales.neto)}</span></div>
            <div><span>IVA</span><span>{money(totales.iva)}</span></div>
            <div className="pos-totales__total"><span>TOTAL</span><span>{money(totales.total)}</span></div>
            <small>{totales.renglones} renglón(es) · {num(totales.unidades, 3)} unidades</small>
          </Box>

          {pos.problemas.length > 0 && <Alert severity="warning" className="pos-problemas">{pos.problemas.map((p, i) => <div key={i}>{p}</div>)}</Alert>}

          <Button variant="primary" size="large" fullWidth startIcon={<PointOfSaleIcon />} onClick={cobrar} disabled={!pos.puedeCobrar} className="pos-cobrar">Cobrar · F2</Button>
          <Box className="pos-acciones">
            <Tooltip title="Guarda el ticket como presupuesto (pide cliente)"><span><Button size="small" variant="ghost" startIcon={<RequestQuoteOutlinedIcon />} onClick={() => pos.guardarComoPresupuesto()} disabled={!ticket.renglones.length}>Presupuesto</Button></span></Tooltip>
            <Button size="small" variant="ghost" onClick={() => setDelegarA("")}>Pasar a…</Button>
            <Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Descartar este ticket?")) pos.descartar(activaId); }}>Descartar</Button>
          </Box>
        </Box>
      </Box>

      {cobro && <CobroModal open onClose={() => { setCobro(false); enfocar(); }} ventaId={activaId} totales={totales} cliente={clienteActual} config={config} usuarios={pos.usuarios} cajaSesionId={pos.caja?.id} onCobrado={onCobrado} />}

      <Modal open={Boolean(emitida)} onClose={cerrarEmitida} title={emitida ? `${emitida.venta.etiqueta} emitido` : ""} subtitle={emitida?.venta?.facturarPendiente ? `Salió como ticket provisorio: ${emitida.venta.facturarMotivo}` : undefined}
        actions={(<><Button variant="ghost" startIcon={<PrintOutlinedIcon />} onClick={() => imprimirVenta(emitida.venta, empresaQ.data)}>Imprimir</Button><Button variant="primary" onClick={cerrarEmitida} autoFocus>Nuevo ticket</Button></>)}>
        {emitida && (
          <Box className="pos-emitida">
            <div><span>Total</span><strong>{money(emitida.venta.total)}</strong></div>
            {emitida.vuelto > 0 && <div className="pos-emitida__vuelto"><span>Vuelto</span><strong>{money(emitida.vuelto)}</strong></div>}
            {emitida.venta.cae && <small>CAE {emitida.venta.cae}</small>}
            {emitida.venta.condicionPago === "cuenta_corriente" && <small>Quedó en la cuenta corriente de {emitida.venta.clienteNombre}.</small>}
          </Box>
        )}
      </Modal>

      <Modal open={Boolean(extra)} onClose={() => setExtra(null)} title="Cargo extra" subtitle="Envío, packaging, un ajuste: importe NETO con su propia alícuota." maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setExtra(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (Number(extra.importe) > 0) dispatch({ tipo: "extraAgregar", ...extra, importe: Number(extra.importe) }); setExtra(null); enfocar(); }}>Agregar</Button></>)}>
        {extra && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField size="small" label="Concepto" value={extra.concepto} onChange={(e) => setExtra({ ...extra, concepto: e.target.value })} autoFocus />
            <TextField size="small" type="number" label="Importe neto" value={extra.importe} onChange={(e) => setExtra({ ...extra, importe: e.target.value })} />
            <TextField select size="small" label="IVA" value={extra.iva} onChange={(e) => setExtra({ ...extra, iva: Number(e.target.value) })}>{IVAS_EXTRA.map((i) => <MenuItem key={i} value={i}>{i}%</MenuItem>)}</TextField>
          </Box>
        )}
      </Modal>

      <Modal open={delegarA !== null} onClose={() => setDelegarA(null)} title="Pasar el ticket a otro vendedor" maxWidth="xs"
        actions={(<><Button variant="ghost" onClick={() => setDelegarA(null)}>Cancelar</Button><Button variant="primary" disabled={!delegarA} onClick={async () => { try { await ventasApi.delegar(activaId, Number(delegarA)); showToast("Ticket delegado.", "success"); setDelegarA(null); pos.refrescar(); } catch (e) { showToast(e?.message || "No se pudo.", "error"); } }}>Pasar</Button></>)}>
        <TextField select fullWidth size="small" label="Vendedor" value={delegarA ?? ""} onChange={(e) => setDelegarA(e.target.value)} sx={{ mt: 1 }}>
          {pos.usuarios.filter((u) => u.activo && u.id !== user?.id).map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}{esJefe ? ` · ${u.rolNombre}` : ""}</MenuItem>)}
        </TextField>
      </Modal>
    </Box>
  );
};

export default Pos;
