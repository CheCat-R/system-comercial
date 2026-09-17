/**
 * ⭐ "No podés hacer esto, y éste es el motivo" — dicho **antes**, no después.
 *
 * El RBAC del panel está bien puesto: se aplica en el `api/`, nunca escondiendo
 * botones. Pero al auditarlo, **una sola pantalla de 82** consultaba los
 * permisos desde la UI. En los once módulos de negocio alguien sin permiso veía
 * el botón encendido, hacía clic, y recién ahí aparecía un toast rojo.
 *
 * No es un agujero de seguridad —el `api/` frena igual— sino de experiencia: el
 * producto te deja intentar y después te reta. Y es lo que más lo hace sentir un
 * CRUD genérico, donde todos los botones están siempre encendidos.
 *
 * ── ⭐ Deshabilitar, no esconder ───────────────────────────────────────
 *
 * La regla del módulo (§2.2) es que **ningún botón desaparece por permisos**: un
 * botón que no está no se puede preguntar por qué no está, y quien lo necesita
 * termina pidiéndole a otro que "entre con su usuario". Se muestra apagado, con
 * el motivo al pasar el mouse.
 *
 *   <Permitido permiso="pedidos.cancelar">
 *     <Button variant="ghost" onClick={…}>Cancelar pedido</Button>
 *   </Permitido>
 *
 * Cuando además hace falta una razón propia de la pantalla (un pedido ya
 * despachado no se cancela aunque tengas el permiso), se pasa `bloqueo`:
 *
 *   <Permitido permiso="pedidos.cancelar" bloqueo={despachado && "Ya salió del depósito."}>
 */
import { cloneElement } from "react";
import Tooltip from "@mui/material/Tooltip";

import { useAuth } from "../../../context/AuthContext";
import { getPermission, getGrade } from "../api/securityApi";

/**
 * @param {string}  permiso  clave del catálogo
 * @param {string}  bloqueo  motivo propio de la pantalla; gana sobre el permiso
 * @param {boolean} explicarGrado  agrega al tooltip qué exige la operación
 *                                 (motivo, firma de otra persona) cuando SÍ se puede
 */
const Permitido = ({ permiso, bloqueo = null, explicarGrado = true, children }) => {
  const { check } = useAuth();
  const verdict = check(permiso);
  const permission = getPermission(permiso);
  const grade = getGrade(permission?.grade);

  const denegado = bloqueo || (!verdict.allowed ? verdict.reason : null);

  // ⭐ Cuando sí se puede, el tooltip no queda mudo: adelanta lo que la
  // operación va a pedir. Enterarse de que hace falta un motivo *después* de
  // hacer clic es la mitad del problema que este componente vino a resolver.
  const aviso = !denegado && explicarGrado && grade.order >= 2
    ? (grade.needsApproval
      ? `${permission.label}: pide un motivo y la firma de otra persona.`
      : `${permission.label}: pide un motivo escrito antes de ejecutarse.`)
    : "";

  const child = cloneElement(children, {
    disabled: children.props.disabled || Boolean(denegado),
  });

  const title = denegado || aviso;
  if (!title) return child;

  // El `<span>` existe porque un botón deshabilitado no dispara eventos de
  // mouse, y sin él el tooltip —justo el que explica por qué está apagado— no
  // aparecería nunca.
  return (
    <Tooltip title={title}>
      <span className="permitido-wrap">{child}</span>
    </Tooltip>
  );
};

export default Permitido;
