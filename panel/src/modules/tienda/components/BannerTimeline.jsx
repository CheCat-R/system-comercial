/**
 * Qué banner está al aire cada día del mes.
 *
 * Es lo que hace útil la pantalla de Banners: una lista ordenada por fecha no
 * deja ver **huecos** (días sin nada al aire) ni **solapamientos** (tres banners
 * compitiendo el mismo día). Una franja por banner, sí.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import { getBannerSchedule } from "../api/tiendaApi";

const BannerTimeline = () => {
  const [offset, setOffset] = useState(0);

  const base = new Date();
  const cursor = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const schedule = getBannerSchedule({ year: cursor.getFullYear(), month: cursor.getMonth() });

  const dayCount = schedule.days.length;
  const inMonth = schedule.banners.filter((b) =>
    schedule.days.some((d) => d.bannerIds.includes(b.id))
  );

  /** Primer y último día del mes en que este banner está al aire. */
  const spanOf = (bannerId) => {
    const days = schedule.days.filter((d) => d.bannerIds.includes(bannerId)).map((d) => d.day);
    if (!days.length) return null;
    const from = Math.min(...days);
    const to = Math.max(...days);
    return { from, to, left: ((from - 1) / dayCount) * 100, width: ((to - from + 1) / dayCount) * 100 };
  };

  return (
    <Box className="st-timeline">
      <Box className="st-timeline__head">
        <IconButton size="small" onClick={() => setOffset((o) => o - 1)} aria-label="mes anterior">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography className="st-timeline__month">{schedule.label}</Typography>
        <IconButton size="small" onClick={() => setOffset((o) => o + 1)} aria-label="mes siguiente">
          <ChevronRightIcon fontSize="small" />
        </IconButton>

        <Box sx={{ flex: 1 }} />

        {schedule.gaps.length > 0 ? (
          <Tooltip title={`Días sin ningún banner al aire: ${schedule.gaps.join(", ")}`}>
            <span><StatusBadge tone="warning" label={`${schedule.gaps.length} día(s) sin banner`} /></span>
          </Tooltip>
        ) : (
          <StatusBadge tone="success" label="Sin huecos" />
        )}
      </Box>

      {/* Regla de días */}
      <Box className="st-timeline__ruler">
        {schedule.days.map((d) => (
          <span
            key={d.day}
            className={`st-timeline__tick ${d.isToday ? "is-today" : ""} ${d.count === 0 ? "is-gap" : ""}`.trim()}
            title={d.count === 0 ? `Día ${d.day}: nada al aire` : `Día ${d.day}: ${d.count} banner(s)`}
          >
            {d.day % 5 === 0 || d.day === 1 ? d.day : ""}
          </span>
        ))}
      </Box>

      {inMonth.length === 0 ? (
        <Box className="st-placeholder">Ningún banner está programado para este mes.</Box>
      ) : (
        <Box className="st-timeline__rows">
          {inMonth.map((b) => {
            const span = spanOf(b.id);
            return (
              <Box className="st-timeline__row" key={b.id}>
                <span className="st-timeline__name">{b.name}</span>
                <span className="st-timeline__track">
                  <Tooltip title={`${b.name}: del ${span.from} al ${span.to}`}>
                    <span
                      className={`st-timeline__bar st-timeline__bar--${b.state}`}
                      style={{ left: `${span.left}%`, width: `${span.width}%`, background: b.media?.color }}
                    />
                  </Tooltip>
                </span>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default BannerTimeline;
