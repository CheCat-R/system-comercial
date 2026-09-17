/**
 * ⭐ El contrato arquitectónico, verificado.
 *
 * El panel falla al cargar cuando un permiso, un evento, una métrica, un
 * proveedor o un color no declaran su contrato. Su **arquitectura** era la
 * excepción: las reglas que la sostienen vivían en comentarios, y un comentario
 * no frena a nadie.
 *
 * Tres reglas, las tres duras:
 *
 *   1. ⭐ Una hoja no importa nada.
 *      Los archivos marcados `@sin-dependencias` son lo que permite que tres
 *      módulos transversales (eventos, puertos, auditoría) los use todo el panel
 *      sin cerrar un ciclo. Un `import` ahí adentro rompe el arranque de la
 *      aplicación entera con un módulo a medio inicializar — el peor tipo de
 *      bug: intermitente y dependiente del orden de carga.
 *
 *   2. La UI no toca `data/`.
 *      La regla que hace que migrar a backend sea reescribir `api/` y nada más.
 *
 *   3. Sin ciclos de import.
 *      La auditoría §5.4 encontró un ciclo a nivel *módulo* (seguridad ↔
 *      automatizaciones) que es seguro **porque** los dos puntos de entrada son
 *      hojas. Eso ahora se verifica de verdad, a nivel archivo.
 *
 * Corre con `npm run check:arch`, y antes de cada `npm run build`.
 */
import fs from "fs";
import path from "path";

const ROOT = "src";
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
  );

const files = walk(ROOT)
  .filter((f) => /\.(jsx?|mjs)$/.test(f))
  .map((f) => f.replace(/\\/g, "/"));

const read = (f) => fs.readFileSync(f, "utf8");

/** Los imports de un archivo, con la ruta tal como está escrita. */
const importsOf = (src) => [
  ...src.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gm),
  ...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
].map((m) => m[1]);

let errores = 0;

/* ================================================================ regla 1 */
console.log("\n1. Las hojas no importan nada");

const hojas = files.filter((f) => read(f).includes("@sin-dependencias"));

if (hojas.length === 0) {
  bad("no se encontró ninguna hoja declarada — ¿alguien borró las marcas?");
  errores++;
}

hojas.forEach((f) => {
  const deps = importsOf(read(f));
  if (deps.length === 0) {
    ok(`${f}`);
  } else {
    bad(`${f} importa ${deps.length}: ${deps.join(", ")}`);
    errores++;
  }
});

/* ================================================================ regla 2 */
console.log("\n2. La UI no importa data/");

const violaciones = files
  .filter((f) => f.endsWith(".jsx"))
  .flatMap((f) => importsOf(read(f))
    .filter((d) => /(^|\/)data\//.test(d))
    .map((d) => `${f} → ${d}`));

if (violaciones.length === 0) {
  ok(`${files.filter((f) => f.endsWith(".jsx")).length} archivos .jsx, ninguno toca data/`);
} else {
  violaciones.forEach((v) => bad(v));
  errores += violaciones.length;
}

/* ================================================================ regla 3 */
console.log("\n3. Sin ciclos de import");

/** Resuelve una ruta relativa a un archivo real del proyecto. */
const resolver = (desde, spec) => {
  if (!spec.startsWith(".")) return null;               // dependencia externa
  const base = path.posix.join(path.posix.dirname(desde), spec);
  const candidatos = [
    base, `${base}.js`, `${base}.jsx`,
    `${base}/index.js`, `${base}/index.jsx`,
  ];
  return candidatos.find((c) => files.includes(c)) || null;
};

const grafo = new Map(
  files.map((f) => [f, importsOf(read(f)).map((s) => resolver(f, s)).filter(Boolean)])
);

const ciclos = [];
const estado = new Map();   // 0 = sin visitar, 1 = en la pila, 2 = terminado

const dfs = (nodo, pila) => {
  estado.set(nodo, 1);
  pila.push(nodo);

  for (const vecino of grafo.get(nodo) || []) {
    if (estado.get(vecino) === 1) {
      // Se cierra un ciclo: se reporta desde donde empieza.
      const desde = pila.indexOf(vecino);
      ciclos.push([...pila.slice(desde), vecino]);
    } else if (!estado.get(vecino)) {
      dfs(vecino, pila);
    }
  }

  pila.pop();
  estado.set(nodo, 2);
};

files.forEach((f) => { if (!estado.get(f)) dfs(f, []); });

if (ciclos.length === 0) {
  ok(`${files.length} archivos, ${[...grafo.values()].flat().length} imports internos, 0 ciclos`);
} else {
  // Un mismo ciclo puede detectarse por varios caminos: se muestra una vez.
  const vistos = new Set();
  ciclos.forEach((c) => {
    const firma = [...c].sort().join("|");
    if (vistos.has(firma)) return;
    vistos.add(firma);
    bad(`ciclo: ${c.map((f) => f.replace("src/", "")).join("\n         → ")}`);
    errores++;
  });
}


/* ============================================ 4. El motor no conoce el dominio */
/**
 * Automatizaciones es transversal: para que una regla diga "cuando un pedido
 * queda impago 3 dias", el motor tiene que saber que es un pedido. Durante
 * mucho tiempo eso estuvo escrito como imports directos a ocho modulos de
 * negocio, y el efecto medido fue que **llevarse un solo modulo a otro proyecto
 * arrastraba los otros nueve**.
 *
 * La regla 3 no lo veia: verifica ciclos entre ARCHIVOS y no habia ninguno,
 * porque `bus.js` es hoja. El ciclo estaba un nivel mas arriba, entre MODULOS.
 * Por eso esta regla mira el grafo por modulo y no por archivo.
 *
 * Ahora la direccion es una sola: los modulos se registran en el motor
 * (`automatizaciones/lib/registry.js`), el motor no importa a nadie.
 */
console.log("\n4. El motor de automatizaciones no conoce el dominio");

const NUCLEO = "automatizaciones";
const moduloDe = (f) => (f.match(/^src[/]modules[/]([^/]+)[/]/) || [])[1] || null;

const fugas = files
  .filter((f) => moduloDe(f) === NUCLEO)
  .flatMap((f) => grafo.get(f)
    .map((d) => ({ f, d, mod: moduloDe(d) }))
    .filter((x) => x.mod && x.mod !== NUCLEO));

if (fugas.length === 0) {
  const registros = files.filter((f) => /^src[/]modules[/][^/]+[/]automatizaciones[.]js$/.test(f));
  ok(`${NUCLEO}/ no importa ningun modulo de negocio; ${registros.length} modulos se registran`);
} else {
  fugas.forEach(({ f, d }) => bad(`${f.replace("src/", "")} → ${d.replace("src/", "")}`));
  bad("El motor tiene que recibir el dominio por registry.js, no importarlo.");
  errores += fugas.length;
}

/* ================================================================== final */
console.log("");
if (errores) {
  console.error(`\x1b[31mArquitectura: ${errores} violación(es).\x1b[0m`);
  console.error("Estas reglas son las que sostienen el panel; no se saltean con un comentario.\n");
  process.exit(1);
}
console.log("\x1b[32mArquitectura: las cuatro reglas se cumplen.\x1b[0m\n");
