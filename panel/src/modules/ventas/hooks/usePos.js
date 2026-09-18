/**
 * EL PUESTO DE VENTA, sin pantalla. Junta lo que el POS necesita (catálogo
 * cacheado, caja abierta, borradores abiertos, cliente) con el reducer puro
 * del ticket, y expone acciones: abrir/retomar/guardar/cobrar/descartar.
 *
 * El catálogo se pide UNA vez por sucursal y trae el precio en TODAS las
 * listas: cambiar de cliente o cruzar un umbral se resuelve en memoria.
 * El borrador se AUTOGUARDA con retardo en cada cambio; confirmar cobra lo
 * último guardado.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/Toast/ToastContext";
import { QK } from "../../../app/api/queryClient";
import { ventasApi } from "../api/ventasApi";
import { indicePrecios, sugerenciaPorMonto } from "../domain/listas";
import { sugerenciasOfertaTicket } from "../domain/ofertas";
import {
  descuentosDisponibles, descuentosParaApi, extrasParaApi, itemsParaApi, motivoBloqueo,
  problemasDelTicket, ticketDesdeBorrador, ticketInicial, ticketReducer, totalesTicket,
} from "../domain/pos";

const AUTOGUARDADO_MS = 700;

export const QK_POS = {
  catalogo: (suc) => ["pos", "catalogo", suc],
  caja: (suc) => ["pos", "caja", suc],
  abiertas: (suc) => ["pos", "abiertas", suc],
  descuentos: ["pos", "descuentos"],
  bootstrap: ["ventas", "bootstrap"],
};

export function usePos() {
  const { user, can } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const sucursalId = user?.sucursalId ?? null;
  const puedePisarPrecio = can("precio_manual");

  const bootstrap = useQuery({ queryKey: QK_POS.bootstrap, queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const catalogoQ = useQuery({ queryKey: QK_POS.catalogo(sucursalId), queryFn: () => ventasApi.catalogo(sucursalId), enabled: Boolean(sucursalId), staleTime: 5 * 60_000 });
  const cajaQ = useQuery({ queryKey: QK_POS.caja(sucursalId), queryFn: () => ventasApi.caja.actual(sucursalId), enabled: Boolean(sucursalId), staleTime: 15_000 });
  const abiertasQ = useQuery({ queryKey: QK_POS.abiertas(sucursalId), queryFn: () => ventasApi.abiertas({ sucursalId }), enabled: Boolean(sucursalId) });
  const descuentosQ = useQuery({ queryKey: QK_POS.descuentos, queryFn: ventasApi.descuentos.listar, staleTime: 60_000 });

  const config = bootstrap.data?.config ?? {};
  const clientes = useMemo(() => bootstrap.data?.clientes ?? [], [bootstrap.data]);
  const usuarios = useMemo(() => bootstrap.data?.usuarios ?? [], [bootstrap.data]);
  const consumidorFinal = useMemo(() => clientes.find((c) => c.esConsumidorFinal) ?? null, [clientes]);
  const catalogoRaw = catalogoQ.data ?? null;
  const catalogo = useMemo(() => catalogoRaw?.items ?? [], [catalogoRaw]);
  const idxPrecios = useMemo(() => indicePrecios(catalogo), [catalogo]);
  const preciosDe = useCallback((key) => idxPrecios.get(key), [idxPrecios]);
  const listasPorId = useMemo(() => new Map((catalogoRaw?.listas ?? []).map((l) => [l.listaId, l])), [catalogoRaw]);
  const catalogoDescuentos = useMemo(() => descuentosQ.data ?? [], [descuentosQ.data]);

  const [ticket, dispatch] = useReducer(ticketReducer, ticketInicial);
  const [activaId, setActivaId] = useState(null);
  const [clienteId, setClienteId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ultimoKey, setUltimoKey] = useState(null);
  const guardadoRef = useRef(null);
  const estadoRef = useRef({ ticket, activaId, clienteId });
  estadoRef.current.ticket = ticket;
  estadoRef.current.activaId = activaId;
  estadoRef.current.clienteId = clienteId;

  const clienteActual = useMemo(() => clientes.find((c) => c.id === clienteId) ?? consumidorFinal, [clientes, clienteId, consumidorFinal]);

  // El contexto de cotización del ticket: catálogo, cliente, precios, reloj.
  useEffect(() => {
    dispatch({ tipo: "contexto", ctx: { catalogo: catalogoRaw, cliente: clienteActual, precios: idxPrecios, sucursalId, ahora: new Date(), descuentos: catalogoDescuentos } });
  }, [catalogoRaw, clienteActual, idxPrecios, sucursalId, catalogoDescuentos]);

  const totales = useMemo(() => totalesTicket(ticket.renglones, ticket.extras), [ticket.renglones, ticket.extras]);
  const descuentoMax = Number(config.descuentoMaxVendedor) || 0;
  const problemas = useMemo(() => problemasDelTicket(ticket.renglones, { permitirStockNegativo: Boolean(config.permitirStockNegativo), descuentoMax, puedePisarPrecio }), [ticket.renglones, config.permitirStockNegativo, descuentoMax, puedePisarPrecio]);
  const caja = cajaQ.data ?? null;
  const cajaAbierta = caja?.estado === "abierta";
  const requiereCaja = Boolean(config.cajaObligatoria);
  const puedeCobrar = Boolean(activaId) && ticket.renglones.length > 0 && problemas.length === 0 && (!requiereCaja || cajaAbierta);

  const sugerenciaMonto = useMemo(() => sugerenciaPorMonto(ticket.renglones, totales.total, catalogoRaw, preciosDe, Boolean(ticket.montoAplicado)), [ticket.renglones, ticket.montoAplicado, totales.total, catalogoRaw, preciosDe]);
  const sugerenciasOferta = useMemo(() => sugerenciasOfertaTicket(catalogoRaw?.ofertas ?? [], ticket.renglones, totales.total, { ahora: new Date(), sucursalId }, ticket.ofertaTicket), [catalogoRaw, ticket.renglones, totales.total, sucursalId, ticket.ofertaTicket]);
  const descuentosDelTicket = useMemo(() => descuentosDisponibles(ticket, { esAdmin: puedePisarPrecio }), [ticket, puedePisarPrecio]);
  const modalidades = useMemo(() => {
    const vistas = new Map();
    for (const l of catalogoRaw?.listas ?? []) if (!vistas.has(l.modalidadId)) vistas.set(l.modalidadId, { id: l.modalidadId, nombre: l.modalidad });
    return [...vistas.values()];
  }, [catalogoRaw]);

  const invalidarAbiertas = useCallback(() => qc.invalidateQueries({ queryKey: QK_POS.abiertas(sucursalId) }), [qc, sucursalId]);

  /* ------------------------------ Guardado ------------------------------ */

  const guardarAhora = useCallback(async (id, estado, cliente) => {
    if (!id) return;
    setGuardando(true);
    try {
      await ventasApi.actualizar(id, { clienteId: cliente?.id, items: itemsParaApi(estado.renglones), extras: extrasParaApi(estado.extras), descuentos: descuentosParaApi(estado) });
      invalidarAbiertas();
    } catch (e) {
      showToast(e?.message || "No se pudo guardar la venta abierta.", "error");
    } finally {
      setGuardando(false);
    }
  }, [invalidarAbiertas, showToast]);

  // Autoguardado con retardo en cada cambio del ticket.
  useEffect(() => {
    if (!activaId) return undefined;
    clearTimeout(guardadoRef.current);
    guardadoRef.current = setTimeout(() => guardarAhora(activaId, ticket, clienteActual), AUTOGUARDADO_MS);
    return () => clearTimeout(guardadoRef.current);
  }, [activaId, ticket, clienteActual, guardarAhora]);

  const flushGuardado = useCallback(async () => {
    clearTimeout(guardadoRef.current);
    const { ticket: t, activaId: id } = estadoRef.current;
    if (id) await guardarAhora(id, t, clienteActual);
  }, [guardarAhora, clienteActual]);

  /* ------------------------------ Acciones ------------------------------ */

  const limpiar = useCallback(() => { setActivaId(null); dispatch({ tipo: "limpiar" }); setClienteId(null); setUltimoKey(null); }, []);

  const abrirBorradorNuevo = useCallback(async (extra = {}) => {
    try {
      const b = await ventasApi.crear({ clienteId: extra.clienteId ?? consumidorFinal?.id, sucursalId, estado: "borrador", items: [], presupuestoId: extra.presupuestoId });
      dispatch({ tipo: "limpiar" });
      setClienteId(b.clienteId);
      setActivaId(b.id);
      setUltimoKey(null);
      invalidarAbiertas();
      return b;
    } catch (e) {
      showToast(e?.message || "No se pudo abrir una venta nueva.", "error");
      return null;
    }
  }, [consumidorFinal, sucursalId, invalidarAbiertas, showToast]);

  const nuevaVenta = useCallback(async (extra) => { await flushGuardado(); return abrirBorradorNuevo(extra); }, [flushGuardado, abrirBorradorNuevo]);

  const abrirVenta = useCallback(async (id) => {
    if (estadoRef.current.activaId && estadoRef.current.activaId !== id) await flushGuardado();
    try {
      const borrador = await ventasApi.venta(id);
      dispatch({ tipo: "cargar", ...ticketDesdeBorrador(borrador, catalogo) });
      setClienteId(borrador.clienteId);
      setActivaId(id);
      setUltimoKey(null);
      return borrador;
    } catch (e) {
      showToast(e?.message || "No se pudo abrir la venta.", "error");
      return null;
    }
  }, [flushGuardado, catalogo, showToast]);

  const irALista = useCallback(async () => { await flushGuardado(); limpiar(); }, [flushGuardado, limpiar]);

  const descartar = useCallback(async (id) => {
    try {
      clearTimeout(guardadoRef.current);
      await ventasApi.descartar(id);
      if (estadoRef.current.activaId === id) limpiar();
      invalidarAbiertas();
      showToast("Ticket descartado.", "success");
    } catch (e) {
      showToast(e?.message || "No se pudo descartar.", "error");
    }
  }, [limpiar, invalidarAbiertas, showToast]);

  const agregar = useCallback((item, cantidad = 1) => {
    const bloqueo = motivoBloqueo(item);
    if (bloqueo) { showToast(bloqueo, "error"); return false; }
    let listaFija = null;
    if (item._escaneoListaId) {
      const precioLista = (preciosDe(item.key) ?? []).find((x) => x.listaId === item._escaneoListaId)?.precio;
      const lista = listasPorId.get(item._escaneoListaId);
      if (precioLista != null && lista) listaFija = { listaId: lista.listaId, etiqueta: lista.etiqueta, precio: precioLista };
    }
    if ((listaFija?.precio ?? item.precio) <= 0) {
      showToast(`${item.nombre}${item.presentacionId ? ` · ${item.detalle}` : ""} no tiene precio cargado: definí su formato de venta en Productos.`, "error");
      return false;
    }
    dispatch({ tipo: "agregar", item, cantidad: item._escaneoUnidades ? cantidad * item._escaneoUnidades : cantidad, listaFija, descuentoCliente: clienteActual?.descuento || 0 });
    setUltimoKey(item.key);
    return true;
  }, [showToast, clienteActual, preciosDe, listasPorId]);

  const cambiarCliente = useCallback((id) => {
    const anterior = clienteActual?.descuento || 0;
    const nuevo = clientes.find((c) => c.id === id);
    setClienteId(id);
    dispatch({ tipo: "descuentoCliente", anterior, valor: nuevo?.descuento || 0 });
  }, [clienteActual, clientes]);

  const alternarDescuento = useCallback((d) => {
    const puestos = ticket.descuentos ?? [];
    const sacando = puestos.includes(d.id);
    const ids = sacando ? puestos.filter((x) => x !== d.id)
      : [...puestos.filter((x) => { const otro = catalogoDescuentos.find((c) => c.id === x); return !otro || otro.listaId !== d.listaId; }), d.id];
    dispatch({ tipo: "descuentos", ids });
    showToast(sacando ? `Se quitó "${d.nombre}".` : `${d.nombre}: ${d.porcentaje}% aplicado.`, "success");
  }, [ticket.descuentos, catalogoDescuentos, showToast]);

  const aplicarModalidadATodo = useCallback((valor) => {
    if (valor === "auto") { dispatch({ tipo: "modalidadTodos", modalidadId: null, listasPorId, preciosDe }); return; }
    const modalidadId = Number(valor);
    const alcanza = ticket.renglones.filter((r) => (preciosDe(r.key) ?? []).some((x) => listasPorId.get(x.listaId)?.modalidadId === modalidadId)).length;
    if (!alcanza) { showToast("Ningún artículo del ticket tiene una lista de esa modalidad.", "error"); return; }
    dispatch({ tipo: "modalidadTodos", modalidadId, listasPorId, preciosDe });
    const afuera = ticket.renglones.length - alcanza;
    showToast(afuera ? `Aplicada a ${alcanza} artículo(s); ${afuera} sin lista de esa modalidad quedaron como estaban.` : `Aplicada a ${alcanza} artículo(s).`, "success");
  }, [ticket.renglones, listasPorId, preciosDe, showToast]);

  /** Tras cobrar: limpia, refresca stock y caja, y abre un ticket nuevo. */
  const trasCobrar = useCallback(async () => {
    const id = estadoRef.current.activaId;
    clearTimeout(guardadoRef.current);
    limpiar();
    qc.invalidateQueries({ queryKey: QK_POS.catalogo(sucursalId) });
    qc.invalidateQueries({ queryKey: QK_POS.caja(sucursalId) });
    qc.invalidateQueries({ queryKey: QK.stock });
    if (id) invalidarAbiertas();
    await abrirBorradorNuevo();
  }, [limpiar, qc, sucursalId, invalidarAbiertas, abrirBorradorNuevo]);

  const guardarComoPresupuesto = useCallback(async () => {
    if (!activaId || !ticket.renglones.length) { showToast("El ticket está vacío.", "error"); return null; }
    if (!clienteActual || clienteActual.esConsumidorFinal) { showToast("Elegí el CLIENTE del presupuesto: Consumidor Final no lleva presupuesto.", "error"); return null; }
    try {
      const items = ticket.renglones.map((r) => ({ productoId: r.productoId, presentacionId: r.presentacionId ?? null, nombre: r.nombre, detalle: r.detalle, cantidad: r.cantidad, precioLista: r.precioLista, descuento: r.descuento || 0, iva: r.iva, lista: r.lista || "", listaId: r.listaId ?? null, ofertaNombre: r.oferta || "" }));
      const res = await ventasApi.presupuestos.crear({ clienteId: clienteActual.id, sucursalId, items });
      clearTimeout(guardadoRef.current);
      await ventasApi.descartar(activaId);
      limpiar();
      invalidarAbiertas();
      qc.invalidateQueries({ queryKey: ["presupuestos"] });
      showToast(`Presupuesto ${res.codigo} guardado como borrador. Se envía desde Ventas › Presupuestos.`, "success");
      return res;
    } catch (e) {
      showToast(e?.message || "No se pudo guardar el presupuesto.", "error");
      return null;
    }
  }, [activaId, ticket.renglones, clienteActual, sucursalId, limpiar, invalidarAbiertas, qc, showToast]);

  return {
    // datos
    cargando: bootstrap.isLoading || catalogoQ.isLoading, errorCatalogo: catalogoQ.error, config, clientes, usuarios, consumidorFinal, clienteActual, catalogo, catalogoRaw, listasPorId, preciosDe, modalidades,
    caja, cajaAbierta, requiereCaja, abiertas: abiertasQ.data ?? [], sucursalId, puedePisarPrecio, descuentoMax,
    // ticket
    ticket, dispatch, totales, problemas, puedeCobrar, activaId, guardando, ultimoKey,
    sugerenciaMonto, sugerenciasOferta, descuentosDelTicket,
    // acciones
    nuevaVenta, abrirVenta, irALista, descartar, agregar, cambiarCliente, alternarDescuento, aplicarModalidadATodo, flushGuardado, trasCobrar, guardarComoPresupuesto,
    refrescar: () => { qc.invalidateQueries({ queryKey: QK_POS.catalogo(sucursalId) }); qc.invalidateQueries({ queryKey: QK_POS.caja(sucursalId) }); qc.invalidateQueries({ queryKey: QK_POS.descuentos }); invalidarAbiertas(); },
  };
}
