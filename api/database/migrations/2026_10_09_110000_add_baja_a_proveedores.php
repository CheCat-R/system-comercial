<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un proveedor con historia (facturas, pagos, compromisos) no se borra: se da de BAJA. Sigue en el padrón para que
 * sus comprobantes y su cuenta se puedan consultar, pero deja de ofrecerse al cargar compras nuevas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('proveedores', function (Blueprint $table) {
            $table->boolean('activo')->default(true)->after('nombre');
            $table->timestamp('baja_en')->nullable();
            $table->string('motivo_baja', 300)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('proveedores', function (Blueprint $table) {
            $table->dropColumn(['activo', 'baja_en', 'motivo_baja']);
        });
    }
};