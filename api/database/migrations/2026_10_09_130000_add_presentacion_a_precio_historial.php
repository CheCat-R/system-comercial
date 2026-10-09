<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La evolución de precios también registra los PAQUETES fraccionados (cada uno con su formato de venta): sin esto, un
 * granel que vende sus paquetes podía subir de precio sin dejar rastro ni disparar el aviso "cambiaron los precios" a la caja.
 * Null = el precio del producto en sí (la madre o un producto entero).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('precio_historial', function (Blueprint $table) {
            $table->unsignedBigInteger('presentacion_id')->nullable()->after('producto_id');
            $table->index(['producto_id', 'lista_id', 'presentacion_id'], 'ix_precio_historial_pres');
        });
    }

    public function down(): void
    {
        Schema::table('precio_historial', function (Blueprint $table) {
            $table->dropIndex('ix_precio_historial_pres');
            $table->dropColumn('presentacion_id');
        });
    }
};