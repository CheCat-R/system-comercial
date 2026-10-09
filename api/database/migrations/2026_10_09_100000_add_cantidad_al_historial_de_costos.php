<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El historial de costos también guarda el TAMAÑO DEL BULTO (`producto_proveedores.cantidad`). Una factura puede
 * cambiar costo y bulto a la vez; al deshacer el lote solo volvía el costo y el costo unitario (costo ÷ bulto)
 * quedaba en cualquier cosa. Null = el lote no tocó el bulto (los anteriores a esta migración).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_proveedor_costos', function (Blueprint $table) {
            $table->double('cantidad_anterior')->nullable()->after('flete_anterior');
            $table->double('cantidad')->nullable()->after('flete');
        });
    }

    public function down(): void
    {
        Schema::table('producto_proveedor_costos', function (Blueprint $table) {
            $table->dropColumn(['cantidad_anterior', 'cantidad']);
        });
    }
};