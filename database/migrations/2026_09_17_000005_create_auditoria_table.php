<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Registro de cambios campo por campo: quién, qué entidad, qué campo, antes y después. */
    public function up(): void
    {
        Schema::create('auditoria', function (Blueprint $table) {
            $table->id();
            $table->timestamp('fecha')->useCurrent();
            // SET NULL: borrar un usuario no borra la historia de lo que hizo.
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->string('entidad', 60);
            $table->unsignedBigInteger('entidad_id');
            // Dónde se cambió: 'Ficha', 'Percepciones', 'Formato de compra'…
            $table->string('ambito', 80);
            // Contexto de la fila ("Aceite de oliva x500").
            $table->string('detalle', 200)->default('');
            $table->string('campo', 120);
            $table->string('antes', 300)->default('');
            $table->string('despues', 300)->default('');

            $table->index(['entidad', 'entidad_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auditoria');
    }
};
