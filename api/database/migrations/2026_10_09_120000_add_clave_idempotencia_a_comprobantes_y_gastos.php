<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clave de idempotencia del alta: el panel genera una por formulario abierto y la manda en cada intento. Si el mismo
 * formulario se envía dos veces (doble clic, reintento tras un corte), el segundo pedido devuelve el documento ya creado
 * en vez de cargar otra factura y volver a ingresar la mercadería.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['comprobantes', 'gastos'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->string('clave_idempotencia', 64)->nullable()->unique();
            });
        }
    }

    public function down(): void
    {
        foreach (['comprobantes', 'gastos'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropUnique(['clave_idempotencia']);
                $table->dropColumn('clave_idempotencia');
            });
        }
    }
};