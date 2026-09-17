import AppRouter from "./app/routes/AppRouter";

/**
 * ⭐ Los módulos de negocio se presentan ante el motor **antes** de que arranque.
 *
 * Automatizaciones no importa a ningún módulo: son los módulos los que se
 * registran (ver `automatizaciones/lib/registry.js`). Esta línea es la que hace
 * que eso ocurra, y `app/registrarDominio.js` es la única lista de módulos
 * activos del panel — sacar un módulo del proyecto es borrar una línea de ahí.
 *
 * El orden respecto de `startAutomations()` está garantizado por el módulo ES:
 * todos los imports terminan de evaluarse antes de que corra el cuerpo de este
 * archivo, así que cuando el motor arranca el registro ya está lleno.
 */
import "./app/registrarDominio";

import { start as startAutomations } from "./modules/automatizaciones/api/automationsApi";
import { start as startIntegrations } from "./modules/integraciones/api/integrationsApi";

/**
 * El motor de automatizaciones se conecta al bus **al arrancar la app**, no al
 * entrar a su pantalla.
 *
 * Encontrado probando la F1: rechazar un pago desde Pedidos no disparaba nada si
 * antes no habías visitado `/automatizaciones`, porque el suscriptor recién se
 * registraba ahí. Una automatización que sólo funciona cuando estás mirando la
 * pantalla de automatizaciones no es una automatización.
 *
 * `start()` es idempotente, así que las pantallas pueden seguir llamándolo.
 */
startAutomations();

/**
 * Integraciones arranca por la misma razón, y es todavía más evidente: instala
 * la política de llamadas (traza, idempotencia, caída al fallback) y el reloj de
 * la cola de reintentos. Una cola que sólo corre mientras estás mirando la
 * consola de tráfico no es una cola.
 *
 * Lo que **no** hace es conectar nada: sin proveedor habilitado, cada puerto
 * sigue resolviéndose con la implementación local de su módulo.
 */
startIntegrations();

function App() {
  return <AppRouter />;
}

export default App;
