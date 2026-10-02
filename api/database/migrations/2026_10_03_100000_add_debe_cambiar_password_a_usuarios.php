<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "DEBE CAMBIAR LA CONTRASEÑA": la marca que obliga a una persona a elegir la
 * suya antes de usar el sistema.
 *
 * Se prende cuando la contraseña la puso OTRO (el instalador con la de
 * fábrica, el administrador al dar de alta o al restablecer, o el comando de
 * consola) y se apaga sola cuando la persona elige la suya. Sin esto, la
 * contraseña inicial `admin1234` quedaba en producción para siempre porque
 * nada obligaba a cambiarla.
 *
 * Por defecto `false`: los usuarios que ya existen no se ven forzados de
 * golpe el día que se despliega esto.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('usuarios', function (Blueprint $table) {
            $table->boolean('debe_cambiar_password')->default(false)->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('usuarios', function (Blueprint $table) {
            $table->dropColumn('debe_cambiar_password');
        });
    }
};
