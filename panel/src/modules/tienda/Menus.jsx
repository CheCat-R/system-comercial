/**
 * Menús — la navegación del header y del footer.
 *
 * No son bloques: son del sitio, no de una página. Ver docs/MODULO-TIENDA-CMS.md §3.8.
 */
import { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import MenuTree from "./components/MenuTree";
import { listMenus, getMenu, saveMenuItems, getReferenceOptions, describeMenuTarget } from "./api/tiendaApi";
import "./Tienda.css";

const LOCATION_LABEL = { header: "Encabezado", footer: "Pie de página", mobile: "Mobile" };

/** Cómo se vería la navegación en el sitio. */
const MenuPreview = ({ menu }) => (
  <Box className={`st-menupreview st-menupreview--${menu.location}`}>
    {menu.items.map((item) => (
      <div className="st-menupreview__group" key={item.id}>
        <span className="st-menupreview__label">
          {item.label}
          {item.badge && <em className="st-menupreview__badge">{item.badge}</em>}
        </span>
        {item.children.length > 0 && (
          <div className="st-menupreview__children">
            {item.children.map((c) => <span key={c.id}>{c.label}</span>)}
          </div>
        )}
      </div>
    ))}
  </Box>
);

const Menus = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const menus = useMemo(() => listMenus(), [version]);
  const refs = useMemo(() => getReferenceOptions(), []);

  const current = menus[tab];
  const [draft, setDraft] = useState(() => getMenu(listMenus()[0].id).items);
  const [editingId, setEditingId] = useState(() => listMenus()[0].id);

  // Al cambiar de pestaña se carga el menú de esa pestaña en el borrador local.
  const selectTab = (index) => {
    const menu = menus[index];
    setTab(index);
    setEditingId(menu.id);
    setDraft(getMenu(menu.id).items);
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(getMenu(editingId)?.items || []);

  const handleSave = () => {
    saveMenuItems(editingId, draft);
    refresh();
    showToast("Menú guardado", "success");
  };

  const broken = useMemo(() => {
    const out = [];
    const walk = (items) => items.forEach((it) => {
      if (describeMenuTarget(it).startsWith("⚠")) out.push(it.label);
      walk(it.children || []);
    });
    walk(draft);
    return out;
  }, [draft]);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Menús"
        subtitle="La navegación del sitio. Un ítem enlaza a una página, a una colección o a una URL."
        actions={
          <>
            <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(getMenu(editingId).items)}>
              Descartar
            </Button>
            <Button variant="primary" disabled={!dirty} onClick={handleSave}>Guardar menú</Button>
          </>
        }
      />

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => selectTab(v)}>
          {menus.map((m) => <Tab key={m.id} label={`${LOCATION_LABEL[m.location] || m.location} (${m.itemCount})`} />)}
        </Tabs>
        {dirty && <StatusBadge tone="warning" label="Sin guardar" />}
      </Box>

      {broken.length > 0 && (
        <Box className="st-issue st-issue--warning">
          <StatusBadge tone="warning" label="Aviso" />
          <span>Estos ítems apuntan a algo que ya no existe: {broken.join(", ")}.</span>
        </Box>
      )}

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">{current?.name}</Typography>
        <MenuTree items={draft} refs={refs} onChange={setDraft} />
      </Card>

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Cómo se vería</Typography>
        <MenuPreview menu={{ ...current, items: draft }} />
      </Card>
    </Box>
  );
};

export default Menus;
