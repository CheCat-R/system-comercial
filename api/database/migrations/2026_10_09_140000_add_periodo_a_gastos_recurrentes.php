<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El gasto generado desde un gasto fijo recuerda de QUÉ período es (AAAA-MM). La idempotencia de "Generar período" se
 * medía por la fecha del gasto, que es editable: al corregirla a la del comprobante real (casi siempre el mes siguiente),
 * el período volvía a figurar pendiente y generarlo duplicaba el alquiler.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gastos', function (Blueprint $table) {
            $table->string('periodo_recurrente', 7)->nullable()->after('recurrente_id');
        });
        // Los ya generados: el período es el mes en que quedaron fechados.
        DB::statement("UPDATE gastos SET periodo_recurrente = DATE_FORMAT(CONVERT_TZ(fecha, '+00:00', '-03:00'), '%Y-%m') WHERE recurrente_id IS NOT NULL");
    }

    public function down(): void
    {
        Schema::table('gastos', function (Blueprint $table) {
            $table->dropColumn('periodo_recurrente');
        });
    }
};