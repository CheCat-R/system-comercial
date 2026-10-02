<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * MODO OFFLINE (POS sin internet) — cada venta armada sin conexión lleva un
 * `idLocal` generado en el navegador al cobrar. Al volver la conexión, el
 * lote se manda a `/ventas/offline-lote`; si ese lote se reintenta (se cortó
 * la respuesta a mitad de camino, el navegador reintentó), esta columna es
 * lo que evita cobrar la misma venta dos veces — igual que ya se cuida el
 * doble cobro del POS en línea, pero acá del lado de la sincronización.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ventas', function (Blueprint $table) {
            $table->string('idempotencia_offline', 64)->nullable()->unique()->after('ref_venta_id');
        });
    }

    public function down(): void
    {
        Schema::table('ventas', function (Blueprint $table) {
            $table->dropColumn('idempotencia_offline');
        });
    }
};
