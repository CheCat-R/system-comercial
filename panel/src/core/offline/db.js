/**
 * LA BASE LOCAL DEL MODO OFFLINE — un IndexedDB chico, con dos cajones:
 *  - `ventasPendientes`: las ventas que el POS cobró sin conexión, esperando
 *    para mandarse al servidor en cuanto vuelva internet.
 *  - `catalogoSnapshot`: la última foto del catálogo (precios + stock) de
 *    cada sucursal, para que sobreviva un F5 en medio de un corte — sin
 *    esto, recargar la página durante el corte dejaría al POS sin nada para
 *    vender hasta que vuelva la conexión.
 *
 * `indexedDB` nativo, sin librería: son dos cajones con CRUD simple, no hace
 * falta más. Cada función de abajo hace UNA sola operación por transacción a
 * propósito — una transacción de IndexedDB se cierra sola en cuanto no tiene
 * un pedido en vuelo, así que encadenar un `await` de otra cosa en el medio
 * (una promesa que no sea del propio IndexedDB) puede cerrarla antes de
 * tiempo. Con una operación por transacción, ese problema no existe.
 */
const NOMBRE_DB = 'crm-offline';
const VERSION_DB = 1;

let _promesaDB = null;

function abrirDB() {
  if (_promesaDB) return _promesaDB;
  _promesaDB = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('ventasPendientes')) {
        db.createObjectStore('ventasPendientes', { keyPath: 'idLocal' });
      }
      if (!db.objectStoreNames.contains('catalogoSnapshot')) {
        db.createObjectStore('catalogoSnapshot', { keyPath: 'sucursalId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _promesaDB;
}

function comoPromesa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(cajon, valor) {
  const db = await abrirDB();
  return comoPromesa(db.transaction(cajon, 'readwrite').objectStore(cajon).put(valor));
}

export async function eliminar(cajon, clave) {
  const db = await abrirDB();
  return comoPromesa(db.transaction(cajon, 'readwrite').objectStore(cajon).delete(clave));
}

export async function obtener(cajon, clave) {
  const db = await abrirDB();
  return comoPromesa(db.transaction(cajon, 'readonly').objectStore(cajon).get(clave));
}

export async function listarTodo(cajon) {
  const db = await abrirDB();
  return comoPromesa(db.transaction(cajon, 'readonly').objectStore(cajon).getAll());
}
