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
    req.onsuccess = () => {
      const db = req.result;
      // Si el navegador cierra la base (o hay una versión nueva), la próxima operación la vuelve a abrir.
      db.onclose = () => { _promesaDB = null; };
      db.onversionchange = () => { db.close(); _promesaDB = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    // Una apertura fallida no se guarda para siempre: la próxima operación lo intenta de nuevo.
    _promesaDB = null;
    throw e;
  });
  return _promesaDB;
}

function comoPromesa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Una escritura vale cuando la TRANSACCIÓN se confirma (`complete`), no cuando el pedido da `success`: el navegador
 * puede abortarla después (sin cuota, disco lleno, conexión cerrada) y la venta cobrada no quedaría guardada en
 * ningún lado. Si aborta, esto RECHAZA y el POS avisa que no se pudo guardar.
 */
function escribir(db, cajon, operacion) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(cajon, 'readwrite');
    let resultado;
    const req = operacion(tx.objectStore(cajon));
    req.onsuccess = () => { resultado = req.result; };
    tx.oncomplete = () => resolve(resultado);
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error('No se pudo guardar en este equipo.'));
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('No se pudo guardar en este equipo.'));
  });
}

export async function put(cajon, valor) {
  const db = await abrirDB();
  return escribir(db, cajon, (st) => st.put(valor));
}

export async function eliminar(cajon, clave) {
  const db = await abrirDB();
  return escribir(db, cajon, (st) => st.delete(clave));
}

export async function obtener(cajon, clave) {
  const db = await abrirDB();
  return comoPromesa(db.transaction(cajon, 'readonly').objectStore(cajon).get(clave));
}

export async function listarTodo(cajon) {
  const db = await abrirDB();
  return comoPromesa(db.transaction(cajon, 'readonly').objectStore(cajon).getAll());
}
