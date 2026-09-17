/**
 * Filtros como chips: se aplican antes de calcular y **cada uno deja rastro
 * visible** (§5). Un filtro escondido es la forma más común de mirar un número
 * que no es el que uno cree.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";

import { FILTER_LABELS } from "../api/analyticsApi";

const LIST_FILTERS = ["categoryId", "brandId", "skuId", "zone", "warehouseId", "channel", "accountType", "paymentMethod"];

const FilterBar = ({ filters = {}, options = {}, onChange }) => {
  const [anchor, setAnchor] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);

  const labelFor = (key, value) =>
    options[key]?.find((o) => o.value === value)?.label || value;

  const active = Object.entries(filters).filter(([, v]) => v != null && (!Array.isArray(v) || v.length));

  const setFilter = (key, value) => {
    const next = { ...filters };
    if (value == null || (Array.isArray(value) && !value.length)) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  const toggleValue = (key, value) => {
    const current = filters[key] || [];
    setFilter(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  return (
    <Box className="an-filters">
      <span className="an-filters__label">Filtros</span>

      {active.length === 0 && <span className="an-filters__empty">Sin filtros: se calcula sobre todo el período.</span>}

      {active.map(([key, value]) => (
        <span className="an-chip an-chip--filter" key={key}>
          <strong>{FILTER_LABELS[key] || key}:</strong>
          {Array.isArray(value)
            ? value.map((v) => labelFor(key, v)).join(", ")
            : key === "discount"
              ? labelFor(key, value)
              : value}
          <button type="button" onClick={() => setFilter(key, null)} aria-label={`Quitar filtro ${FILTER_LABELS[key]}`}>
            <CloseIcon sx={{ fontSize: 12 }} />
          </button>
        </span>
      ))}

      <button type="button" className="an-filters__add" onClick={(e) => setAnchor(e.currentTarget)}>
        <AddIcon sx={{ fontSize: 14 }} /> Agregar
      </button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => { setAnchor(null); setOpenFilter(null); }}>
        {!openFilter && [
          ...LIST_FILTERS.filter((k) => options[k]?.length).map((k) => (
            <MenuItem key={k} onClick={() => setOpenFilter(k)}>{FILTER_LABELS[k]}</MenuItem>
          )),
          <MenuItem key="discount" onClick={() => setOpenFilter("discount")}>{FILTER_LABELS.discount}</MenuItem>,
          <Divider key="div" />,
          <MenuItem key="ticket" onClick={() => setOpenFilter("ticket")}>Rango de ticket</MenuItem>,
        ]}

        {openFilter && openFilter !== "ticket" && openFilter !== "discount" &&
          options[openFilter]?.map((o) => (
            <MenuItem key={o.value} onClick={() => toggleValue(openFilter, o.value)}>
              <Checkbox size="small" checked={(filters[openFilter] || []).includes(o.value)} />
              {o.label}
            </MenuItem>
          ))}

        {openFilter === "discount" && options.discount?.map((o) => (
          <MenuItem
            key={o.value}
            selected={filters.discount === o.value}
            onClick={() => { setFilter("discount", filters.discount === o.value ? null : o.value); setAnchor(null); setOpenFilter(null); }}
          >
            {o.label}
          </MenuItem>
        ))}

        {openFilter === "ticket" && (
          <Box sx={{ px: 2, py: 1, display: "flex", gap: 1.5, minWidth: 260 }}>
            <TextField
              size="small" type="number" label="Mínimo" value={filters.minTicket ?? ""}
              onChange={(e) => setFilter("minTicket", e.target.value === "" ? null : Number(e.target.value))}
            />
            <TextField
              size="small" type="number" label="Máximo" value={filters.maxTicket ?? ""}
              onChange={(e) => setFilter("maxTicket", e.target.value === "" ? null : Number(e.target.value))}
            />
          </Box>
        )}
      </Menu>

      {active.length > 0 && (
        <button type="button" className="an-filters__clear" onClick={() => onChange({})}>
          Limpiar todo
        </button>
      )}
    </Box>
  );
};

export default FilterBar;
