/**
 * INFO DE SISTEMA — el contenido, como DATO
 * ============================================================================
 * La guía de uso que ve el cliente: cómo se hace cada cosa, dónde, y qué conviene
 * saber antes de hacerla. Está escrita para quien usa el sistema, no para quien lo
 * programa: no lleva historia de decisiones, nombres de archivos ni detalles de
 * implementación. Eso vive en docs/NOTAS_TECNICAS_INFO_DE_SISTEMA.md, que no se
 * muestra en la aplicación.
 *
 * Es una estructura de datos, no componentes: agregar documentación es agregar un
 * objeto a la sección que corresponda (un archivo por sección, en esta carpeta),
 * no escribir JSX. El renderer entiende estos bloques:
 *
 *   { t: 'p',      texto }                        párrafo (admite **negrita** y *cursiva*)
 *   { t: 'lista',  items: [] }                    viñetas
 *   { t: 'pasos',  items: [] }                    secuencia numerada
 *   { t: 'flujo',  items: [] }                    cadena horizontal A → B → C
 *   { t: 'tabla',  cols: [], filas: [[]] }        tabla
 *   { t: 'nota',   tono: 'info|ok|warn', texto }  aviso destacado
 *   { t: 'ejemplo', titulo, lineas: [] }          caso concreto con números
 *   { t: 'ruta',   texto }                        dónde se hace en la app
 *
 * REGLAS AL EDITAR:
 *  · Se escribe lo que el usuario necesita para hacer algo bien: qué hace cada
 *    pantalla, en qué orden, y las trampas que conviene conocer.
 *  · Cuando cambia una pantalla o una regla, se cambia acá en el mismo momento:
 *    una guía que dice algo que ya no es cierto es peor que no tener guía.
 *  · Lo que depende del plan (Emprendedor / Pymes / Corporativo) se dice en el tema.
 *  · Nada de nombres de clientes, de personas ni de proveedores reales.
 */
import { INICIO } from './inicio.js';
import { COMPRAS } from './compras.js';
import { PRECIOS } from './precios.js';
import { OFERTAS } from './ofertas.js';
import { VENTAS } from './ventas.js';
import { INVENTARIO } from './inventario.js';
import { PROVEEDORES } from './proveedores.js';
import { GASTOS } from './gastos.js';
import { SISTEMA } from './sistema.js';

/** El orden es el del índice: de lo básico a lo específico, así se aprende el sistema. */
export const MANUAL = [INICIO, COMPRAS, PRECIOS, OFERTAS, VENTAS, INVENTARIO, PROVEEDORES, GASTOS, SISTEMA];
