/**
 * OFERTAS — la definición de las promociones. La aplicación en vivo la hace
 * el POS y el servidor la acota. Cada mecánica muestra sus campos, el
 * alcance se elige por producto/paquete/marca/categoría/etiqueta, y la
 * vigencia por fechas, días de la semana, sucursales y listas.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { ventasApi, MEDIOS_PAGO, TIPOS_OFERTA, fecha } from "./api/ventasApi";
import { describirOferta, estadoOferta } from "./domain/ofertas";
import { productosApi } from "../productos/api/productosApi";
import { QK } from "../../app/api/queryClient";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const TONO = { vigente: "success", programada: "info", vencida: "warning", inactiva: "neutral" };
const VACIA = { nombre: "", tipo: "porcentaje", porcentaje: "", precio: "", lleva: "", paga: "", montoMinimo: "", desde: "", hasta: "", dias: "", sucursales: [], mediosPago: [], listas: [], incluyeFraccionados: false, activa: true, alcances: [], componentes: [] };

const Ofertas = () => {
  const { showToast } = useToast();
  const { check } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const puede = check("ventas.ofertas");

  const lista = useQuery({ queryKey: ["ofertas"], queryFn: ventasApi.ofertas.listar });
  const boot = useQuery({ queryKey: ["ventas", "bootstrap"], queryFn: ventasApi.bootstrap, staleTime: 60_000 });
  const catalogos = useQuery({ queryKey: QK.catalogos, queryFn: productosApi.catalogos, staleTime: 60_000 });
  const productos = useQuery({ queryKey: QK.productos, queryFn: productosApi.listar, staleTime: 60_000 });

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["ofertas"] }); qc.invalidateQueries({ queryKey: ["pos"] }); };
  const err = (e) => showToast(e?.message || "No se pudo.", "error");
  const mGuardar = useMutation({ mutationFn: (b) => (b.id ? ventasApi.ofertas.editar(b.id, b) : ventasApi.ofertas.crear(b)), onSuccess: () => { showToast("Oferta guardada.", "success"); setForm(null); invalidar(); }, onError: err });
  const mBorrar = useMutation({ mutationFn: (id) => ventasApi.ofertas.borrar(id), onSuccess: (r) => { showToast(r.desactivada ? "Ya se usó en ventas: quedó desactivada." : "Oferta borrada.", "success"); setForm(null); invalidar(); }, onError: err });

  // Opciones del alcance: producto, paquete (presentación), marca, categoría, etiqueta.
  const opcionesAlcance = useMemo(() => {
    const out = [];
    for (const p of productos.data || []) {
      out.push({ tipo: "producto", refId: p.id, label: `${p.nombre}`, grupo: "Productos" });
      for (const pr of p.presentaciones || []) out.push({ tipo: "presentacion", refId: pr.id, label: `${p.nombre} · ${pr.tamKg < 1 ? `${Math.round(pr.tamKg * 1000)} g` : `${pr.tamKg} kg`}`, grupo: "Paquetes" });
    }
    for (const m of catalogos.data?.marcas || []) out.push({ tipo: "marca", refId: m.id, label: m.nombre, grupo: "Marcas" });
    for (const c of catalogos.data?.categorias || []) out.push({ tipo: "categoria", refId: c.id, label: c.nombre, grupo: "Categorías" });
    for (const e of catalogos.data?.etiquetas || []) out.push({ tipo: "etiqueta", refId: e.id, label: e.nombre, grupo: "Etiquetas" });
    return out;
  }, [productos.data, catalogos.data]);
  const etiquetaAlcance = (a) => opcionesAlcance.find((o) => o.tipo === a.tipo && o.refId === a.refId)?.label || `${a.tipo} #${a.refId}`;
  const listasCat = boot.data?.listasCatalogo?.listas || [];
  const sucursales = boot.data?.sucursales || [];

  const abrir = (o) => setForm(o ? {
    ...VACIA, ...o, porcentaje: o.porcentaje || "", precio: o.precio || "", lleva: o.lleva || "", paga: o.paga || "", montoMinimo: o.montoMinimo || "",
    desde: o.desde ? o.desde.slice(0, 10) : "", hasta: o.hasta ? o.hasta.slice(0, 10) : "",
    sucursales: String(o.sucursales || "").split(",").filter(Boolean).map(Number), mediosPago: String(o.mediosPago || "").split(",").filter(Boolean), listas: String(o.listas || "").split(",").filter(Boolean).map(Number),
  } : { ...VACIA });
  const guardar = () => mGuardar.mutate({
    ...form, porcentaje: Number(form.porcentaje) || 0, precio: Number(form.precio) || 0, lleva: Number(form.lleva) || 0, paga: Number(form.paga) || 0, montoMinimo: Number(form.montoMinimo) || 0,
    desde: form.desde || undefined, hasta: form.hasta ? `${form.hasta}T23:59:59` : undefined,
    sucursales: form.sucursales.join(","), mediosPago: form.mediosPago.join(","), listas: form.listas.join(","),
  });
  const tipo = TIPOS_OFERTA[form?.tipo] || TIPOS_OFERTA.porcentaje;

  const columns = [
    { field: "nombre", headerName: "Oferta", renderCell: (o) => <Box><strong>{o.nombre}</strong><Typography variant="caption" display="block" color="text.secondary">{describirOferta(o)}</Typography></Box> },
    { field: "tipo", headerName: "Mecánica", renderCell: (o) => TIPOS_OFERTA[o.tipo]?.label || o.tipo },
    { field: "alcances", headerName: "Alcance", sortable: false, renderCell: (o) => <span className="text-tertiary">{o.tipo === "combo" ? `${o.componentes.length} productos` : o.alcances.slice(0, 3).map(etiquetaAlcance).join(", ") + (o.alcances.length > 3 ? ` +${o.alcances.length - 3}` : "") || "ticket entero"}</span> },
    { field: "desde", headerName: "Vigencia", renderCell: (o) => <span className="text-tertiary">{o.desde || o.hasta ? `${o.desde ? fecha(o.desde) : "…"} → ${o.hasta ? fecha(o.hasta) : "…"}` : "sin límite"}{o.dias ? ` · ${DIAS.filter((_, i) => o.dias[i] === "1").join("")}` : ""}</span> },
    { field: "activa", headerName: "Estado", renderCell: (o) => { const e = estadoOferta(o); return <StatusBadge tone={TONO[e.id]} label={e.label} />; } },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader title="Ofertas" subtitle="Una sola oferta por renglón: la de mayor beneficio. Las que se miden en cantidades se aplican solas; la de ticket se sugiere en la caja." actions={<Tooltip title={puede.allowed ? "" : puede.reason}><span><Button variant="primary" startIcon={<AddIcon />} disabled={!puede.allowed} onClick={() => abrir(null)}>Nueva oferta</Button></span></Tooltip>} />
      <DataTable columns={columns} data={lista.data || []} loading={lista.isLoading} emptyMessage="Todavía no hay ofertas." onRowClick={(o) => puede.allowed && abrir(o)} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "Editar oferta" : "Nueva oferta"} subtitle={tipo.ayuda} maxWidth="md"
        actions={(<>
          {form?.id && <Button variant="danger" onClick={() => { if (window.confirm("¿Borrar la oferta? Si ya se usó, se desactiva.")) mBorrar.mutate(form.id); }}>Borrar</Button>}
          <Box sx={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="primary" loading={mGuardar.isPending} onClick={guardar}>Guardar</Button>
        </>)}>
        {form && (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1.4fr", gap: 2 }}>
              <TextField size="small" label="Nombre (el del cartel)" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
              <TextField select size="small" label="Mecánica" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{Object.entries(TIPOS_OFERTA).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}</TextField>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 2 }}>
              {tipo.campos.includes("porcentaje") && <TextField size="small" type="number" label="Porcentaje %" value={form.porcentaje} onChange={(e) => setForm({ ...form, porcentaje: e.target.value })} />}
              {tipo.campos.includes("precio") && <TextField size="small" type="number" label="Precio FINAL con IVA $" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />}
              {tipo.campos.includes("lleva") && <TextField size="small" type="number" label="Llevá N" value={form.lleva} onChange={(e) => setForm({ ...form, lleva: e.target.value })} />}
              {tipo.campos.includes("paga") && <TextField size="small" type="number" label="Pagá M" value={form.paga} onChange={(e) => setForm({ ...form, paga: e.target.value })} />}
              {tipo.campos.includes("montoMinimo") && <TextField size="small" type="number" label="Desde $ (total del ticket)" value={form.montoMinimo} onChange={(e) => setForm({ ...form, montoMinimo: e.target.value })} />}
            </Box>

            {tipo.alcance && (
              <Autocomplete multiple size="small" options={opcionesAlcance} groupBy={(o) => o.grupo} getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.tipo === b.tipo && a.refId === b.refId}
                value={form.alcances.map((a) => opcionesAlcance.find((o) => o.tipo === a.tipo && o.refId === a.refId) || { ...a, label: etiquetaAlcance(a), grupo: "" })}
                onChange={(_, v) => setForm({ ...form, alcances: v.map((o) => ({ tipo: o.tipo, refId: o.refId })) })}
                filterOptions={(opts, s) => { const q = s.inputValue.toLowerCase(); return q ? opts.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30) : opts.slice(0, 30); }}
                renderInput={(p) => <TextField {...p} label="Alcanza a" placeholder="productos, paquetes, marcas, categorías, etiquetas" />} />
            )}
            {form.tipo === "combo" && (
              <Box sx={{ display: "grid", gap: 1 }}>
                <Autocomplete size="small" options={(productos.data || []).filter((p) => !form.componentes.some((c) => c.productoId === p.id))} getOptionLabel={(p) => p.nombre} value={null} onChange={(_, p) => p && setForm({ ...form, componentes: [...form.componentes, { productoId: p.id, cantidad: 1 }] })} renderInput={(p) => <TextField {...p} label="Agregar producto al combo" />} />
                {form.componentes.map((c, i) => (
                  <Box key={c.productoId} sx={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 1, alignItems: "center" }}>
                    <span>{(productos.data || []).find((p) => p.id === c.productoId)?.nombre || `#${c.productoId}`}</span>
                    <TextField size="small" type="number" label="Cant." value={c.cantidad} onChange={(e) => setForm({ ...form, componentes: form.componentes.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) || 0 } : x)) })} />
                    <Button size="small" variant="ghost" onClick={() => setForm({ ...form, componentes: form.componentes.filter((_, j) => j !== i) })}>Quitar</Button>
                  </Box>
                ))}
              </Box>
            )}
            {tipo.alcance && <FormControlLabel control={<Switch checked={form.incluyeFraccionados} onChange={(e) => setForm({ ...form, incluyeFraccionados: e.target.checked })} />} label="Los alcances por producto/marca/categoría/etiqueta incluyen también los paquetes fraccionados" />}

            <Typography variant="subtitle2">Vigencia</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 2, alignItems: "center" }}>
              <TextField size="small" type="date" label="Desde" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="Hasta" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <ToggleButtonGroup size="small" value={DIAS.filter((_, i) => (form.dias || "1111111")[i] === "1")} onChange={(_, v) => setForm({ ...form, dias: v.length === 7 || v.length === 0 ? "" : DIAS.map((d) => (v.includes(d) ? "1" : "0")).join("") })}>
                {DIAS.map((d) => <ToggleButton key={d} value={d}>{d}</ToggleButton>)}
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <Autocomplete multiple size="small" options={sucursales} getOptionLabel={(s) => s.nombre} value={sucursales.filter((s) => form.sucursales.includes(s.id))} onChange={(_, v) => setForm({ ...form, sucursales: v.map((s) => s.id) })} renderInput={(p) => <TextField {...p} label="Sucursales (vacío = todas)" />} />
              <Autocomplete multiple size="small" options={listasCat} getOptionLabel={(l) => l.etiqueta} value={listasCat.filter((l) => form.listas.includes(l.id))} onChange={(_, v) => setForm({ ...form, listas: v.map((l) => l.id) })} renderInput={(p) => <TextField {...p} label="Corre sobre las listas (vacío = todas)" />} />
            </Box>
            {form.tipo === "ticket" && (
              <Box>
                <Typography variant="caption" color="text.secondary">Solo vale pagando con (vacío = cualquiera)</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>{Object.entries(MEDIOS_PAGO).map(([k, v]) => <Chip key={k} size="small" label={v} color={form.mediosPago.includes(k) ? "primary" : "default"} variant={form.mediosPago.includes(k) ? "filled" : "outlined"} onClick={() => setForm({ ...form, mediosPago: form.mediosPago.includes(k) ? form.mediosPago.filter((x) => x !== k) : [...form.mediosPago, k] })} />)}</Box>
              </Box>
            )}
            <FormControlLabel control={<Switch checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />} label="Activa" />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Ofertas;
