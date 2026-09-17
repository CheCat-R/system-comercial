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
