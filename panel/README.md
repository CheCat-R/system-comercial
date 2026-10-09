# CCS — Panel

El panel de **CCS · checat commerce systems**: una aplicación web modular (React + Vite) para comercios.
Se instala como app (PWA), sigue vendiendo sin conexión y habla con la API de este mismo repositorio (`../api`).

El objetivo del diseño: **agregar módulos nuevos sin tocar (ni romper) el núcleo ni los módulos existentes**.

Stack: **React 18 + Vite**, **React Router** (data router), **Material UI** solo para componentes, **CSS Modules**
para estilos, **JavaScript** con la estructura preparada para migrar a **TypeScript**.

---

## Requisitos

- Node.js `>= 22`
- npm `>= 10`

## ⚠️ Necesita la API corriendo

Este panel **no tiene datos propios**: todo viene de la API Laravel (`../api`) y de su base MySQL/MariaDB. Con los
dos proyectos en este repositorio (y XAMPP con MySQL encendido):

```bash
# Terminal 1 — la API (desde api/)
composer install && cp .env.example .env && php artisan key:generate
php artisan cliente:aprovisionar --plan=corporativo     # migra, siembra y fija el plan
php artisan serve --port=8000                           # http://localhost:8000/api/health

# Terminal 2 — el panel (desde panel/)
npm install && cp .env.example .env                     # VITE_API_BASE_URL=http://localhost:8000/api
npm run dev                                             # http://localhost:3000
```

Entrada de desarrollo: usuario **Administrador**, contraseña **admin1234** (o la que diga `SUPERADMIN_PASSWORD` en
`api/.env`). Se pide cambiarla al entrar si es la de fábrica.

Si la API no responde, el panel muestra el error de conexión y un botón para reintentar (no se rompe ni queda en blanco).

## Comandos

```bash
npm run dev        # desarrollo (http://localhost:3000)
npm run build      # build de producción -> dist/
npm run preview    # sirve el build para verificarlo
npm run lint       # ESLint (el CI tolera hasta 19 avisos, ningún error)
npm test           # pruebas del núcleo (node --test)
```

### Variables de entorno

| Variable | Para qué | Valor en desarrollo |
|----------|----------|---------------------|
| `VITE_API_BASE_URL` | URL base de la API. La usa `src/core/services/httpClient.js` para todas las llamadas. Sin definir, usa `/api` del mismo dominio (así se publica: un mismo build sirve para cualquier cliente). | `http://localhost:8000/api` |
| `VITE_DEFAULT_THEME` | Tema inicial (`light` / `dark`). | `light` |
| `VITE_ENABLED_MODULES` | Ids de módulos separados por coma para forzar alta/baja (opcional). | vacío |
| `VITE_DEV_PORT` | Puerto del servidor de desarrollo. Solo si el 3000 ya lo usa otra app; hay que sumar el mismo puerto a `CORS_ALLOWED_ORIGINS` en el `.env` de la API. | vacío (= 3000) |

> El archivo `.env` está en `.gitignore` y **no se sube**: copialo de `.env.example` en cada máquina.

> Login real: usuario + contraseña + sucursal, contra la API (`/auth/login`). La sesión es **por ventana/pestaña**:
> dos ventanas pueden operar con usuarios y sucursales distintos sin pisarse.

## Módulos

| Módulo | Ruta | Contiene |
|--------|------|----------|
| **Dashboard** | `/` | Resumen del inventario |
| **Compras** | `/compras` | Productos · Catálogos · Costos y percepciones · Facturación (facturas y pagos en sucursal) · Historial |
| **Proveedores** | `/proveedores` | Proveedores · Pedidos · Cuentas corrientes · Echeqs · Estados de cuenta |
| **Ventas** | `/ventas` | Punto de venta · Ventas · Caja · Presupuestos · Clientes · Cobranzas · Formato de venta · Ofertas · Cambios de precio · Configuración |
| **Almacén** | `/almacen` | Existencias · Control de stock · Fraccionamiento · Transferencias · Operaciones · Incidencias · Vencimientos |
| **Gastos** | `/gastos` | Gastos · Cuentas a pagar · Gastos fijos · Rubros · Resumen |
| **Gerencia** | `/gerencia` | Usuarios y roles · Reportes de ventas · Rentabilidad · Valorización · Auditoría · Configuración |
| **Sistema** | `/sistema` | Empresa · Impresión · Este equipo · Respaldos · Licencia |
| **Info de sistema** | `/info` | Guía de uso para el cliente |
| **Web** | `/web` | **Apagado** (`webHabilitado = false` en `src/core/config/app.config.js`): la API no tiene las rutas `/web/*` ni `/tienda/*` |

La visibilidad de cada sección la deciden los **permisos del rol** y el **plan** de la instalación
(Emprendedor / Pymes / Corporativo); Compras y Almacén comparten el subsistema de `src/modules/productos/`.

## Estructura (resumen)

```
src/
├── core/       # Núcleo del framework: layout, router, navegación, temas,
│               # auth, permisos, plan, cola offline, PWA, servicios compartidos, registro de módulos.
├── modules/    # Módulos de negocio, cada uno 100% autocontenido.
│   ├── productos/  # Subsistema compartido por Compras y Almacén
│   ├── ventas/     # POS, caja, presupuestos, clientes, ofertas, ARCA
│   ├── gastos/     # Gastos, pagos a proveedores, cuentas a pagar, fijos
│   ├── proveedores/# Proveedores, pedidos, cuentas corrientes, echeqs, estados de cuenta
│   ├── gerencia/   # Usuarios y roles, reportes
│   ├── sistema/    # Empresa, impresión, respaldos, licencia
│   ├── manual/     # Info de sistema (la guía de uso: es DATO, ver content/)
│   ├── web/        # Administración del sitio público (apagado)
│   └── dashboard/
├── shared/     # Componentes/utilidades reutilizables, sin lógica de negocio.
├── assets/     # Imágenes, íconos, fuentes.
└── styles/     # Reset, design tokens (variables CSS) y estilos globales.
```

## ¿Cómo agrego un módulo?

1. Creá `src/modules/<mi-modulo>/` copiando la estructura de `dashboard/`.
2. Exportá su manifiesto con `defineModule({...})` en `index.js`.
3. Registralo agregándolo al array de `src/modules/index.js`.

Las rutas y la navegación se generan **solos** a partir del manifiesto. No se edita el núcleo. La guía completa está en
**[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Publicarlo

`npm run build` genera `dist/`: archivos estáticos que sirven para **cualquier cliente**, porque el panel llama a `/api`
del dominio desde el que se lo abre. Con varios clientes en un mismo servidor (`../api/deploy/CLIENTES.md`) cada
subdominio sirve estos mismos archivos y su `/api` resuelve a la base de ese cliente.
