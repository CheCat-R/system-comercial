# CheCAT — Sistema de Gestión Integral Comercial

Monorepo:

- [`api/`](api/) — API REST/JSON. **Laravel 12 + Sanctum + MySQL/MariaDB.** Pensada para hosting compartido (Hostinger).
- [`panel/`](panel/) — Panel de administración. **React 19 + Vite + MUI v9.** SPA que consume la API con tokens.

Cada carpeta tiene su propio README con la puesta en marcha.

## Despliegue (resumen)

| Subdominio | Carpeta | Document root |
|---|---|---|
| `api.tudominio.com` | `api/` | `api/public/` |
| `panel.tudominio.com` | `panel/` | contenido de `panel/dist/` (build) |

## Levantar en local (XAMPP)

Requiere MySQL/MariaDB de XAMPP corriendo, PHP 8.2+ y Node 20+.

```bash
# API (desde api/): primera vez
composer install && cp .env.example .env && php artisan key:generate
php artisan migrate --seed          # base checat_comercio; crea Central, Sucursal 1 y el superadmin
php artisan serve --port=8000

# Panel (desde panel/): primera vez
npm install && cp .env.example .env # VITE_API_URL=http://localhost:8000/api
npm run dev                         # http://localhost:5173
```

Entrada: usuario **Administrador**, contraseña **admin1234** (o lo que diga `SUPERADMIN_PASSWORD` en `api/.env`). Cambiarla apenas se entra.

## Estado

**Fase 1 (base operativa) — lista.** Sesiones y permisos, usuarios/roles, sucursales y equipos,
catálogo de productos (formatos de compra, presentaciones, listas de venta, precios y márgenes con
historial), proveedores, inventario (stock, movimientos, fraccionado, transferencias, incidencias,
controles de stock), configuración y chat interno.

**Fase 2 (mostrador) — lista.** Punto de venta con borradores y autoguardado, listas por
cantidad/marca/monto/cliente, ofertas (%, precio fijo, N×M, 2ª unidad, pack, combo, ticket),
descuentos con nombre, cobro con varios medios y redondeo, tickets y facturas A/B/C, notas de
crédito total/parcial, anulación con rastro, caja (turnos, arqueo, controles, movimientos),
cuenta corriente y cobranzas, clientes, presupuestos (reserva de stock y cierre en el POS) y
facturación electrónica ARCA (WSAA/WSFE, QR RG 4892, trámite del certificado, diagnóstico).
ARCA se enciende con las variables `ARCA_*` del `.env` de la API y el interruptor en
Ventas › Configuración; sin ellas, todo funciona igual con comprobantes internos.

Siguientes: **F3** compras, comprobantes de proveedor, gastos y pagos · **F4** el resto
(marketing, tienda, analytics reales).
