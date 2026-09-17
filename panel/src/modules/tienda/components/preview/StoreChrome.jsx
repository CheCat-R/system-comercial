/**
 * Lo que rodea al contenido: anuncio superior, header y footer.
 *
 * No son bloques (§3.8): son del sitio, no de una página. Salen del Tema
 * (`Apariencia`) y de los Menús, y el preview los dibuja alrededor del árbol para
 * que lo que se ve sea la página completa y no sólo su relleno.
 */
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";

const PAYMENTS = ["VISA", "MASTER", "AMEX", "MP"];
const SOCIAL = ["IG", "FB", "TT", "YT"];

export const Announcement = ({ announcement }) => {
  if (!announcement?.enabled || !announcement.text) return null;
  return (
    <div className={`st-announce st-announce--${announcement.tone || "accent"}`}>
      {announcement.text}
    </div>
  );
};

export const StoreHeader = ({ header, menu }) => {
  const items = menu?.items || [];
  return (
    <header className={`st-header st-header--${header?.layout || "left"}`}>
      <span className="st-header__brand">{header?.brand || "Tienda"}</span>

      <nav className="st-header__nav">
        {items.map((item) => (
          <span className="st-header__link" key={item.id}>
            {item.label}
            {item.badge && <em className="st-menupreview__badge">{item.badge}</em>}
          </span>
        ))}
      </nav>

      <div className="st-header__actions">
        {header?.showSearch && <SearchOutlinedIcon />}
        <PersonOutlineOutlinedIcon />
        {header?.showCart && (
          <span className="st-header__cart">
            <ShoppingBagOutlinedIcon />
            <em>2</em>
          </span>
        )}
      </div>
    </header>
  );
};

export const StoreFooter = ({ footer, menus = [] }) => (
  <footer className="st-footer">
    <div className="st-footer__cols">
      {menus.map((menu) => (
        <div className="st-footer__col" key={menu.id}>
          {menu.items.map((item) => (
            <div className="st-footer__group" key={item.id}>
              <strong>{item.label}</strong>
              {item.children.map((child) => <span key={child.id}>{child.label}</span>)}
            </div>
          ))}
        </div>
      ))}

      {footer?.showSocial && (
        <div className="st-footer__group">
          <strong>Seguinos</strong>
          <div className="st-footer__chips">
            {SOCIAL.map((s) => <span className="st-footer__chip" key={s}>{s}</span>)}
          </div>
        </div>
      )}
    </div>

    {footer?.showPayments && (
      <div className="st-footer__chips">
        {PAYMENTS.map((p) => <span className="st-footer__chip" key={p}>{p}</span>)}
      </div>
    )}

    {footer?.note && <span className="st-footer__note">{footer.note}</span>}
  </footer>
);
