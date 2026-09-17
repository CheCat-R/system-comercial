/** Familia Conversión — confianza, dudas y captura de contactos. */
import { useState } from "react";

import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import StarOutlineOutlinedIcon from "@mui/icons-material/StarOutlineOutlined";
import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

import { Placeholder, SectionHeading, Stars } from "./primitives";

const USP_ICONS = {
  truck: LocalShippingOutlinedIcon,
  shield: ShieldOutlinedIcon,
  card: CreditCardOutlinedIcon,
  refresh: AutorenewOutlinedIcon,
  clock: AccessTimeOutlinedIcon,
  star: StarOutlineOutlinedIcon,
  gift: CardGiftcardOutlinedIcon,
  lock: LockOutlinedIcon,
};

export const UspBar = ({ props }) => {
  const items = props.items || [];
  if (!items.length) return <Placeholder>Agregá al menos dos beneficios.</Placeholder>;

  return (
    <div className={`st-usp st-usp--${props.layout || "inline"}`}>
      {items.map((it, i) => {
        const Icon = USP_ICONS[it.icon] || LocalShippingOutlinedIcon;
        return (
          <div className="st-usp__item" key={it._id || i}>
            <Icon className="st-usp__icon" />
            <div>
              <strong>{it.title || "—"}</strong>
              {it.subtitle && <span>{it.subtitle}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Cta = ({ props }) => {
  if (!props.heading) return <Placeholder>Falta el título del llamado a la acción.</Placeholder>;
  return (
    <div className={`st-cta st-cta--${props.tone || "accent"}`}>
      <h3 className="st-cta__heading">{props.heading}</h3>
      {props.body && <p className="st-cta__body">{props.body}</p>}
      {props.buttonLabel && (
        <span className={`st-btn ${props.tone === "neutral" ? "st-btn--outline" : "st-btn--primary"}`}>
          {props.buttonLabel}
        </span>
      )}
    </div>
  );
};

export const Testimonials = ({ props, data }) => {
  const items = data.items || [];
  if (!items.length) {
    return (
      <Placeholder>
        {props.source === "manual"
          ? "Agregá al menos un testimonio."
          : `No hay valoraciones aprobadas con ${props.minRating} estrellas o más.`}
      </Placeholder>
    );
  }

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div
        className={props.layout === "carousel" ? "st-rail" : "st-grid"}
        style={props.layout === "carousel" ? undefined : { "--st-cols": Math.min(items.length, 3) }}
      >
        {items.map((t, i) => (
          <blockquote className="st-quote" key={t.id || t._id || i}>
            <Stars rating={t.rating} />
            <p>{t.comment}</p>
            <footer>
              <strong>{t.customer}</strong>
              {t.productName && <span>sobre {t.productName}</span>}
            </footer>
          </blockquote>
        ))}
      </div>
    </div>
  );
};

export const Faq = ({ props }) => {
  const items = props.items || [];
  const [open, setOpen] = useState(Number(props.defaultOpenIndex ?? 0));

  if (!items.length) return <Placeholder>Agregá al menos una pregunta.</Placeholder>;

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div className="st-faq">
        {items.map((it, i) => (
          <div className={`st-faq__item ${open === i ? "is-open" : ""}`.trim()} key={it._id || i}>
            <button
              type="button" className="st-faq__q"
              onClick={(e) => { e.stopPropagation(); setOpen(open === i ? -1 : i); }}
              aria-expanded={open === i}
            >
              <span>{it.q || "—"}</span>
              <ExpandMoreIcon className="st-faq__chevron" />
            </button>
            {open === i && <div className="st-faq__a">{it.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export const StoreLocator = ({ props, data }) => {
  const branches = data.branches || [];
  if (!branches.length) return <Placeholder>No hay sucursales activas en Inventario.</Placeholder>;

  return (
    <div className="st-block">
      <SectionHeading>{props.heading}</SectionHeading>
      <div className="st-grid" style={{ "--st-cols": props.columns || 3 }}>
        {branches.map((b) => (
          <div className="st-branch" key={b.id}>
            <PlaceOutlinedIcon className="st-branch__pin" />
            <strong>{b.name}</strong>
            <span>{b.address}</span>
            {props.showHours && <em>Lun a sáb de 10 a 20 · Dom de 12 a 19</em>}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * El único bloque que **escribe** hacia otro módulo: al suscribirse llama a
 * `data.subscribe`, que resuelve la cuenta por email y marca la suscripción en
 * Marketing (`ChannelSubscription`). En el editor sirve de prueba real; en un
 * storefront sería el alta del visitante. Ver docs/MODULO-TIENDA-CMS.md §7.
 */
export const Newsletter = ({ props, data }) => {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setResult(data.subscribe?.(email, { channel: props.channel, tag: props.tagOnSubscribe })
      || { ok: false, message: "La suscripción no está disponible en esta vista." });
  };

  return (
    <div className="st-newsletter">
      <div className="st-newsletter__text">
        <h3 className="st-cta__heading">{props.heading || "Suscribite"}</h3>
        {props.body && <p className="st-cta__body">{props.body}</p>}
      </div>

      <form className="st-newsletter__form" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <input
          type={props.channel === "whatsapp" ? "tel" : "email"}
          className="st-newsletter__input"
          placeholder={props.channel === "whatsapp" ? "Tu WhatsApp" : "Tu email"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label={props.channel === "whatsapp" ? "WhatsApp" : "Email"}
        />
        <button type="submit" className="st-btn st-btn--primary">{props.buttonLabel || "Suscribirme"}</button>
      </form>

      {result && (
        <p className={`st-newsletter__result ${result.ok ? "is-ok" : "is-error"}`}>{result.message}</p>
      )}
    </div>
  );
};
