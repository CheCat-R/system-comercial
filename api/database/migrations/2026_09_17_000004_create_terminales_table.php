<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /*
     * TERMINALES — el equipo sabe en qué sucursal está, así la cajera no tiene
     * que acordarse. Las personas rotan entre locales; la PC del local no. El
     * token vive en el navegador (no en la red: sigue andando si la cajera
     * vende con los datos del celular) y no da privilegios: sólo dice DÓNDE
     * está parado el equipo. Se guarda hasheado igual que las sesiones.
     */
    public function up(): void
    {
        Schema::create('terminales', function (Blueprint $table) {
            $table->id();
            // Cómo la llama la gente del local: "Caja 1", "Mostrador".
            $table->string('nombre', 60);
            $table->foreignId('sucursal_id')->constrained('sucursales')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            // Dar de baja un equipo sin borrarlo: el login vuelve a preguntar la sucursal.
            $table->boolean('activa')->default(true);
            $table->foreignId('creada_por')->nullable()->constrained('usuarios')->nullOnDelete();
            // Para detectar la que dejó de usarse (una notebook que se llevaron).
            $table->timestamp('ultimo_uso')->nullable();
            $table->string('ultimo_agente', 300)->default('');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('terminales');
    }
};
