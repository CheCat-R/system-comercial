<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `comprobantes::anular()` ya recibía el usuario que anula, pero no lo
 * guardaba en ningún lado distinto de `usuario_id` (que es quien CARGÓ el
 * comprobante, no quien lo anuló) — el dato se perdía. `ventas` ya resuelve
 * esto con `anulado_por`/`anulado_en`; acá se replica el mismo criterio.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comprobantes', function (Blueprint $table) {
            $table->foreignId('anulado_por')->nullable()->after('usuario_id')->constrained('usuarios')->nullOnDelete();
            $table->dateTime('anulado_en')->nullable()->after('anulado_por');
        });
    }

    public function down(): void
    {
        Schema::table('comprobantes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('anulado_por');
            $table->dropColumn('anulado_en');
        });
    }
};
