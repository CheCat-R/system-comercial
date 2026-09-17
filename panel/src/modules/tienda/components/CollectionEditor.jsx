/**
 * Editor de colección: reglas o selección manual a la izquierda, **resultado en
 * vivo** a la derecha. Ver el resultado mientras se define es lo que evita
 * publicar una colección vacía. Ver docs/MODULO-TIENDA-CMS.md §9.5.
 */
import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import ProductCard from "./preview/ProductCard";

import { createCollection, updateCollection, getCatalogFacets, COLLECTION_SORTS } from "../api/tiendaApi";
import { listProducts } from "../../productos/api/catalogApi";
import { money, TODAY } from "../lib/time";

const emptyForm = {
  name: "", slug: "", description: "", mode: "manual",
  productIds: [], rules: { categoryIds: [], brandIds: [], newerThanDays: "", onSale: false, inStock: false },
  sort: "manual", limit: 12, status: "borrador",
};

const CollectionEditor = ({ collection, onClose, onSaved }) => {
  const [form, setForm] = useState(() =>
    collection
      ? {
        ...emptyForm, ...collection,
        rules: { ...emptyForm.rules, ...(collection.rules || {}) },
      }
      : emptyForm
  );
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setRule = (patch) => setForm((f) => ({ ...f, rules: { ...f.rules, ...patch } }));

  const facets = useMemo(() => getCatalogFacets(), []);
  const allProducts = useMemo(() => listProducts(), []);

  /**
   * Resultado en vivo. Para una colección nueva o con cambios sin guardar no hay
   * nada persistido que resolver, así que se aplica el mismo filtro localmente.
   */
  const preview = useMemo(() => {
    if (form.mode === "manual") {
      const byId = new Map(allProducts.map((p) => [p.id, p]));
      return form.productIds.map((id) => byId.get(id)).filter(Boolean);
    }
    const r = form.rules;
    let items = allProducts.filter((p) => p.status === "Activo" || p.status === "Agotado");
    if (r.categoryIds?.length) items = items.filter((p) => r.categoryIds.includes(p.categoryId));
    if (r.brandIds?.length) items = items.filter((p) => r.brandIds.includes(p.brandId));
    if (r.onSale) items = items.filter((p) => p.onSale);
    if (r.inStock) items = items.filter((p) => p.inStock);
    if (r.newerThanDays) {
      const cut = TODAY.getTime() - Number(r.newerThanDays) * 86400000;
      items = items.filter((p) => new Date(`${p.createdAt}T12:00:00`).getTime() >= cut);
    }
    const sorters = {
      bestsellers: (a, b) => b.soldUnits - a.soldUnits,
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      discount: (a, b) => b.discountPercent - a.discountPercent,
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating,
    };
    if (sorters[form.sort]) items = [...items].sort(sorters[form.sort]);
    return items.slice(0, Number(form.limit) || 12);
  }, [form, allProducts]);

  const outOfStock = preview.filter((p) => !p.inStock).length;

  const moveProduct = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= form.productIds.length) return;
    const next = [...form.productIds];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    set({ productIds: next });
  };

  const handleSave = () => {
    const payload = { ...form, limit: Number(form.limit) || 12 };
    if (form.mode === "rules" && payload.rules.newerThanDays === "") payload.rules.newerThanDays = null;
    const saved = collection ? updateCollection(collection.id, payload) : createCollection(payload);
    onSaved(saved);
  };

  const available = allProducts.filter((p) => !form.productIds.includes(p.id));

  return (
    <Modal
      open onClose={onClose} maxWidth="lg"
      title={collection ? `Editar «${collection.name}»` : "Nueva colección"}
      subtitle="Manual para curar a mano; por reglas para que se actualice sola con el catálogo."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={handleSave}>Guardar colección</Button>
        </>
      }
    >
      <Box className="st-coleditor">
        {/* --------------------------------------------------------- config */}
        <Box className="st-coleditor__form">
          <TextField
            size="small" fullWidth label="Nombre" value={form.name}
            disabled={collection?.system}
            onChange={(e) => set({ name: e.target.value })}
          />
          <TextField
            size="small" fullWidth label="Slug" value={form.slug}
            helperText="Dirección pública: /coleccion/…"
            disabled={collection?.system}
            onChange={(e) => set({ slug: e.target.value })}
          />
          <TextField
            size="small" fullWidth label="Descripción" value={form.description} multiline rows={2}
            onChange={(e) => set({ description: e.target.value })}
          />

          <Box>
            <Typography variant="caption" className="st-field__label">Cómo se arma</Typography>
            <ToggleButtonGroup
              size="small" exclusive fullWidth value={form.mode}
              onChange={(_, v) => v && set({ mode: v, sort: v === "manual" ? "manual" : "bestsellers" })}
            >
              <ToggleButton value="manual">Manual</ToggleButton>
              <ToggleButton value="rules">Por reglas</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {form.mode === "rules" ? (
            <>
              <TextField
                select size="small" fullWidth label="Categorías"
                slotProps={{ select: { multiple: true, renderValue: (v) => `${v.length || "Todas"}` } }}
                value={form.rules.categoryIds || []}
                onChange={(e) => setRule({ categoryIds: e.target.value })}
              >
                {facets.categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    <Checkbox size="small" checked={(form.rules.categoryIds || []).includes(c.id)} />
                    {c.name} <em className="st-coleditor__count">({c.productCount})</em>
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select size="small" fullWidth label="Marcas"
                slotProps={{ select: { multiple: true, renderValue: (v) => `${v.length || "Todas"}` } }}
                value={form.rules.brandIds || []}
                onChange={(e) => setRule({ brandIds: e.target.value })}
              >
                {facets.brands.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    <Checkbox size="small" checked={(form.rules.brandIds || []).includes(b.id)} />
                    {b.name} <em className="st-coleditor__count">({b.productCount})</em>
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                size="small" fullWidth type="number" label="Novedades: últimos N días"
                value={form.rules.newerThanDays ?? ""}
                onChange={(e) => setRule({ newerThanDays: e.target.value === "" ? "" : Number(e.target.value) })}
              />

              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(form.rules.onSale)} onChange={(e) => setRule({ onSale: e.target.checked })} />}
                label="Sólo productos en oferta"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={Boolean(form.rules.inStock)} onChange={(e) => setRule({ inStock: e.target.checked })} />}
                label="Sólo con stock"
              />
            </>
          ) : (
            <Box className="st-coleditor__manual">
              <Typography variant="caption" className="st-field__label">
                Productos ({form.productIds.length}) — el orden es el que se muestra
              </Typography>

              {form.productIds.map((pid, i) => {
                const product = allProducts.find((p) => p.id === pid);
                return (
                  <Box className="st-reflist__row" key={pid}>
                    <span className="st-reflist__name">{product?.name || `Producto ${pid}`}</span>
                    <IconButton size="small" onClick={() => moveProduct(i, -1)} disabled={i === 0} aria-label="subir"><ArrowUpwardIcon sx={{ fontSize: 15 }} /></IconButton>
                    <IconButton size="small" onClick={() => moveProduct(i, 1)} disabled={i === form.productIds.length - 1} aria-label="bajar"><ArrowDownwardIcon sx={{ fontSize: 15 }} /></IconButton>
                    <IconButton size="small" onClick={() => set({ productIds: form.productIds.filter((x) => x !== pid) })} aria-label="quitar"><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
                  </Box>
                );
              })}

              {available.length > 0 && (
                <TextField
                  select size="small" fullWidth value="" label="Agregar producto…"
                  onChange={(e) => e.target.value && set({ productIds: [...form.productIds, Number(e.target.value)] })}
                >
                  {available.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name} · {money(p.price)}</MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          )}

          <TextField
            select size="small" fullWidth label="Orden" value={form.sort}
            onChange={(e) => set({ sort: e.target.value })}
          >
            {COLLECTION_SORTS.filter((s) => form.mode === "manual" || s.value !== "manual").map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              size="small" fullWidth type="number" label="Máximo de productos" value={form.limit}
              onChange={(e) => set({ limit: e.target.value })}
            />
            <TextField
              select size="small" fullWidth label="Estado" value={form.status}
              onChange={(e) => set({ status: e.target.value })}
            >
              <MenuItem value="activa">Activa</MenuItem>
              <MenuItem value="borrador">Borrador</MenuItem>
            </TextField>
          </Box>
        </Box>

        {/* -------------------------------------------------- resultado vivo */}
        <Box className="st-coleditor__preview">
          <Box className="st-coleditor__previewhead">
            <Typography className="st-coleditor__previewtitle">Resultado en vivo</Typography>
            <span className="st-coleditor__stats">
              <strong>{preview.length}</strong> productos
              {outOfStock > 0 && <> · <StatusBadge tone="warning" label={`${outOfStock} sin stock`} showDot={false} /></>}
            </span>
          </Box>

          {preview.length === 0 ? (
            <Box className="st-placeholder">
              Con esta configuración la colección queda vacía. Los bloques que la usen no van a mostrar nada.
            </Box>
          ) : (
            <Box className="st-grid" style={{ "--st-cols": 3 }}>
              {preview.map((p) => (
                <ProductCard key={p.id} product={p} cardStyle="minimal" showPrice showBadge />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  );
};

export default CollectionEditor;
