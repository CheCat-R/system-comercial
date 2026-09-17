<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /*
     * LAS SESIONES. Sanctum guarda el sha256 del token y nunca el token: un
     * token en claro en la base es una credencial usable con sólo tener el
     * backup. Se agregan dos columnas propias:
     *  - `sucursal_id`: el contexto de trabajo de TODA la sesión, del lado del
     *    servidor. El candado del cajero a su sucursal no se abre editando un
     *    número en la request.
     *  - `user_agent`: para reconocer sesiones en la lista.
     */
    public function up(): void
    {
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();

            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->cascadeOnDelete();
            $table->string('user_agent', 300)->default('');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
    }
};
