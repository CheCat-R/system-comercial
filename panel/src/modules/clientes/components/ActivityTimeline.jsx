import { useState, useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";

import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import RedeemOutlinedIcon from "@mui/icons-material/RedeemOutlined";

import { relativeFromToday, formatDateTime } from "../lib/time";
import "./ActivityTimeline.css";

const TYPE = {
  order:    { icon: ShoppingBagOutlinedIcon,   tone: "accent",  group: "pedidos" },
  payment:  { icon: PaymentsOutlinedIcon,      tone: "success", group: "pedidos" },
  shipment: { icon: LocalShippingOutlinedIcon, tone: "accent",  group: "pedidos" },
  refund:   { icon: UndoOutlinedIcon,          tone: "danger",  group: "pedidos" },
  quote:    { icon: RequestQuoteOutlinedIcon,  tone: "accent",  group: "ventas" },
  note:     { icon: EditNoteOutlinedIcon,      tone: "neutral", group: "equipo" },
  call:     { icon: CallOutlinedIcon,          tone: "accent",  group: "equipo" },
  meeting:  { icon: GroupsOutlinedIcon,        tone: "accent",  group: "equipo" },
  email:    { icon: MailOutlineIcon,           tone: "accent",  group: "equipo" },
  task:     { icon: TaskAltOutlinedIcon,       tone: "warning", group: "equipo" },
  campaign: { icon: CampaignOutlinedIcon,      tone: "accent",  group: "marketing" },
  loyalty:  { icon: RedeemOutlinedIcon,        tone: "accent",  group: "marketing" },
  segment:  { icon: SwapHorizOutlinedIcon,     tone: "warning", group: "sistema" },
};

const FILTERS = [
  { key: "all", label: "Todo" },
  { key: "pedidos", label: "Pedidos y pagos" },
  { key: "ventas", label: "Ventas" },
  { key: "equipo", label: "Equipo" },
  { key: "marketing", label: "Marketing" },
  { key: "sistema", label: "Sistema" },
];

const ActivityItem = ({ ev, last }) => {
  const cfg = TYPE[ev.type] || TYPE.note;
  const Icon = cfg.icon;
  return (
    <li className={`atl-item ${last ? "atl-item--last" : ""}`}>
      <span className={`atl-dot atl-dot--${cfg.tone}`}>
        <Icon sx={{ fontSize: 15 }} />
      </span>
      <div className="atl-body">
        <div className="atl-line">
          <span className="atl-title">{ev.title}</span>
          <time className="atl-time" title={formatDateTime(ev.at)}>{relativeFromToday(ev.at.slice(0, 10))}</time>
        </div>
        {ev.description && <p className="atl-desc">{ev.description}</p>}
        <div className="atl-meta">
          <span>{ev.actor?.name || "Sistema"}</span>
          {ev.refType === "order" && (
            <RouterLink to={`/pedidos/${ev.refId}`} className="atl-link">Ver pedido #{ev.refId}</RouterLink>
          )}
        </div>
      </div>
    </li>
  );
};

/**
 * @param {Array} activities  ya ordenadas desc por fecha
 * @param {"full"|"compact"} variant
 * @param {number} limit  (compact) máximo de ítems
 */
const ActivityTimeline = ({ activities = [], variant = "full", limit = 5 }) => {
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    let r = activities;
    if (variant === "full" && filter !== "all") {
      r = r.filter((ev) => (TYPE[ev.type]?.group || "equipo") === filter);
    }
    return variant === "compact" ? r.slice(0, limit) : r;
  }, [activities, filter, variant, limit]);

  return (
    <div className="atl">
      {variant === "full" && (
        <div className="atl-filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`atl-chip ${filter === f.key ? "is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="atl-empty">Sin actividad para este filtro.</p>
      ) : (
        <ul className="atl-list">
          {rows.map((ev, i) => (
            <ActivityItem key={ev.id} ev={ev} last={i === rows.length - 1} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default ActivityTimeline;
