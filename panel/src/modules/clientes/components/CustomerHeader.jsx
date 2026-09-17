import { useState } from "react";
import Card from "@mui/material/Card";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import AddIcon from "@mui/icons-material/Add";

import Button from "../../../components/Button/Button";
import { SegmentBadge, TierBadge } from "./SegmentBadge";
import { getTagColor } from "../api/clientsApi";
import { money, relativeFromToday } from "../lib/time";
import "./CustomerHeader.css";

const CustomerHeader = ({ account, onEdit }) => {
  const m = account.metrics;
  const contacts = account.contacts || [];
  const [contactId, setContactId] = useState(
    contacts.find((c) => c.isPrimary)?.id || contacts[0]?.id
  );
  const contact = contacts.find((c) => c.id === contactId) || contacts[0] || {};
  const isCompany = account.type === "company";

  return (
    <Card className="cust-hero">
      <div className="cust-hero__top">
        <Avatar className="cust-hero__avatar" variant={isCompany ? "rounded" : "circular"}>
          {isCompany ? <BusinessOutlinedIcon /> : account.name.charAt(0)}
        </Avatar>

        <div className="cust-hero__info">
          <div className="cust-hero__name-row">
            <Typography variant="h4" className="entity-title">{account.name}</Typography>
            <SegmentBadge segmentKey={m.segmentKey} />
            {m.tier === "vip" && <TierBadge tier="vip" size="sm" />}
            {m.tierIsOverride && <span className="cust-hero__override">tier manual</span>}
          </div>

          {isCompany && account.legalName && (
            <p className="cust-hero__legal">{account.legalName}{account.taxId ? ` · CUIT ${account.taxId}` : ""}</p>
          )}

          <div className="cust-hero__contact">
            {contacts.length > 1 ? (
              <Select
                size="small"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="cust-hero__contact-select"
              >
                {contacts.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}{c.role ? ` — ${c.role}` : ""}
                  </MenuItem>
                ))}
              </Select>
            ) : (
              contacts.length === 1 && !isCompany ? null : <span className="cust-hero__contact-name">{contact.name}</span>
            )}
            <span><MailOutlinedIcon sx={{ fontSize: 15 }} /> {contact.email || account.email}</span>
            <span><CallOutlinedIcon sx={{ fontSize: 15 }} /> {contact.phone || account.phone}</span>
          </div>

          {account.tags?.length > 0 && (
            <div className="cust-hero__tags">
              {account.tags.map((t) => <span key={t} className={`tag-chip tag-chip--${getTagColor(t)}`}>{t}</span>)}
            </div>
          )}
        </div>

        <div className="cust-hero__actions">
          <Button variant="secondary" startIcon={<EditOutlinedIcon />} onClick={onEdit}>Editar</Button>
          {/* ⭐ Ninguna de las dos existe como operación, y decirlo es más útil
              que ofrecer botones que no llevan a ningún lado. Lo que SÍ existe
              —convertir una cotización aceptada en pedido— vive en la pestaña
              Ventas de esta misma ficha. */}
          <Tooltip title="Crear una cotización todavía no existe como operación. Lo que sí se puede es convertir una cotización aceptada en pedido, desde la pestaña Ventas.">
            <span>
              <Button variant="secondary" startIcon={<RequestQuoteOutlinedIcon />} disabled>
                Nueva cotización
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="El alta manual de pedidos no existe: el único alta real del sistema es convertir una cotización, desde la pestaña Ventas de esta ficha.">
            <span>
              <Button variant="primary" startIcon={<AddIcon />} disabled>Nuevo pedido</Button>
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="cust-hero__kpis">
        <div className="cust-hero__kpi">
          <strong>{money(m.ltv)}</strong>
          <span>Lifetime value</span>
        </div>
        <div className="cust-hero__kpi">
          <strong>{m.ordersCount}</strong>
          <span>Pedidos</span>
        </div>
        <div className="cust-hero__kpi">
          <strong>{money(m.aov)}</strong>
          <span>Ticket promedio</span>
        </div>
        <div className="cust-hero__kpi">
          <strong className={m.recencyDays != null && m.recencyDays > 90 ? "text-danger" : ""}>
            {m.ordersCount ? relativeFromToday(m.lastOrderAt).replace("Hace ", "") : "Nunca"}
          </strong>
          <span>Última compra</span>
        </div>
      </div>
    </Card>
  );
};

export default CustomerHeader;
