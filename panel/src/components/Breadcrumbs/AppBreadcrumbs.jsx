/**
 * La miga de pan del panel.
 *
 * ⭐ Tenía un mapa `routeNames` escrito a mano con las etiquetas de cada
 * segmento de ruta. Cubría los primeros módulos y **nunca se extendió para los
 * ocho siguientes**: al auditarlo, 34 segmentos caían en el *fallback* de
 * capitalizar el slug, y en pantalla se leía «Campanas», «Fidelizacion»,
 * «Paginas». Una lista paralela que se desactualiza en silencio, que es
 * exactamente el problema que el panel resuelve con contratos en todos lados
 * menos acá.
 *
 * Ahora la etiqueta sale **del menú** (`app/navigation.jsx`), que es la misma
 * fuente que usan el sidebar y la búsqueda global. Si una ruta está en el menú,
 * su nombre ya está escrito; el mapa local queda sólo para lo que el menú no
 * nombra (sub-secciones y palabras sueltas de una URL).
 *
 * Y `assertRoutes()` avisa en desarrollo qué segmentos no tienen nombre en
 * ninguno de los dos lados — el mismo mecanismo que `assertPermissions()`.
 */
import { useLocation, Link as RouterLink } from "react-router-dom";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import HomeIcon from "@mui/icons-material/Home";
import Box from "@mui/material/Box";

import { labelFor, isNamed } from "./routeLabels";
import { useEntityLabel } from "./EntityLabelContext";
import { NAV_DESTINATIONS } from "../../app/navigation";
import "./AppBreadcrumbs.css";

/**
 * ⭐ El aviso suena cuando el problema es visible, no al arrancar.
 *
 * La idea original era un `assertRoutes()` al cargar, como `assertPermissions()`.
 * Pero las rutas del panel se declaran en JSX (`<Route path="…">`), no como
 * datos: para listarlas al arranque habría que mantener **otra** lista paralela,
 * que es justamente el problema que esto viene a resolver.
 *
 * Así que el chequeo vive acá: cada vez que la miga pinta un segmento sin
 * nombre, lo dice una vez en consola. Suena al navegar a la pantalla que lo
 * tiene mal, con el nombre exacto de lo que falta agregar.
 */
const avisados = new Set();
const avisar = (segmento) => {
  if (!import.meta.env?.DEV || avisados.has(segmento)) return;
  avisados.add(segmento);
  console.warn(
    `[rutas] «${segmento}» no tiene etiqueta ni en el menú (app/navigation.jsx) ni en `
    + `routeLabels.js, así que la miga lo muestra capitalizando el slug.`
  );
};

const AppBreadcrumbs = () => {
  const location = useLocation();
  const { labelOf } = useEntityLabel();
  const pathnames = location.pathname.split("/").filter((x) => x);

  if (pathnames.length === 0) return null;

  /*
   * ⭐ Dos módulos pueden compartir el PREFIJO de una URL (p. ej.
   * `/abastecimiento/compras` es de Compras y el resto de `/abastecimiento/*`
   * es de Proveedores; `/finanzas/rentabilidad` es de Gerencia y
   * `/finanzas/gastos` es de Gastos). El primer segmento no alcanza para
   * saber de quién es — pero la URL COMPLETA sí, si el menú la conoce: se
   * busca ahí una sola vez y se usa su padre para el segmento ambiguo.
   */
  const currentDest = NAV_DESTINATIONS.find((d) => d.path === location.pathname);
  const fallbackParent = currentDest?.parent;

  return (
    <Box className="breadcrumbs-container">
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        aria-label="breadcrumb"
        className="app-breadcrumbs"
      >
        <Link component={RouterLink} to="/" className="breadcrumb-link breadcrumb-home">
          <HomeIcon fontSize="small" sx={{ mr: 0.5, mb: 0.2 }} />
          Inicio
        </Link>

        {pathnames.map((value, index) => {
          const isLast = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join("/")}`;

          // ⭐ Un identificador se muestra con el nombre de la cosa, no con la
          // palabra «Detalle»: la pantalla ya cargó la entidad y la registra
          // (ver EntityLabelContext). Si todavía no lo hizo, «Detalle» sirve de
          // puente hasta que llegue.
          const nombrado = isNamed(value, to);
          if (!nombrado && !labelOf(value)) avisar(value);
          const title = labelFor(value, to, fallbackParent) || labelOf(value) || "Detalle";

          return isLast ? (
            <Typography key={to} className="breadcrumb-current">{title}</Typography>
          ) : (
            <Link key={to} component={RouterLink} to={to} className="breadcrumb-link">
              {title}
            </Link>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
};

export default AppBreadcrumbs;
