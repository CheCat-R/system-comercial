<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Un JSON por área ('ventas', 'empresa', 'impresion'…) con catálogo de defaults en código.
        Schema::create('configuracion', function (Blueprint $table) {
            $table->id();
            $table->string('clave', 60)->unique();
            $table->json('valor');
            $table->timestamps();
        });

        /*
         * CHAT INTERNO por sucursal. Sin `para_usuario_id` es el canal grupal
         * del local; con valor es un mensaje PRIVADO para ese usuario. Se lee
         * por polling (no hay WebSockets en hosting compartido).
         */
        Schema::create('chat_mensajes', function (Blueprint $table) {
            $table->id();
            $table->timestamp('fecha')->useCurrent();
            $table->foreignId('sucursal_id')->constrained('sucursales')->cascadeOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->foreignId('para_usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->text('texto');

            $table->index(['sucursal_id', 'id']);
            $table->index(['sucursal_id', 'para_usuario_id', 'id']);
        });

        // Hasta qué mensaje leyó cada usuario en cada conversación (0 = canal grupal).
        Schema::create('chat_lecturas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sucursal_id')->constrained('sucursales')->cascadeOnDelete();
            $table->foreignId('usuario_id')->constrained('usuarios')->cascadeOnDelete();
            $table->unsignedBigInteger('canal_usuario_id')->default(0);
            $table->unsignedBigInteger('ultimo_mensaje_id')->default(0);
            $table->unique(['sucursal_id', 'usuario_id', 'canal_usuario_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_lecturas');
        Schema::dropIfExists('chat_mensajes');
        Schema::dropIfExists('configuracion');
    }
};
