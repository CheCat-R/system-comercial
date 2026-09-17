/**
 * Banners — biblioteca de creatividades, en galería.
 *
 * Una tabla no sirve acá: lo que hay que ver de un banner es la creatividad y su
 * vigencia. Ver docs/MODULO-TIENDA-CMS.md §9.6.
 */
import { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import BannerModal from "./components/BannerModal";
import BannerTimeline from "./components/BannerTimeline";
import MediaBox from "./components/preview/MediaBox";
import { listBanners, updateBanner, deleteBanner, simulateBannerTraffic } from "./api/tiendaApi";
import { formatDate } from "./lib/time";
import "./Tienda.css";

const TABS = [
  { label: "Todos", state: null },
  { label: "Activos", state: "activo" },
  { label: "Programados", state: "programado" },
  { label: "Vencidos", state: "vencido" },
  { label: "Borradores", state: "borrador" },
];

const STATE_META = {
  activo: { label: "Al aire", tone: "success" },
  programado: { label: "Programado", tone: "info" },
  vencido: { label: "Vencido", tone: "danger" },
  borrador: { label: "Borrador", tone: "neutral" },
};

const vigencia = (b) => {
  if (!b.startsAt && !b.endsAt) return "Sin vigencia definida";
  if (b.startsAt && b.endsAt) return `${formatDate(b.startsAt)} → ${formatDate(b.endsAt)}`;
  if (b.startsAt) return `Desde ${formatDate(b.startsAt)}`;
  return `Hasta ${formatDate(b.endsAt)}`;
};

const Banners = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listBanners({ state: TABS[tab].state }), [tab, version]);

  const handleDelete = () => {
    const result = deleteBanner(activeRow.id);
    setAnchor(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    refresh();
    showToast("Banner eliminado", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Banners"
        subtitle="Creatividades con vigencia, audiencia y oferta propias. Los bloques las referencian."
        actions={
          <>
            <Button
              variant="secondary" startIcon={<InsightsOutlinedIcon />}
              onClick={() => {
                const { touched } = simulateBannerTraffic();
                refresh();
                showToast(`Tráfico simulado en ${touched} banner(s) al aire`, "info");
              }}
            >
              Simular tráfico
            </Button>
            <Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({})}>
              Nuevo banner
            </Button>
          </>
        }
      />

      <BannerTimeline key={version} />

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
          {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
        </Tabs>
      </Box>

      {rows.length === 0 ? (
        <Box className="st-placeholder">No hay banners con este filtro.</Box>
      ) : (
        <Box className="st-bannergrid">
          {rows.map((b) => {
            const meta = STATE_META[b.state] || { label: b.state, tone: "neutral" };
            return (
              <Box className="st-bannercard" key={b.id}>
                <button type="button" className="st-bannercard__media" onClick={() => setModal({ banner: b })}>
                  <MediaBox media={b.media} ratio="16:9" alt={b.headline || b.name} />
                </button>

                <Box className="st-bannercard__body">
                  <Box className="st-bannercard__head">
                    <strong>{b.name}</strong>
                    <IconButton
                      size="small" aria-label="acciones"
                      onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(b); }}
                    >
                      <MoreVertIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>

                  {b.headline && <span className="st-bannercard__headline">{b.headline}</span>}

                  <Box className="st-bannercard__meta">
                    <StatusBadge tone={meta.tone} label={meta.label} />
                    <span className="text-tertiary">{vigencia(b)}</span>
                  </Box>

                  <Box className="st-bannercard__foot">
                    {b.audienceName && <span className="st-chip">{b.audienceName}</span>}
                    {b.usedInPages.length > 0 && (
                      <span className="st-chip st-chip--muted">
                        En {b.usedInPages.map((p) => p.title).join(", ")}
                      </span>
                    )}
                    {b.stats.impressions > 0 && (
                      <span className="text-tertiary">
                        {b.stats.clicks.toLocaleString("es-AR")} clics ·{" "}
                        {(b.ctr * 100).toFixed(1).replace(".", ",")} % CTR
                      </span>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Typography variant="caption" className="text-tertiary" sx={{ mt: 1 }}>
        Las impresiones y los clics son simulados: el storefront real los reportaría a Analytics.
      </Typography>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ banner: activeRow }); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem
          onClick={() => {
            updateBanner(activeRow.id, { status: activeRow.status === "borrador" ? "activo" : "borrador" });
            setAnchor(null); refresh(); showToast("Estado actualizado", "success");
          }}
        >
          {activeRow?.status === "borrador" ? "Publicar" : "Pasar a borrador"}
        </MenuItem>
        <MenuItem onClick={handleDelete}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <BannerModal
          banner={modal.banner}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); showToast("Banner guardado", "success"); }}
        />
      )}
    </Box>
  );
};

export default Banners;
