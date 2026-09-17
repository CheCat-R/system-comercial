/**
 * Editor de una condición: campo · operador · valor.
 *
 * **Los operadores y el control del valor salen del `type` de la condición**, no
 * de una lista fija: una condición de dinero no ofrece "contiene", y una de
 * enumerado no se escribe a mano — se elige de las opciones que declara el
 * módulo dueño (§4.1). Así no se puede construir una comparación imposible.
 */
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";

import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { getCondition, OPERATORS } from "../api/automationsApi";

/** Operadores que no llevan valor. */
const NO_VALUE = ["is_empty", "is_not_empty", "is_true", "is_false"];

const optionsOf = (condition) => {
  if (!condition?.options) return [];
  try { return condition.options(); } catch { return []; }
};

const ValueInput = ({ condition, op, value, onChange }) => {
  if (NO_VALUE.includes(op)) return null;

  if (op === "between") {
    const [a, b] = Array.isArray(value) ? value : ["", ""];
    return (
      <Box className="au-cond__range">
        <TextField
          size="small" type="number" label="Desde" value={a ?? ""}
          onChange={(e) => onChange([e.target.value === "" ? "" : Number(e.target.value), b])}
        />
        <TextField
          size="small" type="number" label="Hasta" value={b ?? ""}
          onChange={(e) => onChange([a, e.target.value === "" ? "" : Number(e.target.value)])}
        />
      </Box>
    );
  }

  const options = optionsOf(condition);

  if (options.length && ["in", "not_in"].includes(op)) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <TextField
        size="small" fullWidth select label="Valor" value={selected}
        slotProps={{
          select: {
            multiple: true,
            renderValue: (vals) => vals.map((v) => options.find((o) => o.value === v)?.label || v).join(", ") || "Ninguno",
          },
        }}
        onChange={(e) => onChange(typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)}
      >
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            <Checkbox size="small" checked={selected.includes(o.value)} />
            <ListItemText primary={o.label} />
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (options.length) {
    return (
      <TextField
        size="small" fullWidth select label="Valor" value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </TextField>
    );
  }

  if (["money", "number"].includes(condition?.type)) {
    return (
      <TextField
        size="small" fullWidth type="number"
        label={condition.type === "money" ? "Valor ($)" : "Valor"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    );
  }

  return (
    <TextField
      size="small" fullWidth label="Valor" value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

const ConditionEditor = ({ rule, onChange }) => {
  const condition = getCondition(rule.field);

  if (!condition) {
    return (
      <Box className="au-note">
        <span>La condición «{rule.field}» no existe en el catálogo. Quitala y elegí otra.</span>
      </Box>
    );
  }

  const ops = condition.ops || ["eq"];

  const setOp = (op) => {
    // Al cambiar de operador el valor viejo puede dejar de tener forma válida:
    // pasar de "es alguno de" (lista) a "es igual a" (uno solo) deja un array
    // donde se espera un escalar. Se limpia en vez de arrastrar basura.
    const wasMulti = ["in", "not_in", "between"].includes(rule.op);
    const isMulti = ["in", "not_in", "between"].includes(op);
    onChange({ ...rule, op, value: wasMulti === isMulti ? rule.value : (isMulti ? [] : "") });
  };

  return (
    <Box className="au-cond">
      <Box className="au-cond__head">
        <strong>{condition.label}</strong>
        <Tooltip title={`Sale de: ${condition.source}${condition.hint ? ` · ${condition.hint}` : ""}`}>
          <InfoOutlinedIcon sx={{ fontSize: 14, color: "var(--text-tertiary)" }} />
        </Tooltip>
      </Box>

      <TextField
        size="small" fullWidth select label="Comparación" value={rule.op}
        onChange={(e) => setOp(e.target.value)}
      >
        {ops.map((op) => (
          <MenuItem key={op} value={op}>{OPERATORS[op]?.label || op}</MenuItem>
        ))}
      </TextField>

      <ValueInput
        condition={condition} op={rule.op} value={rule.value}
        onChange={(value) => onChange({ ...rule, value })}
      />

      <span className="au-cond__source">{condition.source}</span>
    </Box>
  );
};

export default ConditionEditor;
