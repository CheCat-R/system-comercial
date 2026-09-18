/** Editor de renglones de un presupuesto: artículo del catálogo del POS, lista, neto y descuento. */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { money } from "../api/ventasApi";
import { r2 } from "../domain/pos";

/** Editor de renglones de un presupuesto, con el catálogo del POS para elegir artículo y lista. */
const EditorPresupuesto = ({ valor, onChange, catalogo, listas }) => {
  const agregar = (item) => {
    if (!item) return;
    const p = item.precios?.[0];
    onChange({ ...valor, items: [...valor.items, { productoId: item.productoId, presentacionId: item.presentacionId ?? null, nombre: item.nombre, detalle: item.detalle, cantidad: 1, precioLista: p?.precio ?? item.precio, descuento: 0, iva: item.iva, listaId: p?.listaId ?? null, lista: listas.find((l) => l.listaId === p?.listaId)?.etiqueta || "", _key: item.key }] });
  };
  const upd = (i, patch) => onChange({ ...valor, items: valor.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const total = valor.items.reduce((a, it) => { const neto = it.cantidad * it.precioLista * (1 - (it.descuento || 0) / 100); return a + neto * (1 + (it.iva || 0) / 100); }, 0);

  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Autocomplete size="small" options={catalogo} getOptionLabel={(i) => `${i.nombre} · ${i.detalle}${i.marca ? ` · ${i.marca}` : ""}`} value={null} onChange={(_, i) => agregar(i)} renderInput={(p) => <TextField {...p} label="Agregar artículo" placeholder="Buscar por nombre o marca" />} filterOptions={(opts, s) => { const q = s.inputValue.toLowerCase(); return q ? opts.filter((o) => `${o.nombre} ${o.marca} ${o.codigoBarras || ""}`.toLowerCase().includes(q)).slice(0, 12) : []; }} />
      {valor.items.map((it, i) => {
        const cat = catalogo.find((c) => c.key === it._key || (c.productoId === it.productoId && (c.presentacionId ?? null) === (it.presentacionId ?? null)));
        return (
          <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1.6fr 90px 1.2fr 110px 80px 110px auto", gap: 1, alignItems: "center" }}>
            <span><strong>{it.nombre}</strong> <small className="text-tertiary">{it.detalle}</small></span>
            <TextField size="small" type="number" label="Cant." value={it.cantidad} onChange={(e) => upd(i, { cantidad: Number(e.target.value) || 0 })} />
            <TextField select size="small" label="Lista" value={it.listaId ?? ""} onChange={(e) => { const p = (cat?.precios || []).find((x) => String(x.listaId) === e.target.value); upd(i, { listaId: p?.listaId ?? null, precioLista: p?.precio ?? it.precioLista, lista: listas.find((l) => l.listaId === p?.listaId)?.etiqueta || "" }); }}>
              {(cat?.precios || []).map((p) => <MenuItem key={p.listaId} value={String(p.listaId)}>{listas.find((l) => l.listaId === p.listaId)?.etiqueta} · {money(p.precioFinal)}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label="Neto" value={it.precioLista} onChange={(e) => upd(i, { precioLista: Number(e.target.value) || 0 })} />
            <TextField size="small" type="number" label="Desc %" value={it.descuento} onChange={(e) => upd(i, { descuento: Number(e.target.value) || 0 })} />
            <span className="text-tertiary" style={{ textAlign: "right" }}>{money(it.cantidad * it.precioLista * (1 - (it.descuento || 0) / 100) * (1 + (it.iva || 0) / 100))}</span>
            <IconButton size="small" onClick={() => onChange({ ...valor, items: valor.items.filter((_, j) => j !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Box>
        );
      })}
      <Typography variant="subtitle2" sx={{ textAlign: "right" }}>Total {money(r2(total))}</Typography>
    </Box>
  );
};


export default EditorPresupuesto;
