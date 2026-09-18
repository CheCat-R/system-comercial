/**
 * La ficha del producto, contra la API. Cinco pestañas:
 *   Ficha · Formatos de compra · Presentaciones (granel) · Formato de venta · Stock e historial
 *
 * El precio se ve pero no se escribe: cambia moviendo el costo del formato
 * activo o el markup de la lista. Todo cambio de costo queda en el historial y
 * se puede deshacer por lote desde «Precios y márgenes».
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";

import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useEntityLabel } from "../../components/Breadcrumbs/EntityLabelContext";
import { QK } from "../../app/api/queryClient";
import { productosApi, money, num, fmtTam, ESTADOS_PRODUCTO, IVAS } from "./api/productosApi";
import { seguridadApi } from "../seguridad/api/seguridadApi";
import { useEstadoDesde } from "../../hooks/useEstadoDesde";
import "./ProductoDetalle.css";

const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/* ------------------------------------------------------------- ficha */
const Ficha = ({ p, catalogos, puede, onGuardar, guardando }) => {
  const [f, setF] = useEstadoDesde(p, (x) => ({
    nombre: x.nombre, descripcion: x.descripcion || "", codigoPropio: x.codigoPropio, codigoBarras: x.codigoBarras, dun: x.dun,
    unidadesPorBulto: x.unidadesPorBulto, marcaId: x.marcaId || "", categoriaId: x.categoriaId || "", subcategoriaId: x.subcategoriaId || "",
    iva: x.iva, stockMin: x.stockMin, redondeo: x.redondeo ?? "", soloFraccionar: x.soloFraccionar, publicado: x.publicado,
    etiquetaMarca: x.etiquetaMarca || "", etiquetaNombre: x.etiquetaNombre || "", etiquetas: x.etiquetas || [],
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const subcats = (catalogos?.subcategorias || []).filter((s) => String(s.categoriaId) === String(f.categoriaId));

  return (
    <Card className="entity-card">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <TextField label="Nombre" size="small" value={f.nombre || ""} onChange={set("nombre")} disabled={!puede} />
        <TextField select label="IVA" size="small" value={f.iva ?? 21} onChange={set("iva")} disabled={!puede}>
          {IVAS.map((i) => <MenuItem key={i} value={i}>{i}%</MenuItem>)}
        </TextField>
        <TextField label="Código propio" size="small" value={f.codigoPropio || ""} onChange={set("codigoPropio")} disabled={!puede} />
        <TextField label="Código de barras (unidad)" size="small" value={f.codigoBarras || ""} onChange={set("codigoBarras")} disabled={!puede} />
        <TextField label="DUN-14 (bulto)" size="small" value={f.dun || ""} onChange={set("dun")} disabled={!puede} helperText="Lo que se escanea al recibir la caja." />
        <TextField label="Unidades por bulto" size="small" type="number" value={f.unidadesPorBulto ?? 1} onChange={set("unidadesPorBulto")} disabled={!puede} />
        <TextField select label="Marca" size="small" value={f.marcaId ?? ""} onChange={set("marcaId")} disabled={!puede}>
          <MenuItem value="">Sin marca</MenuItem>
          {(catalogos?.marcas || []).map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre}</MenuItem>)}
        </TextField>
        <TextField select label="Categoría" size="small" value={f.categoriaId ?? ""} onChange={(e) => setF({ ...f, categoriaId: e.target.value, subcategoriaId: "" })} disabled={!puede}>
          <MenuItem value="">Sin categoría</MenuItem>
          {(catalogos?.categorias || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
        </TextField>
        <TextField select label="Subcategoría" size="small" value={f.subcategoriaId ?? ""} onChange={set("subcategoriaId")} disabled={!puede || !subcats.length}>
          <MenuItem value="">—</MenuItem>
          {subcats.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
        </TextField>
        <TextField select label="Etiquetas" size="small" value={f.etiquetas || []} onChange={(e) => setF({ ...f, etiquetas: e.target.value })} disabled={!puede}
          slotProps={{ select: { multiple: true, renderValue: (v) => v.map((id) => catalogos?.etiquetas?.find((e) => e.id === id)?.nombre).filter(Boolean).join(", ") } }}>
          {(catalogos?.etiquetas || []).map((e) => <MenuItem key={e.id} value={e.id}><Checkbox size="small" checked={(f.etiquetas || []).includes(e.id)} />{e.nombre}</MenuItem>)}
        </TextField>
        <TextField label="Stock mínimo" size="small" type="number" value={f.stockMin ?? 0} onChange={set("stockMin")} disabled={!puede} />
        <TextField select label="Redondeo de góndola" size="small" value={f.redondeo ?? ""} onChange={set("redondeo")} disabled={!puede} helperText="Vacío = el general de configuración.">
          <MenuItem value="">Heredar</MenuItem>
          {[0, 1, 10, 50, 100].map((r) => <MenuItem key={r} value={r}>{r === 0 ? "Sin redondeo" : `A $${r}`}</MenuItem>)}
        </TextField>
        <TextField label="Marca en el cartel" size="small" value={f.etiquetaMarca || ""} onChange={set("etiquetaMarca")} disabled={!puede} helperText="Si difiere del nombre de la marca." />
        <TextField label="Nombre en el cartel" size="small" value={f.etiquetaNombre || ""} onChange={set("etiquetaNombre")} disabled={!puede} />
        <TextField label="Descripción" size="small" multiline minRows={2} value={f.descripcion || ""} onChange={set("descripcion")} disabled={!puede} sx={{ gridColumn: "1 / -1" }} />
        {p.tipo === "granel" && (
          <FormControlLabel control={<Switch checked={Boolean(f.soloFraccionar)} onChange={set("soloFraccionar")} disabled={!puede} />} label="Sólo se vende fraccionado (nunca suelto en el POS)" />
        )}
        <FormControlLabel control={<Switch checked={Boolean(f.publicado)} onChange={set("publicado")} disabled={!puede} />} label="Publicado en el sitio web" />
      </Box>
      {puede && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button variant="primary" loading={guardando} onClick={() => onGuardar({
            ...f, marcaId: f.marcaId || null, categoriaId: f.categoriaId || null, subcategoriaId: f.subcategoriaId || null,
            iva: Number(f.iva), unidadesPorBulto: Number(f.unidadesPorBulto) || 1, stockMin: Number(f.stockMin) || 0,
            redondeo: f.redondeo === "" ? null : Number(f.redondeo), etiquetaMarca: f.etiquetaMarca || null, etiquetaNombre: f.etiquetaNombre || null,
          })}>Guardar ficha</Button>
        </Box>
      )}
    </Card>
  );
};

/* ------------------------------------------------ formatos de compra */
const FormatosCompra = ({ p, proveedores, puede, veCostos, onGuardar, guardando }) => {
  const [filas, setFilas] = useEstadoDesde(p, (x) => (x.formatosCompra || []).map((f) => ({ ...f })));
  const upd = (i, k, v) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const activar = (i) => setFilas(filas.map((f, j) => ({ ...f, usarParaPrecio: j === i })));
  const unidad = p.tipo === "granel" ? "kg" : "u";

  return (
    <Card className="entity-card">
      <Box className="table-tabs" sx={{ mb: 1 }}>
        <Box>
          <Typography className="card-title">Formatos de compra</Typography>
          <Typography variant="body2" color="text.secondary">Cómo lo vende cada proveedor: bulto, costo de lista, descuentos en cascada y flete. Uno solo <strong>fija el precio</strong>.</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {puede && <Button size="small" variant="secondary" startIcon={<AddIcon />} onClick={() => setFilas([...filas, { proveedorId: proveedores?.[0]?.id ?? "", cantidad: 1, costo: 0, descuento: 0, descuento2: 0, descuento3: 0, descuento4: 0, flete: 0, modoCosto: "lista", costoFinal: 0, porcSinFactura: 0, usarParaPrecio: filas.length === 0, codigoProveedor: "" }])}>Agregar</Button>}
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Fija precio</TableCell><TableCell>Proveedor</TableCell><TableCell>Bulto ({unidad})</TableCell><TableCell>Modo</TableCell>
            <TableCell>Costo bulto</TableCell><TableCell>Desc. %</TableCell><TableCell>Desc. 2</TableCell><TableCell>Flete %</TableCell><TableCell>Sin fact. %</TableCell>
            <TableCell>Cód. prov.</TableCell>{veCostos && <TableCell align="right">Neto / {unidad}</TableCell>}<TableCell />
          </TableRow></TableHead>
          <TableBody>
            {filas.map((f, i) => (
              <TableRow key={f.id ?? `n${i}`}>
                <TableCell><Checkbox size="small" checked={Boolean(f.usarParaPrecio)} onChange={() => activar(i)} disabled={!puede} /></TableCell>
                <TableCell>
                  <TextField select size="small" value={f.proveedorId ?? ""} onChange={(e) => upd(i, "proveedorId", e.target.value)} disabled={!puede} sx={{ minWidth: 160 }}>
                    {(proveedores || []).map((pr) => <MenuItem key={pr.id} value={pr.id}>{pr.nombre}</MenuItem>)}
                  </TextField>
                </TableCell>
                <TableCell><TextField size="small" type="number" value={f.cantidad ?? 1} onChange={(e) => upd(i, "cantidad", e.target.value)} disabled={!puede} sx={{ width: 90 }} /></TableCell>
                <TableCell>
                  <TextField select size="small" value={f.modoCosto || "lista"} onChange={(e) => upd(i, "modoCosto", e.target.value)} disabled={!puede} sx={{ width: 110 }}>
                    <MenuItem value="lista">Lista</MenuItem><MenuItem value="final">Final</MenuItem>
                  </TextField>
                </TableCell>
                <TableCell>
                  {f.modoCosto === "final"
                    ? <TextField size="small" type="number" value={f.costoFinal ?? 0} onChange={(e) => upd(i, "costoFinal", e.target.value)} disabled={!puede} sx={{ width: 120 }} helperText="con IVA" />
                    : <TextField size="small" type="number" value={f.costo ?? 0} onChange={(e) => upd(i, "costo", e.target.value)} disabled={!puede} sx={{ width: 120 }} />}
                </TableCell>
                <TableCell><TextField size="small" type="number" value={f.descuento ?? 0} onChange={(e) => upd(i, "descuento", e.target.value)} disabled={!puede || f.modoCosto === "final"} sx={{ width: 75 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={f.descuento2 ?? 0} onChange={(e) => upd(i, "descuento2", e.target.value)} disabled={!puede || f.modoCosto === "final"} sx={{ width: 75 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={f.flete ?? 0} onChange={(e) => upd(i, "flete", e.target.value)} disabled={!puede || f.modoCosto === "final"} sx={{ width: 75 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={f.porcSinFactura ?? 0} onChange={(e) => upd(i, "porcSinFactura", e.target.value)} disabled={!puede} sx={{ width: 75 }} /></TableCell>
                <TableCell><TextField size="small" value={f.codigoProveedor || ""} onChange={(e) => upd(i, "codigoProveedor", e.target.value)} disabled={!puede} sx={{ width: 110 }} /></TableCell>
                {veCostos && <TableCell align="right" className="nowrap">{f.costoNetoUnitario != null ? money(f.costoNetoUnitario) : "—"}</TableCell>}
                <TableCell>{puede && <IconButton size="small" onClick={() => setFilas(filas.filter((_, j) => j !== i))}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton>}</TableCell>
              </TableRow>
            ))}
            {!filas.length && <TableRow><TableCell colSpan={12}><Typography variant="body2" color="text.secondary">Sin formatos de compra: el producto no tiene costo ni precio.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Box>
      {puede && <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}><Button variant="primary" loading={guardando} onClick={() => onGuardar(filas)}>Guardar formatos</Button></Box>}
    </Card>
  );
};

/* ------------------------------------------------------ presentaciones */
const Presentaciones = ({ p, puede, onGuardar, guardando }) => {
  const { showToast } = useToast();
  const [filas, setFilas] = useEstadoDesde(p, (y) => (y.presentaciones || []).map((x) => ({ id: x.id, tamKg: x.tamKg, codigoBarras: x.codigoBarras })));
  const generar = async (i) => {
    try {
      const r = await productosApi.siguienteEan(filas.map((f) => f.codigoBarras));
      setFilas(filas.map((f, j) => (j === i ? { ...f, codigoBarras: r.codigo } : f)));
    } catch (err) { showToast(err?.message, "error"); }
  };
  return (
    <Card className="entity-card">
      <Box className="table-tabs" sx={{ mb: 1 }}>
        <Box>
          <Typography className="card-title">Presentaciones (paquetes)</Typography>
          <Typography variant="body2" color="text.secondary">Los tamaños en que se fracciona el granel. Cada uno lleva su código de barras: es el que la caja escanea en el paquete.</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {puede && <Button size="small" variant="secondary" startIcon={<AddIcon />} onClick={() => setFilas([...filas, { tamKg: 0.5, codigoBarras: "" }])}>Agregar</Button>}
      </Box>
      <Table size="small">
        <TableHead><TableRow><TableCell>Tamaño (kg)</TableCell><TableCell>Código de barras (EAN-13)</TableCell><TableCell>Costo</TableCell><TableCell>Precio mostrador</TableCell><TableCell /></TableRow></TableHead>
        <TableBody>
          {filas.map((f, i) => {
            const real = (p.presentaciones || []).find((x) => x.id === f.id);
            return (
              <TableRow key={f.id ?? `n${i}`}>
                <TableCell><TextField size="small" type="number" value={f.tamKg} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, tamKg: e.target.value } : x)))} disabled={!puede} sx={{ width: 110 }} helperText={fmtTam(Number(f.tamKg) || 0)} /></TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <TextField size="small" value={f.codigoBarras || ""} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, codigoBarras: e.target.value } : x)))} disabled={!puede} sx={{ width: 190 }} />
                    {puede && <Tooltip title="Generar uno de la serie interna"><IconButton size="small" onClick={() => generar(i)}><QrCode2OutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                  </Box>
                </TableCell>
                <TableCell>{real?.costoNeto != null ? money(real.costoNeto) : "—"}</TableCell>
                <TableCell>{real ? (real.sinFormato ? <StatusBadge tone="warning" label="sin formato de venta" showDot={false} /> : money(real.precioFinal)) : "—"}</TableCell>
                <TableCell>{puede && <IconButton size="small" onClick={() => setFilas(filas.filter((_, j) => j !== i))}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton>}</TableCell>
              </TableRow>
            );
          })}
          {!filas.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Sin presentaciones: sólo se vende suelto.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
      {puede && <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}><Button variant="primary" loading={guardando} onClick={() => onGuardar(filas.map((f) => ({ ...f, tamKg: Number(f.tamKg) })))}>Guardar presentaciones</Button></Box>}
    </Card>
  );
};

/* ------------------------------------------------------ formato de venta */
const EditorListas = ({ titulo, subtitulo, filasIniciales, listasCatalogo, puede, veCostos, onGuardar, guardando }) => {
  const [filas, setFilas] = useEstadoDesde(filasIniciales, (ini) => (ini || []).map((f) => ({ ...f })));
  const activas = (listasCatalogo?.listas || []).filter((l) => l.activa);
  const libres = activas.filter((l) => !filas.some((f) => f.listaId === l.id));
  const upd = (i, k, v) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <Card className="entity-card">
      <Box className="table-tabs" sx={{ mb: 1 }}>
        <Box>
          <Typography className="card-title">{titulo}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitulo}</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {puede && libres.length > 0 && (
          <TextField select size="small" label="Agregar lista" value="" onChange={(e) => setFilas([...filas, { listaId: Number(e.target.value), modoPrecio: "markup", markup: 0, precioFijo: 0, unidades: 1, codigoBarras: "", unidadesMinimas: 0 }])} sx={{ minWidth: 200 }}>
            {libres.map((l) => <MenuItem key={l.id} value={l.id}>{l.etiqueta}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Lista</TableCell><TableCell>Modo</TableCell>{veCostos && <TableCell>Markup %</TableCell>}<TableCell>Precio fijo (final)</TableCell>
            <TableCell>Unidades</TableCell><TableCell>Desde (u.)</TableCell><TableCell>Código formato</TableCell><TableCell align="right">Neto u.</TableCell><TableCell align="right">Final u.</TableCell><TableCell align="right">Final formato</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>
            {filas.map((f, i) => {
              const l = activas.find((x) => x.id === f.listaId);
              return (
                <TableRow key={f.listaId}>
                  <TableCell className="nowrap"><strong>{l?.etiqueta || `Lista ${f.listaId}`}</strong></TableCell>
                  <TableCell>
                    <TextField select size="small" value={f.modoPrecio || "markup"} onChange={(e) => upd(i, "modoPrecio", e.target.value)} disabled={!puede} sx={{ width: 120 }}>
                      <MenuItem value="markup">Markup</MenuItem><MenuItem value="precio">Precio fijo</MenuItem>
                    </TextField>
                  </TableCell>
                  {veCostos && <TableCell><TextField size="small" type="number" value={f.markup ?? 0} onChange={(e) => upd(i, "markup", e.target.value)} disabled={!puede || f.modoPrecio === "precio"} sx={{ width: 90 }} /></TableCell>}
                  <TableCell><TextField size="small" type="number" value={f.precioFijo ?? 0} onChange={(e) => upd(i, "precioFijo", e.target.value)} disabled={!puede || f.modoPrecio !== "precio"} sx={{ width: 120 }} /></TableCell>
                  <TableCell><TextField size="small" type="number" value={f.unidades ?? 1} onChange={(e) => upd(i, "unidades", e.target.value)} disabled={!puede} sx={{ width: 80 }} /></TableCell>
                  <TableCell><TextField size="small" type="number" value={f.unidadesMinimas ?? 0} onChange={(e) => upd(i, "unidadesMinimas", e.target.value)} disabled={!puede} sx={{ width: 80 }} /></TableCell>
                  <TableCell><TextField size="small" value={f.codigoBarras || ""} onChange={(e) => upd(i, "codigoBarras", e.target.value)} disabled={!puede || Number(f.unidades) <= 1} sx={{ width: 150 }} placeholder={Number(f.unidades) > 1 ? "EAN de la caja" : "—"} /></TableCell>
                  <TableCell align="right" className="nowrap">{f.precio != null ? money(f.precio) : "—"}</TableCell>
                  <TableCell align="right" className="nowrap"><strong>{f.precioFinalUnitario != null ? money(f.precioFinalUnitario) : "—"}</strong></TableCell>
                  <TableCell align="right" className="nowrap">{f.precioFinalFormato != null ? money(f.precioFinalFormato) : "—"}</TableCell>
                  <TableCell>{puede && <IconButton size="small" onClick={() => setFilas(filas.filter((_, j) => j !== i))}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton>}</TableCell>
                </TableRow>
              );
            })}
            {!filas.length && <TableRow><TableCell colSpan={11}><Typography variant="body2" color="text.secondary">Sin listas: <strong>no tiene precio</strong> y el POS lo bloquea.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Box>
      {puede && <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}><Button variant="primary" loading={guardando} onClick={() => onGuardar(filas.map((f) => ({ listaId: f.listaId, modoPrecio: f.modoPrecio, markup: Number(f.markup) || 0, precioFijo: Number(f.precioFijo) || 0, unidades: Number(f.unidades) || 1, unidadesMinimas: Number(f.unidadesMinimas) || 0, codigoBarras: f.codigoBarras || "" })))}>Guardar</Button></Box>}
    </Card>
  );
};

/* ------------------------------------------------------------- main */
const ProductoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { check, can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [estadoModal, setEstadoModal] = useState(null);

  const puedeEditar = check("compras.productos").allowed;
  const puedePrecios = can("precios", "ventas.listas");
  const veCostos = can("precios", "compras.productos", "compras.proveedores");

  const producto = useQuery({ queryKey: QK.producto(id), queryFn: () => productosApi.get(id) });
  const catalogos = useQuery({ queryKey: QK.catalogos, queryFn: productosApi.catalogos });
  const proveedores = useQuery({ queryKey: QK.proveedores, queryFn: () => productosApi.proveedores("mercaderia") });
  const listas = useQuery({ queryKey: QK.listas, queryFn: productosApi.listas });
  const stock = useQuery({ queryKey: QK.stock, queryFn: productosApi.stock });
  const sucursales = useQuery({ queryKey: QK.sucursales, queryFn: seguridadApi.sucursales });
  const evolucion = useQuery({ queryKey: QK.precios.evolucion({ productoId: Number(id) }), queryFn: () => productosApi.precios.evolucion({ productoId: id, limit: 50 }), enabled: veCostos });

  const p = producto.data;
  const { setLabel } = useEntityLabel();
  useEffect(() => { if (p?.nombre) setLabel(id, p.nombre); }, [id, p?.nombre, setLabel]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: QK.producto(id) });
    qc.invalidateQueries({ queryKey: QK.productos });
    qc.invalidateQueries({ queryKey: ["precios"] });
  };
  const useAccion = (fn, ok) => useMutation({
    mutationFn: fn,
    onSuccess: () => { showToast(ok, "success"); invalidar(); },
    onError: (err) => showToast(err?.message || "No se pudo guardar.", "error"),
  });
  const guardarFicha = useAccion((body) => productosApi.editar(id, body), "Ficha guardada.");
  const guardarFormatos = useAccion((items) => productosApi.setFormatosCompra(id, items), "Formatos de compra guardados. El precio se recalculó.");
  const guardarPresentaciones = useAccion((items) => productosApi.setPresentaciones(id, items), "Presentaciones guardadas.");
  const guardarListas = useAccion((items) => productosApi.setListas(id, items), "Formato de venta guardado.");
  const guardarListasPres = useAccion(({ presId, items }) => productosApi.setListasPresentacion(presId, items), "Formato de venta del paquete guardado.");
  const cambiarEstado = useAccion(({ estado, motivo }) => productosApi.cambiarEstado(id, estado, motivo), "Estado cambiado.");
  const borrar = useMutation({
    mutationFn: () => productosApi.borrar(id),
    onSuccess: () => { showToast("Producto eliminado.", "info"); qc.invalidateQueries({ queryKey: QK.productos }); navigate("/productos"); },
    onError: (err) => showToast(err?.message || "No se pudo eliminar.", "error"),
  });

  const stockDe = useMemo(() => (stock.data || []).filter((s) => s.productoId === Number(id)), [stock.data, id]);
  const nombreSuc = (sid) => (sucursales.data || []).find((s) => s.id === sid)?.nombre || `Sucursal ${sid}`;

  if (producto.isLoading) return <div className="route-loading" aria-busy="true" />;
  if (!p) return <Box className="page"><Typography>Producto inexistente.</Typography></Box>;

  const estadoMeta = ESTADOS_PRODUCTO[p.estado] || {};
  const unidad = p.tipo === "granel" ? "kg" : "u";

  return (
    <Box className="page fade-in">
      <EntityHeader
        eyebrow={`${p.tipo === "granel" ? "Granel" : "Entero"} · ${p.codigoPropio}${p.marca ? ` · ${p.marca}` : ""}`}
        title={p.nombre}
        subtitle={p.precioFinal != null ? `Mostrador ${money(p.precioFinal)} · costo neto ${veCostos ? money(p.costoNeto) : "—"} por ${unidad}` : "Sin precio: cargá un formato de compra y una lista."}
        badges={<StatusBadge tone={estadoMeta.tone} label={estadoMeta.label || p.estado} />}
        onBack={() => navigate("/productos")}
        actions={puedeEditar && (
          <>
            {p.estado !== "activo" && <Button size="small" variant="secondary" onClick={() => cambiarEstado.mutate({ estado: "activo" })}>Reactivar</Button>}
            {p.estado === "activo" && <Button size="small" variant="secondary" onClick={() => setEstadoModal({ estado: "discontinuado", motivo: "" })}>Discontinuar</Button>}
            {p.estado !== "archivado" && <Button size="small" variant="ghost" onClick={() => setEstadoModal({ estado: "archivado", motivo: "" })}>Archivar</Button>}
            <Button size="small" variant="danger" onClick={() => { if (window.confirm("¿Eliminar el producto? Sólo se puede si no tiene stock ni historia.")) borrar.mutate(); }}>Eliminar</Button>
          </>
        )}
      />
      {p.motivoBaja && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Motivo: {p.motivoBaja}</Typography>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Ficha" />
        <Tab label={`Formatos de compra (${p.formatosCompra?.length || 0})`} />
        {p.tipo === "granel" && <Tab label={`Presentaciones (${p.presentaciones?.length || 0})`} />}
        <Tab label="Formato de venta" />
        <Tab label="Stock e historial" />
      </Tabs>

      {tab === 0 && <Ficha p={p} catalogos={catalogos.data} puede={puedeEditar} onGuardar={guardarFicha.mutate} guardando={guardarFicha.isPending} />}
      {tab === 1 && <FormatosCompra p={p} proveedores={proveedores.data} puede={puedeEditar} veCostos={veCostos} onGuardar={guardarFormatos.mutate} guardando={guardarFormatos.isPending} />}
      {p.tipo === "granel" && tab === 2 && <Presentaciones p={p} puede={puedeEditar} onGuardar={guardarPresentaciones.mutate} guardando={guardarPresentaciones.isPending} />}
      {tab === (p.tipo === "granel" ? 3 : 2) && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <EditorListas
            titulo={p.tipo === "granel" ? "Formato de venta · granel suelto" : "Formato de venta"}
            subtitulo="Por lista: markup sobre el costo neto, o un precio fijo con IVA. «Unidades» arma la caja (×6, ×12); «Desde» habilita la lista a partir de esa cantidad."
            filasIniciales={p.listas} listasCatalogo={listas.data} puede={puedePrecios} veCostos={veCostos}
            onGuardar={guardarListas.mutate} guardando={guardarListas.isPending}
          />
          {(p.presentaciones || []).map((pr) => (
            <EditorListas
              key={pr.id}
              titulo={`Formato de venta · paquete de ${fmtTam(pr.tamKg)}`}
              subtitulo={`Hereda el costo del kilo × ${pr.tamKg}: ${veCostos ? money(pr.costoNeto) : "—"}.`}
              filasIniciales={pr.listas} listasCatalogo={listas.data} puede={puedePrecios} veCostos={veCostos}
              onGuardar={(items) => guardarListasPres.mutate({ presId: pr.id, items })} guardando={guardarListasPres.isPending}
            />
          ))}
        </Box>
      )}
      {tab === (p.tipo === "granel" ? 4 : 3) && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Card className="entity-card">
            <Typography className="card-title" sx={{ mb: 1 }}>Stock por sucursal</Typography>
            <DataTable
              columns={[
                { field: "sucursalId", headerName: "Sucursal", renderCell: (s) => nombreSuc(s.sucursalId) },
                { field: "presentacionId", headerName: "Forma", renderCell: (s) => (s.presentacionId ? `Paquete ${fmtTam((p.presentaciones || []).find((x) => x.id === s.presentacionId)?.tamKg || 0)}` : (p.tipo === "granel" ? "Granel suelto" : "Unidad")) },
                { field: "estado", headerName: "Estado", renderCell: (s) => <StatusBadge tone={s.estado === "disponible" ? "success" : "warning"} label={s.estado.replace("_", " ")} showDot={false} /> },
                { field: "cantidad", headerName: "Cantidad", align: "right", renderCell: (s) => <strong>{num(s.cantidad)} {s.presentacionId ? "paq." : unidad}</strong> },
              ]}
              data={stockDe.map((s, i) => ({ ...s, id: s.id ?? i }))}
              emptyMessage="Sin existencias en ninguna sucursal."
            />
          </Card>
          {veCostos && (
            <Card className="entity-card">
              <Typography className="card-title" sx={{ mb: 1 }}>Evolución del precio</Typography>
              <DataTable
                columns={[
                  { field: "fecha", headerName: "Fecha", renderCell: (e) => <span className="nowrap">{stamp(e.fecha)}</span> },
                  { field: "lista", headerName: "Lista" },
                  { field: "precioAnterior", headerName: "Antes", align: "right", renderCell: (e) => money(e.precioAnterior) },
                  { field: "precio", headerName: "Después", align: "right", renderCell: (e) => <strong>{money(e.precio)}</strong> },
                  { field: "variacion", headerName: "Var.", align: "right", renderCell: (e) => (e.variacion == null ? "—" : <span className={e.variacion >= 0 ? "pd-history__pct" : "pd-history__pct"}>{e.variacion > 0 ? "+" : ""}{num(e.variacion, 2)}%</span>) },
                  { field: "origen", headerName: "Origen", renderCell: (e) => <StatusBadge tone="info" label={e.origen} showDot={false} /> },
                  { field: "usuario", headerName: "Quién", renderCell: (e) => <span className="text-tertiary">{e.usuario || "—"}</span> },
                ]}
                data={evolucion.data || []}
                loading={evolucion.isLoading}
                emptyMessage="Todavía no hubo cambios de precio."
              />
            </Card>
          )}
        </Box>
      )}

      <Modal open={Boolean(estadoModal)} onClose={() => setEstadoModal(null)} title={estadoModal?.estado === "archivado" ? "Archivar producto" : "Discontinuar producto"}
        subtitle={ESTADOS_PRODUCTO[estadoModal?.estado]?.hint}
        actions={(
          <>
            <Button variant="ghost" onClick={() => setEstadoModal(null)}>Cancelar</Button>
            <Button variant="primary" loading={cambiarEstado.isPending} onClick={() => { cambiarEstado.mutate(estadoModal); setEstadoModal(null); }}>Confirmar</Button>
          </>
        )}>
        <TextField fullWidth size="small" label="Motivo" value={estadoModal?.motivo || ""} onChange={(e) => setEstadoModal({ ...estadoModal, motivo: e.target.value })} sx={{ mt: 1 }} />
      </Modal>
    </Box>
  );
};

export default ProductoDetalle;
