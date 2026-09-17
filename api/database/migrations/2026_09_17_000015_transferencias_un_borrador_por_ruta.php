<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * UN SOLO BORRADOR POR RUTA (origen → destino). Dos cajeros que abren el
 * pedido en el mismo segundo tienen que terminar en el MISMO borrador: el
 * índice deja pasar a uno y el otro se queda con el suyo. Único parcial de
 * Postgres → columna generada que vale NULL fuera del estado borrador.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            $table->string('borrador_ruta', 40)->nullable()
                ->storedAs("IF(estado = 'borrador', CONCAT(origen_id, '-', destino_id), NULL)")
                ->unique('uq_transfer_borrador_unico');
        });
    }

    public function down(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            $table->dropUnique('uq_transfer_borrador_unico');
            $table->dropColumn('borrador_ruta');
        });
    }
};
