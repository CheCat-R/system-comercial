# CheCAT Comercio — API

API REST/JSON del Sistema de Gestión Integral Comercial. **Laravel 12 + Sanctum + MySQL/MariaDB.**
Sin vistas: todos los endpoints viven en `routes/api.php` bajo `/api`.

El frontend es `../panel-dashboard` (React + Vite). Las reglas de negocio se portan de
`../crm-api-main` (NestJS, solo referencia).

## Puesta en marcha local (XAMPP)

```bash
composer install
cp .env.example .env        # y completar DB_* (XAMPP: root sin contraseña)
php artisan key:generate
php artisan migrate
php artisan serve           # http://localhost:8000/api/health
```

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
5. `php artisan migrate --force` (por SSH si hay; si no, importar el SQL desde phpMyAdmin).
