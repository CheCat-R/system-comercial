/**
 * CARGAR UN COMPROBANTE DE COMPRA. En el orden en que se lee el papel: qué
 * es y de quién, el encabezado, los renglones, el pie (bonificación, IVA,
 * percepciones), qué pasa con el stock y los costos, y cómo se paga (plata que
 * ya salió de la sucursal, contado ahora, o cuotas prometidas).
 *
 * El total se calcula acá igual que en la API (`armarPie`) para que la
 * pantalla muestre lo que se va a grabar; el que manda es el servidor.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { QK } from "../../app/api/queryClient";
import { proveedoresApi } from "./api/proveedoresApi";
import { productosApi } from "../productos/api/productosApi";
import { ventasApi } from "../ventas/api/ventasApi";
import { comprasApi, TIPOS_COMPROBANTE, LETRAS, MEDIOS_PAGO_PROV, money, num, hoyISO, sumarDias, r2, norm } from "./api/comprasApi";
import "./Compras.css";

const IVAS = [0, 2.5, 5, 10.5, 21, 27];
const TIPOS = ["factura", "remito", "nota_credito", "nota_debito", "liquidacion", "orden_compra"];

/** El mismo pie que `ComprobantesService::armarPie`, para la vista previa. */
const calcularPie = (items, bonifPct, bonifImporte, percepciones, fiscal) => {
  const base = items.map((it) => {
    const neto = (Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0) * (1 - (Number(it.descuento) || 0) / 100);
    return { ...it, neto, iva: fiscal ? Number(it.iva) || 0 : 0 };
  });
  const bruto = base.reduce((a, it) => a + it.neto, 0);
  const bonificacion = bonifImporte !== "" && bonifImporte !== null ? Number(bonifImporte) || 0 : r2(bruto * (Number(bonifPct) || 0) / 100);
  const factor = bruto > 0 ? 1 - bonificacion / bruto : 1;
  let subtotalNeto = 0;
  let ivaTotal = 0;
  for (const it of base) {
    const n = it.neto * factor;
    subtotalNeto += n;
    ivaTotal += n * it.iva / 100;
  }
  const conIva = subtotalNeto + ivaTotal;
  const percs = (fiscal ? percepciones : []).filter((p) => p.on).map((p) => ({ ...p, importe: p.importe !== "" && p.importe !== null ? Number(p.importe) || 0 : r2((p.base === "total" ? conIva : subtotalNeto) * (Number(p.alicuota) || 0) / 100) }));
  const percTotal = percs.reduce((a, p) => a + p.importe, 0);
  return { bruto: r2(bruto), bonificacion: r2(bonificacion), subtotalNeto: r2(subtotalNeto), ivaTotal: r2(ivaTotal), percs, percTotal: r2(percTotal), total: r2(subtotalNeto + ivaTotal + percTotal) };
};

const renglonVacio = () => ({ key: Math.random().toString(36).slice(2), producto: null, cantidad: "", costoUnitario: "", descuento: "", iva: "" });

const CompraNueva = () => {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { showToast } = useToast();
  const { user, esJefe, can } = useAuth();
  const qc = useQueryClient();
  const puedePrecios = can("precios");
  const puedeLiq = can("liquidaciones");

  const [tipo, setTipo] = useState(sp.get("tipo") || "factura");
  const [proveedorId, setProveedorId] = useState(Number(sp.get("proveedorId")) || "");
  const [cab, setCab] = useState({ letra: "A", puntoVenta: "1", numero: "", fecha: hoyISO(), vencimientoPago: "", cae: "", observaciones: "" });
  const [refId, setRefId] = useState("");
  const [recepcion, setRecepcion] = useState(true);
  const [sucursalId, setSucursalId] = useState(user?.sucursalId || "");
  const [items, setItems] = useState([renglonVacio()]);
  const [bonifPct, setBonifPct] = useState("");
  const [bonifImporte, setBonifImporte] = useState("");
  const [percs, setPercs] = useState([]);
  const [percsProv, setPercsProv] = useState(null);
  const [actualizar, setActualizar] = useState({});
  const [activar, setActivar] = useState({});
  const [tomar, setTomar] = useState({});
  const [contado, setContado] = useState({ on: false, importe: "", medio: "transferencia", usarCaja: true, referencia: "" });
  const [cuotas, setCuotas] = useState({ on: false, lista: [] });

  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => proveedoresApi.listar() });
  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const percepcionesQ = useQuery({ queryKey: ["proveedor", proveedorId, "percepciones"], queryFn: () => comprasApi.proveedor.percepciones(proveedorId), enabled: Boolean(proveedorId) });
  const referenciables = useQuery({ queryKey: ["comprobantes", "referenciables", proveedorId], queryFn: () => comprasApi.comprobantes.referenciables(proveedorId), enabled: Boolean(proveedorId) && (tipo === "nota_credito" || tipo === "nota_debito") });
  const disponibles = useQuery({ queryKey: ["pagos", "disponibles", proveedorId], queryFn: () => comprasApi.pagos.disponibles(proveedorId, "mercaderia"), enabled: Boolean(proveedorId) });
  const caja = useQuery({ queryKey: ["pos", "caja", user?.sucursalId], queryFn: () => ventasApi.caja.actual(user.sucursalId), enabled: Boolean(user?.sucursalId) });

  const proveedor = useMemo(() => (proveedores.data || []).find((p) => p.id === Number(proveedorId)) || null, [proveedores.data, proveedorId]);
  // Las percepciones del proveedor se ofrecen tildadas cuando cambia el proveedor (ajuste durante el render, sin efecto).
  if (percepcionesQ.data && percsProv !== percepcionesQ.data) {
    setPercsProv(percepcionesQ.data);
    setPercs(percepcionesQ.data.filter((p) => p.activa).map((p) => ({ nombre: p.nombre, alicuota: p.alicuota, base: p.base, importe: "", on: true })));
  }
  const fiscal = tipo !== "liquidacion";
  const esNota = tipo === "nota_credito" || tipo === "nota_debito";
  const generaDeuda = ["factura", "liquidacion", "nota_debito"].includes(tipo);
  const mueveStock = recepcion && ["remito", "factura", "liquidacion", "nota_credito"].includes(tipo);
  const ivaDefault = proveedor?.condicionIva === "responsable_inscripto" ? 21 : 0;
  const pie = useMemo(() => calcularPie(items.filter((it) => it.producto), bonifPct, bonifImporte, percs, fiscal), [items, bonifPct, bonifImporte, percs, fiscal]);
  const activos = useMemo(() => (productos.data || []).filter((p) => p.estado === "activo"), [productos.data]);

  /** El formato de compra de este proveedor para un producto (si lo trae). */
  const formatoDe = (prod) => (prod?.formatosCompra || []).find((f) => f.proveedorId === Number(proveedorId));
  const activoDe = (prod) => (prod?.formatosCompra || []).find((f) => f.usarParaPrecio);

  const setItem = (key, patch) => setItems((xs) => xs.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const elegirProducto = (key, prod) => {
    const f = formatoDe(prod);
    setItem(key, { producto: prod, costoUnitario: f?.costoListaUnitario ? String(r2(f.costoListaUnitario)) : "", descuento: f?.descuento ? String(f.descuento) : "", iva: prod ? String(prod.iva ?? ivaDefault) : "" });
  };

  // Diferencias de costo: renglones cuyo costo del bulto (unitario × unidades del formato) difiere del catálogo.
  const diferencias = items.filter((it) => it.producto && Number(it.costoUnitario) > 0).map((it) => {
    const f = formatoDe(it.producto);
    if (!f) return null;
    const nuevoBulto = r2(Number(it.costoUnitario) * (f.cantidad || 1));
    const cambia = Math.abs(nuevoBulto - (f.costo || 0)) > 0.005;
    const activo = activoDe(it.producto);
    return { key: it.key, producto: it.producto, formato: f, nuevoBulto, cambia, esActivo: activo?.id === f.id, hayOtroActivo: Boolean(activo) && activo.id !== f.id };
  }).filter(Boolean);

  const tomado = r2(Object.values(tomar).reduce((a, v) => a + (Number(v) || 0), 0));
  const contadoImporte = contado.on ? r2(Number(contado.importe) || 0) : 0;
  const saldoPrevisto = r2(pie.total - tomado - contadoImporte);
  const sumaCuotas = r2(cuotas.lista.reduce((a, c) => a + (Number(c.importe) || 0), 0));

  const armarCuotas = (n) => {
    const base = Math.floor((saldoPrevisto / n) * 100) / 100;
    const lista = Array.from({ length: n }, (_, i) => ({ importe: i === n - 1 ? r2(saldoPrevisto - base * (n - 1)) : base, fechaVenc: sumarDias(cab.fecha, (proveedor?.diasPago || 30) * (i + 1)) }));
    setCuotas({ on: true, lista });
  };

  const crear = useMutation({
    mutationFn: (body) => comprasApi.comprobantes.crear(body),
    onSuccess: (c) => { showToast(`${c.etiqueta} cargada.`, "success"); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: QK.productos }); qc.invalidateQueries({ queryKey: QK.stock }); navigate(`/abastecimiento/compras/${c.id}`); },
    onError: (e) => showToast(e?.message || "No se pudo cargar.", "error"),
  });

  const enviar = () => {
    if (!proveedorId) return showToast("Elegí el proveedor.", "warning");
    const renglones = items.filter((it) => it.producto && Number(it.cantidad) > 0);
    if (!renglones.length) return showToast("Agregá al menos un renglón con cantidad.", "warning");
    if (mueveStock && !sucursalId) return showToast("Indicá la sucursal de recepción.", "warning");
    if (cuotas.on && cuotas.lista.length && Math.abs(sumaCuotas - saldoPrevisto) > 0.009) return showToast(`Las cuotas suman ${money(sumaCuotas)} y el saldo es ${money(saldoPrevisto)}.`, "warning");
    if (contado.on && contado.medio === "efectivo" && contado.usarCaja && !caja.data) return showToast("No hay turno de caja abierto para el contado en efectivo.", "warning");
    crear.mutate({
      tipo, letra: fiscal ? cab.letra : "X", puntoVenta: cab.puntoVenta || "1", numero: cab.numero ? Number(cab.numero) : undefined, proveedorId: Number(proveedorId),
      sucursalId: mueveStock ? Number(sucursalId) : undefined, recepcion: mueveStock, fecha: cab.fecha || undefined, vencimientoPago: cab.vencimientoPago || undefined,
      cae: cab.cae || undefined, observaciones: cab.observaciones || undefined, refComprobanteId: esNota && refId ? Number(refId) : undefined,
      bonificacion: Number(bonifPct) || 0, bonificacionImporte: bonifImporte !== "" ? Number(bonifImporte) : undefined,
      percepciones: fiscal ? percs.filter((p) => p.on).map((p) => ({ nombre: p.nombre, alicuota: Number(p.alicuota) || 0, base: p.base, importe: p.importe !== "" ? Number(p.importe) : undefined })) : undefined,
      items: renglones.map((it) => ({ productoId: it.producto.id, cantidad: Number(it.cantidad), costoUnitario: Number(it.costoUnitario) || 0, descuento: Number(it.descuento) || 0, iva: it.iva !== "" ? Number(it.iva) : undefined })),
      actualizarCostos: puedePrecios ? diferencias.filter((d) => actualizar[d.key]).map((d) => ({ productoId: d.producto.id, costo: d.nuevoBulto, cantidad: d.formato.cantidad })) : undefined,
      activarProveedor: puedePrecios ? diferencias.filter((d) => activar[d.key]).map((d) => d.producto.id) : undefined,
      tomarPagos: generaDeuda ? Object.entries(tomar).filter(([, v]) => Number(v) > 0).map(([pagoId, v]) => ({ pagoId: Number(pagoId), importe: r2(v) })) : undefined,
      pagoContado: generaDeuda && contado.on && contadoImporte > 0 ? { importe: contadoImporte, medio: contado.medio, cajaSesionId: contado.medio === "efectivo" && contado.usarCaja ? caja.data?.id : undefined, referencia: contado.referencia || undefined } : undefined,
      compromisos: generaDeuda && tipo !== "nota_debito" && cuotas.on && cuotas.lista.length ? cuotas.lista.map((c) => ({ importe: r2(c.importe), fechaVenc: c.fechaVenc })) : undefined,
    });
  };

  return (
    <Box className="page fade-in">
      <EntityHeader eyebrow="Compras" title="Nuevo comprobante de compra" subtitle="Se carga como lo imprime el papel: el sistema arma el total, la deuda y el stock." onBack={() => navigate("/abastecimiento/compras")}
        actions={<Button variant="primary" loading={crear.isPending} onClick={enviar}>Cargar {pie.total > 0 ? money(pie.total) : ""}</Button>} />

      <Box sx={{ display: "grid", gap: 2 }}>
        <Card className="entity-card compra-seccion">
          <Typography className="compra-seccion__titulo">1 · Qué es y de quién</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 2 }}>
            <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setRefId(""); if (e.target.value === "nota_credito") setRecepcion(false); }}>
              {TIPOS.filter((t) => t !== "liquidacion" || puedeLiq).map((t) => <MenuItem key={t} value={t}>{TIPOS_COMPROBANTE[t].label}</MenuItem>)}
            </TextField>
            <Autocomplete size="small" options={(proveedores.data || []).filter((p) => p.proveeMercaderia)} getOptionLabel={(p) => p.nombre} value={proveedor}
              onChange={(_, v) => { setProveedorId(v?.id || ""); setTomar({}); setActualizar({}); setActivar({}); setRefId(""); setCab((c) => ({ ...c, vencimientoPago: v?.diasPago ? sumarDias(c.fecha, v.diasPago) : c.vencimientoPago })); }}
              renderInput={(p) => <TextField {...p} label="Proveedor" autoFocus />} />
            <TextField size="small" type="date" label="Fecha del papel" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "80px 120px 1fr 1fr 1fr", gap: 2 }}>
            <TextField select size="small" label="Letra" value={fiscal ? cab.letra : "X"} disabled={!fiscal} onChange={(e) => setCab({ ...cab, letra: e.target.value })}>{LETRAS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}</TextField>
            <TextField size="small" label="Pto. venta" value={cab.puntoVenta} onChange={(e) => setCab({ ...cab, puntoVenta: e.target.value })} />
            <TextField size="small" type="number" label="Número" value={cab.numero} onChange={(e) => setCab({ ...cab, numero: e.target.value })} />
            <TextField size="small" type="date" label="Vence el" value={cab.vencimientoPago} onChange={(e) => setCab({ ...cab, vencimientoPago: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} disabled={!generaDeuda} />
            <TextField size="small" label="CAE (del QR)" value={cab.cae} onChange={(e) => setCab({ ...cab, cae: e.target.value })} disabled={!fiscal} />
          </Box>
          {esNota && proveedorId && (
            <TextField select size="small" label="Factura que ajusta" value={refId} onChange={(e) => setRefId(e.target.value)} helperText="Atarla es lo que hace que ESA factura tenga su saldo real.">
              <MenuItem value="">— sin referencia (ajuste general del proveedor) —</MenuItem>
              {(referenciables.data || []).map((r) => <MenuItem key={r.id} value={r.id}>{r.etiqueta} · saldo {money(r.saldo)}</MenuItem>)}
            </TextField>
          )}
          {proveedor && proveedor.condicionIva !== "responsable_inscripto" && <Alert severity="info">{proveedor.nombre} no discrimina IVA: los renglones arrancan con IVA 0.</Alert>}
        </Card>

        <Card className="entity-card compra-seccion">
          <Typography className="compra-seccion__titulo">2 · Renglones</Typography>
          <Table size="small" className="compra-renglones">
            <TableHead><TableRow><TableCell>Producto</TableCell><TableCell align="right" width={110}>Cantidad</TableCell><TableCell align="right" width={130}>Costo unit.</TableCell><TableCell align="right" width={90}>Desc. %</TableCell><TableCell align="right" width={100}>IVA %</TableCell><TableCell align="right" width={120}>Neto</TableCell><TableCell width={40} /></TableRow></TableHead>
            <TableBody>
              {items.map((it) => {
                const f = formatoDe(it.producto);
                return (
                  <TableRow key={it.key}>
                    <TableCell>
                      <Autocomplete size="small" options={activos} getOptionLabel={(p) => `${p.nombre}${p.codigoPropio ? ` · ${p.codigoPropio}` : ""}`} value={it.producto}
                        filterOptions={(opts, s) => { const t = norm(s.inputValue); return t ? opts.filter((p) => norm(`${p.nombre} ${p.codigoPropio} ${p.codigoBarras} ${p.marca}`).includes(t)).slice(0, 40) : opts.slice(0, 40); }}
                        onChange={(_, v) => elegirProducto(it.key, v)} renderInput={(p) => <TextField {...p} placeholder="Buscar producto…" />} />
                      {it.producto && <Typography variant="caption" color="text.secondary">{f ? `Formato: ×${num(f.cantidad)} a ${money(f.costo)} el bulto` : "Este proveedor no tiene formato cargado para el producto"}</Typography>}
                    </TableCell>
                    <TableCell><TextField size="small" type="number" value={it.cantidad} onChange={(e) => setItem(it.key, { cantidad: e.target.value })} slotProps={{ htmlInput: { style: { textAlign: "right" } } }} /></TableCell>
                    <TableCell><TextField size="small" type="number" value={it.costoUnitario} onChange={(e) => setItem(it.key, { costoUnitario: e.target.value })} slotProps={{ htmlInput: { style: { textAlign: "right" } } }} /></TableCell>
                    <TableCell><TextField size="small" type="number" value={it.descuento} onChange={(e) => setItem(it.key, { descuento: e.target.value })} slotProps={{ htmlInput: { style: { textAlign: "right" } } }} /></TableCell>
                    <TableCell><TextField select size="small" value={fiscal ? it.iva : "0"} disabled={!fiscal} onChange={(e) => setItem(it.key, { iva: e.target.value })} fullWidth>{IVAS.map((v) => <MenuItem key={v} value={String(v)}>{v}%</MenuItem>)}</TextField></TableCell>
                    <TableCell align="right"><strong>{money((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0) * (1 - (Number(it.descuento) || 0) / 100))}</strong></TableCell>
                    <TableCell><IconButton size="small" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.key !== it.key) : [renglonVacio()]))}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setItems((xs) => [...xs, renglonVacio()])}>Agregar renglón</Button></Box>
        </Card>

        <Card className="entity-card compra-seccion">
          <Typography className="compra-seccion__titulo">3 · El pie</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, alignItems: "start" }}>
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <TextField size="small" type="number" label="Bonificación %" value={bonifPct} onChange={(e) => { setBonifPct(e.target.value); setBonifImporte(""); }} />
                <TextField size="small" type="number" label="Bonificación (importe del papel)" value={bonifImporte} onChange={(e) => setBonifImporte(e.target.value)} helperText="Si viene, manda sobre el %." />
              </Box>
              {fiscal && (
                <Box sx={{ display: "grid", gap: 1 }}>
                  <Typography variant="subtitle2">Percepciones</Typography>
                  {percs.map((p, i) => (
                    <Box key={i} sx={{ display: "grid", gridTemplateColumns: "auto 2fr 90px 100px 130px auto", gap: 1, alignItems: "center" }}>
                      <Checkbox size="small" checked={p.on} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                      <TextField size="small" value={p.nombre} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Perc. IIBB…" />
                      <TextField size="small" type="number" value={p.alicuota} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, alicuota: e.target.value } : x)))} label="%" />
                      <TextField select size="small" value={p.base} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)))}><MenuItem value="neto">s/ neto</MenuItem><MenuItem value="total">s/ total</MenuItem></TextField>
                      <TextField size="small" type="number" value={p.importe} onChange={(e) => setPercs(percs.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))} label="Importe del papel" />
                      <IconButton size="small" onClick={() => setPercs(percs.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </Box>
                  ))}
                  <Box><Button size="small" variant="ghost" startIcon={<AddIcon />} onClick={() => setPercs([...percs, { nombre: "", alicuota: "", base: "neto", importe: "", on: true }])}>Agregar percepción</Button></Box>
                </Box>
              )}
              {!fiscal && <Alert severity="warning">La liquidación no discrimina IVA ni lleva percepciones: se graba con letra X e IVA 0.</Alert>}
            </Box>
            <Box className="compra-pie">
              <Box className="compra-pie__fila"><span>Subtotal renglones</span><span>{money(pie.bruto)}</span></Box>
              {pie.bonificacion > 0 && <Box className="compra-pie__fila"><span>Bonificación</span><span>−{money(pie.bonificacion)}</span></Box>}
              <Box className="compra-pie__fila"><span>Neto gravado</span><span>{money(pie.subtotalNeto)}</span></Box>
              <Box className="compra-pie__fila"><span>IVA</span><span>{money(pie.ivaTotal)}</span></Box>
              {pie.percs.map((p, i) => <Box key={i} className="compra-pie__fila"><span>{p.nombre || "Percepción"}</span><span>{money(p.importe)}</span></Box>)}
              <Box className="compra-pie__fila compra-pie__fila--total"><span>Total</span><span>{money(pie.total)}</span></Box>
            </Box>
          </Box>
        </Card>

        {tipo !== "orden_compra" && tipo !== "nota_debito" && (
          <Card className="entity-card compra-seccion">
            <Typography className="compra-seccion__titulo">4 · Stock y costos</Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <FormControlLabel control={<Switch checked={recepcion} onChange={(e) => setRecepcion(e.target.checked)} />} label={tipo === "nota_credito" ? "Esta nota devuelve mercadería (sale del stock)" : "Recibe la mercadería (entra al stock)"} />
              {recepcion && (esJefe
                ? <TextField select size="small" label="Sucursal" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} sx={{ minWidth: 220 }}>{(boot.data?.sucursales || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}</TextField>
                : <Typography variant="body2" color="text.secondary">en {user?.sucursalNombre}</Typography>)}
            </Box>
            {tipo !== "nota_credito" && diferencias.length > 0 && (
              <Box sx={{ display: "grid", gap: 1 }}>
                <Typography variant="subtitle2">Diferencias de costo {puedePrecios ? "" : "(pide el permiso de precios)"}</Typography>
                {diferencias.map((d) => (
                  <Box key={d.key} sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 1, alignItems: "center" }}>
                    <Checkbox size="small" disabled={!puedePrecios || !d.cambia} checked={Boolean(actualizar[d.key])} onChange={(e) => setActualizar({ ...actualizar, [d.key]: e.target.checked })} />
                    <Box><strong>{d.producto.nombre}</strong><Typography variant="caption" display="block" color={d.cambia ? "warning.main" : "text.secondary"}>{d.cambia ? `El bulto ×${num(d.formato.cantidad)} pasa de ${money(d.formato.costo)} a ${money(d.nuevoBulto)}: actualizar el costo de catálogo` : `Mismo costo que el catálogo (${money(d.formato.costo)})`}</Typography></Box>
                    {d.hayOtroActivo && <FormControlLabel control={<Checkbox size="small" disabled={!puedePrecios} checked={Boolean(activar[d.key])} onChange={(e) => setActivar({ ...activar, [d.key]: e.target.checked })} />} label="Pasa a ser el proveedor que fija el precio" />}
                  </Box>
                ))}
              </Box>
            )}
          </Card>
        )}

        {generaDeuda && (
          <Card className="entity-card compra-seccion">
            <Typography className="compra-seccion__titulo">5 · Cómo se paga</Typography>
            {(disponibles.data || []).length > 0 && (
              <Box sx={{ display: "grid", gap: 1 }}>
                <Typography variant="subtitle2">Plata que ya salió de la sucursal para este proveedor</Typography>
                {disponibles.data.map((p) => (
                  <Box key={p.id} sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 1, alignItems: "center" }}>
                    <Checkbox size="small" checked={tomar[p.id] !== undefined} onChange={(e) => setTomar((t) => { const n = { ...t }; if (e.target.checked) n[p.id] = r2(Math.min(p.saldo, Math.max(0, pie.total - tomado))) || p.saldo; else delete n[p.id]; return n; })} />
                    <Box><strong>Pago #{p.id} · {MEDIOS_PAGO_PROV[p.medio] || p.medio}{p.esFlete ? " · flete" : ""}</strong><Typography variant="caption" display="block" color="text.secondary">{p.concepto || "—"} · {p.sucursalNombre || "administración"} · {p.usuarioNombre}</Typography></Box>
                    <Typography variant="body2" color="text.secondary">sin aplicar {money(p.saldo)}</Typography>
                    <TextField size="small" type="number" value={tomar[p.id] ?? ""} disabled={tomar[p.id] === undefined} onChange={(e) => setTomar({ ...tomar, [p.id]: e.target.value })} sx={{ width: 130 }} />
                  </Box>
                ))}
              </Box>
            )}
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <FormControlLabel control={<Switch checked={contado.on} onChange={(e) => setContado({ ...contado, on: e.target.checked, importe: e.target.checked ? String(r2(pie.total - tomado)) : "" })} />} label="Se paga (parte) ahora" />
              {contado.on && (<>
                <TextField size="small" type="number" label="Importe" value={contado.importe} onChange={(e) => setContado({ ...contado, importe: e.target.value })} sx={{ width: 150 }} />
                <TextField select size="small" label="Medio" value={contado.medio} onChange={(e) => setContado({ ...contado, medio: e.target.value })} sx={{ width: 170 }}>{Object.entries(MEDIOS_PAGO_PROV).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
                {contado.medio === "efectivo" && <FormControlLabel control={<Switch size="small" checked={contado.usarCaja} onChange={(e) => setContado({ ...contado, usarCaja: e.target.checked })} />} label={caja.data ? `Sale del cajón (turno #${caja.data.id})` : "Sale del cajón (sin turno abierto)"} />}
                <TextField size="small" label="Referencia" value={contado.referencia} onChange={(e) => setContado({ ...contado, referencia: e.target.value })} />
              </>)}
            </Box>
            {tipo !== "nota_debito" && (
              <Box sx={{ display: "grid", gap: 1 }}>
                <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                  <FormControlLabel control={<Switch checked={cuotas.on} onChange={(e) => (e.target.checked ? armarCuotas(1) : setCuotas({ on: false, lista: [] }))} />} label={`Programar el vencimiento del saldo (${money(saldoPrevisto)})`} />
                  {cuotas.on && [1, 2, 3, 4, 6].map((n) => <Button key={n} size="small" variant="ghost" onClick={() => armarCuotas(n)}>{n} cuota{n > 1 ? "s" : ""}</Button>)}
                </Box>
                {cuotas.on && cuotas.lista.map((c, i) => (
                  <Box key={i} sx={{ display: "grid", gridTemplateColumns: "60px 160px 180px auto", gap: 1, alignItems: "center" }}>
                    <Typography variant="body2" color="text.secondary">{cuotas.lista.length > 1 ? `Cuota ${i + 1}` : "Único"}</Typography>
                    <TextField size="small" type="number" value={c.importe} onChange={(e) => setCuotas({ ...cuotas, lista: cuotas.lista.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)) })} />
                    <TextField size="small" type="date" value={c.fechaVenc} onChange={(e) => setCuotas({ ...cuotas, lista: cuotas.lista.map((x, j) => (j === i ? { ...x, fechaVenc: e.target.value } : x)) })} />
                    <IconButton size="small" onClick={() => setCuotas({ ...cuotas, lista: cuotas.lista.filter((_, j) => j !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
                {cuotas.on && Math.abs(sumaCuotas - saldoPrevisto) > 0.009 && <Typography variant="caption" color="error">Las cuotas suman {money(sumaCuotas)} y tienen que cubrir {money(saldoPrevisto)}.</Typography>}
                {proveedor?.medioHabitual === "echeq" && cuotas.on && <Typography variant="caption" color="text.secondary">{proveedor.nombre} cobra con echeq: cada cuota nace también como echeq "a completar" en la cartera.</Typography>}
              </Box>
            )}
            <Typography variant="body2" color="text.secondary">Total {money(pie.total)} · tomado {money(tomado)} · contado {money(contadoImporte)} · <strong>queda en cuenta corriente {money(saldoPrevisto)}</strong></Typography>
          </Card>
        )}

        <Card className="entity-card">
          <TextField size="small" label="Observaciones" value={cab.observaciones} onChange={(e) => setCab({ ...cab, observaciones: e.target.value })} multiline minRows={2} fullWidth />
        </Card>
      </Box>
    </Box>
  );
};

export default CompraNueva;
