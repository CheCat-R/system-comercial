<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /*
         * El rol es una FILA con su lista de permisos (no un enum): el superadmin
         * los crea y ajusta desde el panel sin tocar código. El comodín `*` sólo
         * existe en el rol que planta la semilla.
         */
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('clave', 60)->unique();
            $table->string('nombre', 80);
            $table->string('descripcion', 300)->default('');
            $table->json('permisos');
            // superadmin/admin/cajero/fraccionador: editables (salvo superadmin), no borrables.
            $table->boolean('es_sistema')->default(false);
            $table->timestamps();
        });

        Schema::create('usuarios', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 80);
            $table->foreignId('rol_id')->constrained('roles')->restrictOnDelete();
            // NULL = sin contraseña definida (el superadmin se la asigna).
            $table->string('password')->nullable();
            // Los usuarios no se borran (están en el historial): se desactivan.
            $table->boolean('activo')->default(true);
            /*
             * Relevo de caja: puede tomar la registradora de una sesión ajena firmando
             * con su PIN. Es trazabilidad, no permiso. Se usa a partir de F2 (caja).
             */
            $table->boolean('relevo_caja')->default(false);
            $table->string('pin')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('usuarios');
        Schema::dropIfExists('roles');
    }
};
