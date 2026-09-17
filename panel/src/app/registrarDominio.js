/**
 * ⭐ La lista de módulos de negocio de ESTE panel.
 *
 * Es el único archivo que sabe qué módulos existen en el proyecto. Cada línea
 * importa el archivo `automatizaciones.js` de un módulo, que se presenta ante el
 * motor: qué sujetos aporta, qué escáneres, qué acciones y qué condiciones.
 *
 * ── Para armar un panel nuevo a partir de este ────────────────────────────
 *
 * **Borrar una línea de acá es borrar un módulo.** El motor sigue funcionando
 * con lo que quede: las reglas que apuntaban a un sujeto que ya no está no se
 * ejecutan y se explican (`faltante()` en `automatizaciones/lib/registry.js`),
 * en vez de romper el arranque.
 *
 * Ese es todo el punto de la inversión del registro. Antes, el motor importaba
 * a los ocho módulos y sacarle uno lo rompía; medido sobre el grafo, llevarse
 * un solo módulo a otro proyecto arrastraba los otros nueve.
 *
 * ── Orden ─────────────────────────────────────────────────────────────────
 *
 * El orden **no importa** para el registro (todo ocurre antes de que el motor
 * arranque, en `App.jsx`), pero se mantiene el del dominio para que se lea como
 * un índice. La única regla real: un módulo que extiende el sujeto de otro
 * —el CRM le agrega la cuenta al pedido— no necesita ir después; las
 * extensiones se aplican al construir el contexto, no al registrarse.
 */

import "../modules/seguridad/automatizaciones";      // + enchufa el control de acceso del motor
import "../modules/pedidos/automatizaciones";
import "../modules/clientes/automatizaciones";       // + le agrega la cuenta a pedido, envío y carrito
import "../modules/inventario/automatizaciones";
import "../modules/abastecimiento/automatizaciones";
import "../modules/logistica/automatizaciones";
import "../modules/marketing/automatizaciones";
import "../modules/integraciones/automatizaciones";
