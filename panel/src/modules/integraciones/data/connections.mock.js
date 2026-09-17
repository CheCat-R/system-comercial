/**
 * Conexiones sembradas.
 *
 * **Está vacío a propósito, y es lo correcto.**
 *
 * En F1 ningún puerto tiene proveedor: todos corren con la implementación local
 * del módulo dueño, que es exactamente como funciona el panel hoy. Sembrar una
 * conexión falsa mostraría "conectado a MercadoPago" en una pantalla donde nada
 * está conectado — justo la clase de mentira que el módulo existe para evitar.
 *
 * La UI arma una fila por cada puerto del catálogo aunque no haya nada acá
 * (`listConnections`), así que la pantalla no arranca vacía: arranca diciendo la
 * verdad, que es "todo simulado".
 */
export const connections = [];
