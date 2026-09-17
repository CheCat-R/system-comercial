import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import "./StatCard.css";

/**
 * Tarjeta de métrica (KPI).
 *
 * ⭐ **La flecha dice hacia dónde se movió; el color dice si eso es bueno.**
 * No son lo mismo: una tasa de devolución que sube es una flecha para arriba y
 * una mala noticia. Cuando el KPI sabe qué le conviene (`higherIsBetter` en el
 * diccionario de métricas), pasa `delta.good` y el color sigue al significado.
 * Sin `good`, se comporta como siempre: verde arriba, rojo abajo.
 *
 * @param {string} title            - Nombre de la métrica
 * @param {string|number} value     - Valor principal
 * @param {string} hint             - Texto secundario (ej. "vs período anterior")
 * @param {ReactNode} icon          - Icono representativo
 * @param {{ value: string, direction: "up"|"down", good?: boolean }} delta - Variación
 */
const StatCard = ({ title, value, hint, icon, delta }) => {
  const down = delta?.direction === "down";
  const tone = delta == null
    ? null
    : (delta.good == null ? (down ? "down" : "up") : (delta.good ? "up" : "down"));

  return (
    <div className="stat-card">
      <div className="stat-card__head">
        <span className="stat-card__title">{title}</span>
        {icon && <span className="stat-card__icon">{icon}</span>}
      </div>

      <div className="stat-card__value">{value}</div>

      {(delta || hint) && (
        <div className="stat-card__foot">
          {delta && (
            <span className={`stat-card__delta stat-card__delta--${tone}`}>
              {down ? (
                <ArrowDownwardIcon sx={{ fontSize: 13 }} />
              ) : (
                <ArrowUpwardIcon sx={{ fontSize: 13 }} />
              )}
              {delta.value}
            </span>
          )}
          {hint && <span className="stat-card__hint">{hint}</span>}
        </div>
      )}
    </div>
  );
};

export default StatCard;
