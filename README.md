# CCS — checat commerce systems

Sistema de gestión integral para comercios: punto de venta, compras, stock, proveedores, gastos y facturación electrónica ARCA.
Un mismo sistema en tres planes (**Emprendedor**, **Pymes**, **Corporativo**): el plan es un dato de cada instalación, no otro build.

Monorepo:

- [`api/`](api/) — API REST/JSON. **Laravel 12 + Sanctum + MySQL/MariaDB.** Pensada para hosting compartido.
- [`panel/`](panel/) — La aplicación que se usa (PWA). **React 18 + Vite + MUI.** Consume la API con tokens y sigue vendiendo sin conexión.

Cada carpeta tiene su propio README con la puesta en marcha.

## Levantar en local (XAMPP)

Requiere MySQL/MariaDB de XAMPP corriendo, PHP 8.2+ y Node 22+.

```bash
# API (desde api/): primera vez
composer install && cp .env.example .env && php artisan key:generate
php artisan cliente:aprovisionar --plan=corporativo   # migra, siembra y fija el plan (base checat_comercio)
php artisan serve --port=8000

# Panel (desde panel/): primera vez
npm install && cp .env.example .env                    # VITE_API_BASE_URL=http://localhost:8000/api
npm run dev                                            # http://localhost:3000
```

Entrada: usuario **Administrador**, contraseña **admin1234** (o lo que diga `SUPERADMIN_PASSWORD` en `api/.env`). El sistema pide
cambiarla en el primer ingreso.

## Pruebas

```bash
cd api   && vendor/bin/phpunit      # la API (necesita MySQL; los tests de varios clientes crean y borran bases propias)
cd panel && npm test                # el núcleo del panel
```

El CI de GitHub (`.github/workflows/ci.yml`) corre las dos suites, el lint y el build del panel en cada push.

## Qué tiene

- **Ventas**: punto de venta con borradores y autoguardado (y modo sin conexión), listas por cantidad/marca/monto/cliente,
  ofertas, descuentos con nombre, cobro con varios medios, tickets y facturas A/B/C con **ARCA** (CAE, QR, notas de crédito),
  caja con turnos y arqueo, cuenta corriente y cobranzas, clientes y presupuestos.
- **Compras y precios**: formatos de compra, facturas, remitos, liquidaciones y notas, costos con descuentos en cascada, flete e IVA,
  precios derivados con historial, actualización masiva con deshacer, importación de catálogos.
- **Stock**: existencias por sucursal, fraccionamiento, transferencias, incidencias, control de stock, vencimientos.
- **Proveedores y gastos**: fichas, pedidos, cuentas corrientes, echeqs, estados de cuenta, pagos desde la caja, gastos fijos y resumen.
- **Gerencia y sistema**: usuarios y roles con permisos, reportes, rentabilidad real, impresión, respaldos, licencias firmadas.

Los planes están definidos en [`api/app/Auth/PlanCatalogo.php`](api/app/Auth/PlanCatalogo.php).
El módulo **Web** (sitio público con tienda) está apagado y es **solo para el plan Corporativo, a pedido**: la API no tiene sus rutas.

## Operar el servicio

| Tema | Documento |
|---|---|
| Dejar una instalación lista para un cliente | [`api/deploy/PRODUCCION.md`](api/deploy/PRODUCCION.md) |
| **Varios clientes en un mismo servidor** (alta, actualización, cron, suspensión, cambio de plan) | [`api/deploy/CLIENTES.md`](api/deploy/CLIENTES.md) |
| **Copias fuera del servidor** (cifradas, a Google Drive) | [`api/deploy/COPIAS_EXTERNAS.md`](api/deploy/COPIAS_EXTERNAS.md) |
| Licencias: emitir, activar, renovar | [`api/deploy/LICENCIAS.md`](api/deploy/LICENCIAS.md) |
| Notas técnicas de diseño (decisiones y trampas; archivo de consulta interna) | [`docs/NOTAS_TECNICAS_INFO_DE_SISTEMA.md`](docs/NOTAS_TECNICAS_INFO_DE_SISTEMA.md) |

## Despliegue (resumen)

Una instalación de **un cliente**: `api/public/` como raíz de un subdominio de la API y el contenido de `panel/dist/` en el del panel
(o el panel y la API bajo el mismo dominio: el panel llama a `/api` de donde se lo abre). Con **varios clientes** en un servidor,
cada uno tiene su subdominio, su base y su carpeta, y todos comparten un único código: ver [`api/deploy/CLIENTES.md`](api/deploy/CLIENTES.md).
