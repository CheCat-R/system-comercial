/**
 * Resumen de la Tienda — el estado del sitio de un vistazo.
 *
 * Lo importante acá no son las métricas de venta (eso es Analytics) sino
 * **qué está al aire y qué necesita atención**.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import ViewCarouselOutlinedIcon from "@mui/icons-material/ViewCarouselOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import StatusBadge from "../../components/StatusBadge/StatusBadge";

import {
  getStoreSummary, getAttentionItems, getRecentlyPublished,
  getRenderTree, listPages, PAGE_STATE_META, ATTENTION_KINDS,
} from "./api/tiendaApi";
import { relativeFromToday } from "./lib/time";
import PagePreview from "./components/preview/PagePreview";
import "./Tienda.css";

const LEVEL_TONE = { error: "danger", warning: "warning", info: "info" };
const LEVEL_LABEL = { error: "Error", warning: "Aviso", info: "Nota" };

const Resumen = () => {
  const navigate = useNavigate();
  const [kind, setKind] = useState(null);

  const summary = useMemo(() => getStoreSummary(), []);
  const all = useMemo(() => getAttentionItems(), []);
  const attention = useMemo(() => (kind ? all.filter((i) => i.kind === kind) : all), [all, kind]);

  const counts = useMemo(() => {
    const byKind = {};
    all.forEach((i) => { byKind[i.kind] = (byKind[i.kind] || 0) + 1; });
    return { total: all.length, byKind };
  }, [all]);
  const recent = useMemo(() => getRecentlyPublished(5), []);
  const home = useMemo(() => listPages({ type: "home" })[0], []);
  const homeTree = useMemo(() => (home ? getRenderTree(home.id, { source: "draft" }) : null), [home]);

  const kpis = [
    { title: "Páginas publicadas", value: String(summary.publishedPages), icon: <ArticleOutlinedIcon /> },
    { title: "Cambios sin publicar", value: String(summary.pendingChanges), icon: <EditNoteOutlinedIcon /> },
    { title: "Banners al aire", value: String(summary.activeBanners), icon: <ViewCarouselOutlinedIcon /> },
    { title: "Colecciones vacías", value: String(summary.emptyCollections), icon: <CategoryOutlinedIcon /> },
  ];

  const homeState = home ? PAGE_STATE_META[home.state] : null;

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Tienda"
        subtitle="El contenido comercial del sitio: qué se muestra, dónde y desde cuándo."
        actions={
          home && (
            <Button variant="primary" startIcon={<OpenInNewOutlinedIcon />} onClick={() => navigate(`/tienda/paginas/${home.id}`)}>
              Editar la home
            </Button>
          )
        }
      />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard {...k} /></Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        {/* --------------------------------------------------------- la home */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card className="entity-card">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>La home, ahora</Typography>
              {homeState && <StatusBadge tone={homeState.tone} label={homeState.label} />}
            </Box>

            {homeTree && (
              <Box className="st-thumb">
                <PagePreview sections={homeTree.sections} page={home} viewport="desktop" fit chrome />
              </Box>
            )}

            <Box className="st-summaryfoot">
              <span className="text-tertiary">
                {home?.sectionCount} secciones · {home?.blockCount} bloques · editada {relativeFromToday(home?.updatedAt)}
              </span>
              <Button variant="secondary" size="small" onClick={() => navigate(`/tienda/paginas/${home.id}`)}>
                Abrir en el builder
              </Button>
            </Box>
          </Card>
        </Grid>

        {/* ------------------------------------------------------- atención */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Necesita atención</Typography>

            <Box className="st-attention__filters">
              <button
                type="button"
                className={`st-attention__chip ${!kind ? "is-active" : ""}`.trim()}
                onClick={() => setKind(null)}
              >
                Todo <em>{counts.total}</em>
              </button>
              {ATTENTION_KINDS.filter((k) => counts.byKind[k.value]).map((k) => (
                <button
                  key={k.value} type="button"
                  className={`st-attention__chip ${kind === k.value ? "is-active" : ""}`.trim()}
                  onClick={() => setKind(k.value)}
                >
                  {k.label} <em>{counts.byKind[k.value]}</em>
                </button>
              ))}
            </Box>

            {attention.length === 0 ? (
              <Typography variant="body2" className="text-tertiary">
                Nada pendiente acá: ninguna referencia rota, colección vacía ni banner vencido.
              </Typography>
            ) : (
              <Box className="st-attention">
                {attention.map((item, i) => (
                  <button
                    key={i} type="button" className="st-attention__row"
                    disabled={!item.pageId}
                    onClick={() => item.pageId && navigate(`/tienda/paginas/${item.pageId}`)}
                  >
                    <StatusBadge tone={LEVEL_TONE[item.level]} label={LEVEL_LABEL[item.level]} />
                    <span>
                      {item.message}
                      {item.pageTitle && <em> · {item.pageTitle}</em>}
                    </span>
                  </button>
                ))}
              </Box>
            )}
          </Card>

          <Card className="entity-card" sx={{ mt: 2.5 }}>
            <Typography variant="h6" className="card-title">Publicado recientemente</Typography>
            <Box className="st-recent">
              {recent.map((p) => (
                <button key={p.id} type="button" className="st-recent__row" onClick={() => navigate(`/tienda/paginas/${p.id}`)}>
                  <span>
                    <strong>{p.title}</strong>
                    <em className="mono">{p.slug}</em>
                  </span>
                  <span className="text-tertiary nowrap">{relativeFromToday(p.publishedAt)}</span>
                </button>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Resumen;
