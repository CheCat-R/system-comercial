# CheCAT Comercio — API

API REST/JSON del Sistema de Gestión Integral Comercial. **Laravel 12 + Sanctum + MySQL/MariaDB.**
Sin vistas: todos los endpoints viven en `routes/api.php` bajo `/api`.

El frontend es `../panel` (React + Vite). `../crm-api-main` (NestJS) fue la referencia
de contrato durante el desarrollo — ya no está en uso, esta API es la real.

## Puesta en marcha local (XAMPP)

```bash
composer install
cp .env.example .env        # y completar DB_* (XAMPP: root sin contraseña)
php artisan key:generate
php artisan cliente:aprovisionar --plan=corporativo   # migra + siembra + fija el plan
php artisan serve           # http://localhost:8000/api/health
```

## Alta de un cliente nuevo

`php artisan cliente:aprovisionar --plan=<emprendedor|pymes|corporativo>` es el único
comando que hace falta correr contra una base recién creada: migra el esquema completo
(siempre entero, sin importar el plan — así subir de plan después es cambiar un dato, no
correr una migración nueva), siembra lo mínimo para poder entrar (roles, el usuario
`Administrador`, listas de precio, rubros de gasto) y fija el plan comercial de la
instalación (ver `App\Auth\PlanCatalogo`). Es seguro correrlo más de una vez.

El plan define qué módulos/secciones ve esta instalación — no se toca desde el panel
(`App\Services\LicenciaService`); para cambiarlo más adelante, `php artisan licencia:plan
<plan>`.

Contraseña inicial del superadmin: `SUPERADMIN_PASSWORD` del `.env`, o `admin1234` si no
se definió — cambiarla en el primer ingreso.

## Estructura

- `app/Http/Controllers/Api/` — controladores, uno por recurso.
- `app/Http/Requests/` — validación (Form Requests).
- `app/Http/Resources/` — forma de las respuestas JSON.
- `app/Models/` — Eloquent.
- `database/migrations/` — esquema (fuente de verdad, versionado).

## Despliegue en Hostinger (hosting compartido)

1. `composer install --no-dev --optimize-autoloader` en local y subir con `vendor/`.
2. Document root del subdominio `api.tudominio.com` → carpeta `public/`.
3. `.env` con `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL`, `DB_*`, `CORS_ALLOWED_ORIGINS`.
4. Permisos de escritura en `storage/` y `bootstrap/cache/`.
5. `php artisan cliente:aprovisionar --plan=<plan>` (por SSH si hay; si no, correr
   `migrate` importando el SQL desde phpMyAdmin y después `db:seed` + `licencia:plan <plan>`
   por separado).
