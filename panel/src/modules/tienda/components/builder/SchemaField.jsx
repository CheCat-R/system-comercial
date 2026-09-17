/**
 * Un campo del inspector, despachado por `control`.
 *
 * Acá está la clave de que el editor no tenga un formulario por bloque: el
 * schema declara `control` y este componente decide con qué se edita. Agregar un
 * bloque nuevo no toca este archivo salvo que necesite un control que no existe.
 *
 * Ver docs/MODULO-TIENDA-CMS.md §3.7.
 */
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import Button from "../../../../components/Button/Button";
import { CONTENT_ICONS } from "../../lib/blockSchemas";
import { createRepeaterItem } from "../../lib/blocks";

const Label = ({ children, hint }) => (
  <Box sx={{ mb: 0.5 }}>
    <Typography variant="caption" className="st-field__label">{children}</Typography>
    {hint && <Typography variant="caption" className="st-field__hint">{hint}</Typography>}
  </Box>
);

/** Lista ordenable de referencias (usada por `banner-list`). */
const RefList = ({ field, value = [], options, onChange }) => {
  // Los medios pueden repetirse en una galería; los banners de un hero no.
  const available = field.control === "media-list" ? options : options.filter((o) => !value.includes(o.id));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <Box className="st-reflist">
      {value.map((id, i) => {
        const option = options.find((o) => o.id === id);
        return (
          <Box className="st-reflist__row" key={`${id}-${i}`}>
            <span className="st-reflist__name">
              {option?.name || <em>Referencia rota ({id})</em>}
              {option?.state && option.state !== "activo" && <em className="st-reflist__state"> · {option.state}</em>}
            </span>
            <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="subir"><ArrowUpwardIcon sx={{ fontSize: 15 }} /></IconButton>
            <IconButton size="small" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="bajar"><ArrowDownwardIcon sx={{ fontSize: 15 }} /></IconButton>
            <IconButton size="small" onClick={() => onChange(value.filter((_, x) => x !== i))} aria-label="quitar"><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
          </Box>
        );
      })}

      {available.length > 0 && (!field.max || value.length < field.max) && (
        <TextField
          select size="small" fullWidth value="" label="Agregar…"
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          {available.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {o.name}{o.state && o.state !== "activo" ? ` · ${o.state}` : ""}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
};

/** Selección múltiple sin orden (categorías, marcas, categorías de blog). */
const MultiSelect = ({ field, value = [], options, countKey, onChange }) => (
  <TextField
    select size="small" fullWidth label={field.label}
    value={value}
    helperText={field.hint}
    slotProps={{ select: { multiple: true, renderValue: (v) => (v.length ? `${v.length} elegidas` : "Todas") } }}
    onChange={(e) => onChange(e.target.value)}
  >
    {options.map((o) => (
      <MenuItem key={o.id} value={o.id}>
        <Checkbox size="small" checked={value.includes(o.id)} />
        {o.name}
        {countKey && <em className="st-field__count">({o[countKey] ?? 0})</em>}
      </MenuItem>
    ))}
  </TextField>
);

/** Lista de sub-objetos con sus propios campos. */
const Repeater = ({ field, value = [], refs, onChange }) => {
  const items = value || [];

  const setItem = (index, patch) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <Box className="st-repeater">
      {items.map((item, i) => (
        <Box className="st-repeater__item" key={item._id || i}>
          <Box className="st-repeater__head">
            <span className="st-repeater__title">
              {field.itemLabel ? field.itemLabel(item, refs) : `Ítem ${i + 1}`}
            </span>
            <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="subir"><ArrowUpwardIcon sx={{ fontSize: 15 }} /></IconButton>
            <IconButton size="small" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="bajar"><ArrowDownwardIcon sx={{ fontSize: 15 }} /></IconButton>
            <IconButton
              size="small" aria-label="eliminar"
              disabled={field.min ? items.length <= field.min : false}
              onClick={() => onChange(items.filter((_, x) => x !== i))}
            >
              <DeleteOutlineIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>

          <Box className="st-repeater__fields">
            {(field.fields || []).map((sub) => (
              <SchemaField
                key={sub.key} field={sub} refs={refs}
                value={item[sub.key]}
                onChange={(v) => setItem(i, { [sub.key]: v })}
              />
            ))}
          </Box>
        </Box>
      ))}

      {(!field.max || items.length < field.max) && (
        <Button variant="secondary" size="small" startIcon={<AddIcon />} onClick={() => onChange([...items, createRepeaterItem(field)])}>
          Agregar
        </Button>
      )}
    </Box>
  );
};

const SchemaField = ({ field, value, onChange, refs = {} }) => {
  const common = { size: "small", fullWidth: true };

  switch (field.control) {
    case "text":
      return (
        <TextField
          {...common} label={field.label} value={value ?? ""} placeholder={field.placeholder}
          helperText={field.hint} slotProps={{ htmlInput: { maxLength: field.maxLength } }}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "textarea":
    case "richtext":
      return (
        <TextField
          {...common} label={field.label} value={value ?? ""} multiline rows={field.rows || 4}
          helperText={field.control === "richtext" ? "Se admite **negrita**, *cursiva* y saltos de párrafo." : field.hint}
          slotProps={{ htmlInput: { maxLength: field.maxLength } }}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <TextField
          {...common} type="number" label={field.label} value={value ?? ""}
          slotProps={{ htmlInput: { min: field.min, max: field.max, step: field.step } }}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "switch":
      return (
        <FormControlLabel
          control={<Switch size="small" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />}
          label={field.label}
          className="st-field__switch"
        />
      );

    case "select":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      );

    case "segmented":
      return (
        <Box>
          <Label>{field.label}</Label>
          <ToggleButtonGroup
            size="small" exclusive value={value ?? null} fullWidth
            onChange={(_, v) => v !== null && onChange(v)}
          >
            {(field.options || []).map((o) => {
              const opt = typeof o === "object" ? o : { value: o, label: String(o) };
              return <ToggleButton key={opt.value} value={opt.value}>{opt.label}</ToggleButton>;
            })}
          </ToggleButtonGroup>
        </Box>
      );

    case "link":
      return (
        <TextField
          {...common} label={field.label} value={value ?? ""} placeholder="/coleccion/destacados"
          helperText={field.hint || "Ruta interna o URL completa."}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "icon":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {CONTENT_ICONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      );

    case "media":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Sin imagen</em></MenuItem>
          {(refs.media || []).map((m) => (
            <MenuItem key={m.id} value={m.id}>
              <span className="st-swatch" style={{ background: m.color }} />
              {m.name}
            </MenuItem>
          ))}
        </TextField>
      );

    case "collection":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Sin colección</em></MenuItem>
          {(refs.collections || []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}{c.system ? " ·" : ""}</MenuItem>
          ))}
        </TextField>
      );

    case "banner":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Sin banner</em></MenuItem>
          {(refs.banners || []).map((b) => (
            <MenuItem key={b.id} value={b.id}>{b.name}{b.state !== "activo" ? ` · ${b.state}` : ""}</MenuItem>
          ))}
        </TextField>
      );

    case "banner-list":
      return (
        <Box>
          <Label hint={field.hint}>{field.label}</Label>
          <RefList field={field} value={value || []} options={refs.banners || []} onChange={onChange} />
        </Box>
      );

    case "media-list":
      return (
        <Box>
          <Label hint={field.hint}>{field.label}</Label>
          <RefList field={field} value={value || []} options={refs.media || []} onChange={onChange} />
        </Box>
      );

    case "product":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Sin producto</em></MenuItem>
          {(refs.products || []).map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
          ))}
        </TextField>
      );

    case "author":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Sin autor</em></MenuItem>
          {(refs.authors || []).map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.name} · {a.role}</MenuItem>
          ))}
        </TextField>
      );

    case "category-list":
      return <MultiSelect field={field} value={value || []} options={refs.categories || []} countKey="productCount" onChange={onChange} />;

    case "brand-list":
      return <MultiSelect field={field} value={value || []} options={refs.brands || []} countKey="productCount" onChange={onChange} />;

    case "post-category-list":
      return <MultiSelect field={field} value={value || []} options={refs.postCategories || []} countKey="postCount" onChange={onChange} />;

    case "branch-list":
      return <MultiSelect field={field} value={value || []} options={refs.branches || []} onChange={onChange} />;

    case "promotion":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Ninguna</em></MenuItem>
          {(refs.promotions || []).map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
          ))}
        </TextField>
      );

    case "audience":
      return (
        <TextField {...common} select label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <MenuItem value=""><em>Ninguna</em></MenuItem>
          {(refs.audiences || []).map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
          ))}
        </TextField>
      );

    case "repeater":
      return (
        <Box>
          <Label hint={field.hint}>{field.label}</Label>
          <Repeater field={field} value={value} refs={refs} onChange={onChange} />
        </Box>
      );

    default:
      return (
        <TextField {...common} label={field.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
  }
};

export default SchemaField;
