/**
 * Lo que Seguridad le ofrece al motor de Automatizaciones.
 *
 * ⭐ Este archivo hace **dos cosas distintas**, y la segunda es la que rompe el
 * último ciclo entre módulos:
 *
 * 1. Registra el sujeto «solicitud de aprobación» y sus condiciones, igual que
 *    cualquier otro módulo.
 *
 * 2. **Enchufa Seguridad en el motor.** El motor necesita correr con un actor,
 *    saber cuál es el actor de una automatización y preguntar si un rol puede
 *    algo. Antes se lo importaba —y como `securityApi` emite al bus, el par
 *    `seguridad ↔ automatizaciones` quedaba en ciclo al nivel de módulos.
 *
 *    Ahora la dirección es una sola: **Seguridad conoce al motor, el motor no
 *    conoce a Seguridad.** Y el valor por omisión del enchufe **niega**, así que
 *    un panel que se lleve el motor sin este archivo no ejecuta automatizaciones
 *    por descuido: tiene que enchufar su propio control o decir explícitamente
 *    que no hay ninguno.
 */
import { getApprovalRequest } from "./api/securityApi";
import { APPROVAL_STATES } from "./lib/approvals";
import { listPermissions } from "./lib/permissions";
import { withActor, currentActor } from "./lib/audit";
import { automationActor } from "./lib/actors";
import { can } from "./lib/roles";
import { registrarSujeto, enchufarSeguridad } from "../automatizaciones/lib/registry";
import { registrarCondiciones, ENUM_OPS } from "../automatizaciones/lib/conditions";

/* ----------------------------------------------------------- el enchufe */

enchufarSeguridad({
  conActor: withActor,
  actorAutomatizacion: automationActor,
  puede: can,
  actorActual: currentActor,
});

/* -------------------------------------------------------------- sujeto */

/**
 * ⭐ Se carga en el momento de evaluar, como todos. Y acá importa más que en
 * ningún otro: entre que la solicitud se encoló y la regla corre, alguien pudo
 * aprobarla. Una regla que avisa "hay algo esperando" sobre algo ya firmado es
 * ruido.
 */
registrarSujeto("approval", {
  label: "Solicitud de aprobación",
  cargar: (id, { safe }) => {
    const approval = safe(() => getApprovalRequest(id));
    return approval ? { approval } : null;
  },
  describir: (subject, c) => `${subject.id} · ${c.approval?.action || ""}`.trim(),
});

/* --------------------------------------------------------- condiciones */

registrarCondiciones({
  "approval.action": {
    label: "Qué operación se pide aprobar", group: "Seguridad",
    subjectTypes: ["approval"], type: "enum", ops: ENUM_OPS,
    source: "seguridad/lib/permissions.js — el catálogo de permisos",
    options: () => listPermissions({ grade: "con_aprobacion" }).map((x) => ({ value: x.key, label: x.label })),
    get: (c) => c.approval?.action ?? null,
  },
  "approval.status": {
    label: "Estado de la solicitud", group: "Seguridad",
    subjectTypes: ["approval"], type: "enum", ops: ENUM_OPS,
    source: "seguridad/lib/approvals.js",
    hint: "Se lee al evaluar, no al encolar: si ya la firmaron, la regla no tiene nada que avisar.",
    options: () => Object.values(APPROVAL_STATES).map((x) => ({ value: x.key, label: x.label })),
    get: (c) => c.approval?.status ?? null,
  },
});
