import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";

import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { SegmentBadge } from "./SegmentBadge";
import RfmScorecard from "./RfmScorecard";
import ActivityTimeline from "./ActivityTimeline";
import { RFM_LABELS } from "../lib/rfm";
import { resolveSegment, segmentOf, TIERS, tierFromSegment } from "../lib/segments";
import {
  setTierOverride, getManualSegments, getAccountSegments, toggleAccountInSegment,
} from "../api/clientsApi";
import "./SegmentacionTab.css";

const TIER_OPTIONS = ["vip", "frecuente", "activo", "en_riesgo", "durmiente", "lead"];

const SegmentacionTab = ({ account, activities, onChange }) => {
  const { showToast } = useToast();
  const m = account.metrics;
  const seg = segmentOf(m.segmentKey);
  const calculatedTier = tierFromSegment(m.segmentKey, null);

  const [anchor, setAnchor] = useState(null);
  const memberOf = getAccountSegments(account.id);
  const allSegments = getManualSegments();
  const available = allSegments.filter((s) => !memberOf.some((x) => x.id === s.id));

  const [extraDays, setExtraDays] = useState(0);
  const projected = useMemo(() => {
    if (!m.ordersCount) return null;
    const rec = m.recencyDays + extraDays;
    // recomputar sólo R con la recencia proyectada (F y M no cambian sin nuevos pedidos)
    const r = rec <= 15 ? 5 : rec <= 45 ? 4 : rec <= 90 ? 3 : rec <= 180 ? 2 : 1;
    return resolveSegment({ ordersCount: m.ordersCount, recencyDays: rec, r, f: m.f, m: m.m });
  }, [m, extraDays]);

  const segmentActivities = activities.filter((a) => a.type === "segment");

  const applyTier = (_, val) => {
    const next = val === "auto" ? null : val;
    onChange(setTierOverride(account.id, next));
    showToast(next ? `Tier fijado en «${TIERS[next].label}»` : "Tier vuelve al calculado", "success");
  };

  const toggleSegment = (segmentId, name, joining) => {
    toggleAccountInSegment(segmentId, account.id);
    setAnchor(null);
    onChange();
    showToast(joining ? `Agregado a «${name}»` : `Quitado de «${name}»`, "info");
  };

  return (
    <Box className="seg-tab">
      <Box className="seg-tab__grid">
        <Box className="seg-tab__col">
          {/* Segmento smart */}
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Segmento smart</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <SegmentBadge segmentKey={m.segmentKey} />
                <span className="mono seg-tab__code">{m.r}·{m.f}·{m.m}</span>
              </Box>
              <Typography variant="body2" color="text.secondary">{m.segmentReason}</Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Acción sugerida:</strong> {seg.action}
              </Typography>
            </Box>

            <div className="seg-tab__rfm-rows">
              {["r", "f", "m"].map((dim) => (
                <div key={dim} className="seg-tab__rfm-row">
                  <span className="seg-tab__rfm-dim">{dim.toUpperCase()}</span>
                  <span className="seg-tab__rfm-name">{RFM_LABELS[dim].name}</span>
                  <span className="seg-tab__rfm-val">
                    {dim === "r" && (m.recencyDays != null ? `${m.recencyDays} días` : "—")}
                    {dim === "f" && `${m.frequencyYear} pedidos / 12m`}
                    {dim === "m" && `$${m.ltv.toLocaleString("es-AR")}`}
                  </span>
                  <span className="seg-tab__rfm-score">{m[dim]}/5</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Simulador */}
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Simulador de recencia</Typography>
            {m.ordersCount ? (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Si esta cuenta no vuelve a comprar en{" "}
                  <strong>{extraDays} día{extraDays === 1 ? "" : "s"}</strong> más
                  (recencia total {m.recencyDays + extraDays} días):
                </Typography>
                <Slider
                  value={extraDays}
                  onChange={(_, v) => setExtraDays(v)}
                  step={5}
                  min={0}
                  max={200}
                  marks={[{ value: 0, label: "hoy" }, { value: 100, label: "+100" }, { value: 200, label: "+200" }]}
                  valueLabelDisplay="auto"
                />
                <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
                  <span className="seg-tab__arrow">→</span>
                  <SegmentBadge segmentKey={projected?.key || m.segmentKey} />
                  {projected && projected.key !== m.segmentKey && (
                    <span className="seg-tab__change">cambia</span>
                  )}
                </Box>
                {projected && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{projected.reason}</Typography>}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin pedidos — el simulador de recencia aparece con la primera compra.
              </Typography>
            )}
          </Card>

          {/* Historial de cambios */}
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Historial de segmentación</Typography>
            {segmentActivities.length ? (
              <ActivityTimeline activities={segmentActivities} variant="compact" limit={8} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin cambios registrados. Los cambios de segmento y de tier aparecen acá.
              </Typography>
            )}
          </Card>
        </Box>

        <Box className="seg-tab__col seg-tab__col--side">
          {/* Override de tier */}
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Tier</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Calculado: <strong>{TIERS[calculatedTier].label}</strong>
              {m.tierIsOverride && " · hay un override manual activo"}
            </Typography>
            <ToggleButtonGroup
              orientation="vertical"
              exclusive
              size="small"
              value={account.tierOverride || "auto"}
              onChange={applyTier}
              className="seg-tab__tiers"
            >
              <ToggleButton value="auto">Automático (calculado)</ToggleButton>
              {TIER_OPTIONS.map((t) => (
                <ToggleButton key={t} value={t}>{TIERS[t].label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Card>

          {/* Segmentos manuales */}
          <Card className="entity-card">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Segmentos manuales</Typography>
              <Button
                variant="ghost"
                size="small"
                startIcon={<AddIcon />}
                disabled={!available.length}
                onClick={(e) => setAnchor(e.currentTarget)}
              >
                Agregar
              </Button>
            </Box>
            {memberOf.length ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {memberOf.map((s) => (
                  <div key={s.id} className={`seg-tab__manual seg-tab__manual--${s.color}`}>
                    <span>{s.name}</span>
                    <IconButton size="small" onClick={() => toggleSegment(s.id, s.name, false)} aria-label={`Quitar de ${s.name}`}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </div>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No pertenece a ningún segmento manual.
              </Typography>
            )}
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
              {available.map((s) => (
                <MenuItem key={s.id} onClick={() => toggleSegment(s.id, s.name, true)}>{s.name}</MenuItem>
              ))}
            </Menu>
          </Card>

          <Card className="entity-card">
            <Typography variant="h6" className="card-title">RFM</Typography>
            <RfmScorecard metrics={m} />
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

export default SegmentacionTab;
