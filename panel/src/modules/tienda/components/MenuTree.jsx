/**
 * Árbol de un menú: dos niveles, reordenar con ↑ ↓, y el destino elegido de una
 * lista cerrada según el `linkType`. Nada de escribir rutas a mano salvo en
 * `url`, que es justamente el caso en que no hay entidad a la que apuntar.
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";

import Button from "../../../components/Button/Button";
import { MENU_LINK_TYPES, describeMenuTarget, newMenuItem } from "../api/tiendaApi";

const move = (list, index, delta) => {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
};

const TargetField = ({ item, refs, onChange }) => {
  if (item.linkType === "page") {
    return (
      <TextField select size="small" label="Página" value={item.ref || ""} onChange={(e) => onChange({ ref: e.target.value })} sx={{ minWidth: 190 }}>
        {refs.pages.map((p) => <MenuItem key={p.id} value={p.id}>{p.title}</MenuItem>)}
      </TextField>
    );
  }
  if (item.linkType === "collection") {
    return (
      <TextField select size="small" label="Colección" value={item.ref || ""} onChange={(e) => onChange({ ref: e.target.value })} sx={{ minWidth: 190 }}>
        {refs.collections.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
      </TextField>
    );
  }
  if (item.linkType === "url") {
    return (
      <TextField size="small" label="URL" value={item.ref || ""} placeholder="/blog" onChange={(e) => onChange({ ref: e.target.value })} sx={{ minWidth: 190 }} />
    );
  }
  return <Box sx={{ minWidth: 190 }} />;
};

const ItemRow = ({ item, index, siblings, refs, depth, onChange, onRemove, onMove, onAddChild }) => (
  <Box className={`st-menuitem st-menuitem--depth${depth}`}>
    <Box className="st-menuitem__row">
      {depth > 0 && <SubdirectoryArrowRightIcon className="st-menuitem__nest" />}

      <TextField
        size="small" label="Texto" value={item.label}
        onChange={(e) => onChange({ label: e.target.value })} sx={{ minWidth: 170 }}
      />

      <TextField
        select size="small" label="Enlaza a" value={item.linkType}
        onChange={(e) => onChange({ linkType: e.target.value, ref: "" })} sx={{ minWidth: 150 }}
      >
        {MENU_LINK_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>

      <TargetField item={item} refs={refs} onChange={onChange} />

      <span className="st-menuitem__target">{describeMenuTarget(item)}</span>

      <span className="st-menuitem__actions">
        {depth === 0 && (
          <IconButton size="small" onClick={onAddChild} aria-label="agregar subítem"><AddIcon sx={{ fontSize: 16 }} /></IconButton>
        )}
        <IconButton size="small" onClick={() => onMove(-1)} disabled={index === 0} aria-label="subir"><ArrowUpwardIcon sx={{ fontSize: 16 }} /></IconButton>
        <IconButton size="small" onClick={() => onMove(1)} disabled={index === siblings - 1} aria-label="bajar"><ArrowDownwardIcon sx={{ fontSize: 16 }} /></IconButton>
        <IconButton size="small" onClick={onRemove} aria-label="eliminar"><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
      </span>
    </Box>
  </Box>
);

const MenuTree = ({ items = [], refs, onChange }) => {
  const setItem = (i, patch) => onChange(items.map((it, x) => (x === i ? { ...it, ...patch } : it)));

  const setChild = (i, ci, patch) =>
    onChange(items.map((it, x) =>
      x === i ? { ...it, children: it.children.map((c, y) => (y === ci ? { ...c, ...patch } : c)) } : it
    ));

  return (
    <Box className="st-menutree">
      {items.length === 0 && (
        <Typography variant="body2" className="text-tertiary">Este menú no tiene ítems todavía.</Typography>
      )}

      {items.map((item, i) => (
        <Box key={item.id}>
          <ItemRow
            item={item} index={i} siblings={items.length} refs={refs} depth={0}
            onChange={(patch) => setItem(i, patch)}
            onMove={(d) => onChange(move(items, i, d))}
            onRemove={() => onChange(items.filter((_, x) => x !== i))}
            onAddChild={() => setItem(i, { children: [...item.children, newMenuItem("Subítem")] })}
          />

          {item.children.map((child, ci) => (
            <ItemRow
              key={child.id} item={child} index={ci} siblings={item.children.length} refs={refs} depth={1}
              onChange={(patch) => setChild(i, ci, patch)}
              onMove={(d) => setItem(i, { children: move(item.children, ci, d) })}
              onRemove={() => setItem(i, { children: item.children.filter((_, y) => y !== ci) })}
            />
          ))}
        </Box>
      ))}

      <Button variant="secondary" size="small" startIcon={<AddIcon />} onClick={() => onChange([...items, newMenuItem()])}>
        Agregar ítem
      </Button>
    </Box>
  );
};

export default MenuTree;
