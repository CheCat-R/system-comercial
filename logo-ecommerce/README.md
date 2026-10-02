# Logo de CheCAT Commerce Systems

Isotipo: una bolsa de compras cuyas esquinas superiores son las orejas del gato de
CheCAT, con los ojos amarillos de la marca. Los trazados de los ojos son los del
isotipo original (`panel-dashboard/public/logo-isotipo.svg`), sin redibujar.

Abrí `preview.html` para verlo todo junto (necesita un servidor estático, porque
las imágenes se cargan por ruta relativa):

```bash
npx --yes serve docs/logo-commerce -l 4321
```

## Qué archivo va en cada lugar

| Archivo | Dónde |
|---|---|
| `isotipo.svg` | Dentro del sistema, **incrustado en el HTML** (no con `<img>`). Usa `currentColor`, así que toma el color del texto y sirve en tema claro y oscuro con un solo archivo |
| `isotipo-claro.svg` | Fondos oscuros: el login, el encabezado del tema oscuro |
| `isotipo-oscuro.svg` | Fondos claros: documentos, PDF, tema claro |
| `logo-horizontal-claro.svg` | Lockup con el nombre, sobre fondo oscuro |
| `logo-horizontal-oscuro.svg` | Lockup con el nombre, sobre fondo claro |
| `favicon.svg` | Pestaña del navegador y avatar de la barra lateral |
| `favicon-32.png` | Navegadores viejos |
| `apple-touch-icon.png` | 180×180, iPhone y iPad al "agregar a inicio" |
| `icon-192.png`, `icon-512.png` | Manifest de la PWA |
| `isotipo-mono.svg` | **Tickets**: impresión térmica y cualquier impresión a un solo color |

## Por qué hay tantas versiones

**`currentColor` contra color fijo.** El `isotipo.svg` hereda el color del texto, que
es cómodo y evita mantener dos copias — pero sólo funciona si el SVG está incrustado
en el HTML. Dentro de un `<img>`, de un cliente de correo o de un PDF, el SVG queda
aislado y `currentColor` se resuelve como negro: el logo sale negro sobre negro. Por eso
están además las versiones de color fijo.

**El favicon es un dibujo distinto, no el logo achicado.** A 16 o 20 píxeles no entra
ningún logo de dos elementos. La versión del favicon resigna el asa —una línea que a ese
tamaño desaparece— y agranda los ojos. Lo que se conserva es lo que identifica la marca:
la silueta con orejas.

**El monocromo tampoco es el logo en blanco y negro.** La impresora térmica del punto de
venta no imprime grises, trabaja a baja resolución y saca el logo a unos 2 cm de ancho.
El amarillo saldría como una mancha oscura tapando los ojos, así que ahí los ojos van
calados (blancos, sin tinta), más grandes, y el asa más gruesa.

## Cómo engancharlo en el sistema

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Colores

| | |
|---|---|
| Gris de la marca | `#373435` |
| Amarillo de los ojos | `#FFD400` |
| Violeta del favicon | `#6C5CE7` — es el del botón del login; si lo cambiás, cambialo también en `favicon.svg` |
| Silueta sobre fondo oscuro | `#F2F2F2` |

## Regenerar los PNG

Si cambia el logo, los PNG salen del SVG con:

```bash
cd docs/logo-commerce && for s in 32 180 192 512; do npx --yes sharp-cli -i favicon.svg -o "icon-$s.png" resize $s $s; done
```

Después renombrá `icon-32.png` a `favicon-32.png` y `icon-180.png` a `apple-touch-icon.png`.

## Dos advertencias

1. **El texto del lockup horizontal es texto, no trazados.** Se ve bien en pantalla
   porque usa una pila de fuentes del sistema, pero si lo mandás a imprenta o a un
   tercero que no tenga Inter, la tipografía cambia sola. Antes de imprimir, convertí el
   texto a curvas.
2. **Dentro del sistema conviene no usar el lockup**: poné `isotipo.svg` al lado del
   nombre escrito en HTML. Así el nombre hereda la tipografía de la aplicación y acompaña
   al tema claro u oscuro sin archivos extra.

En `descartadas/` quedaron las otras dos propuestas por si alguna vez se quiere volver
sobre ellas.
