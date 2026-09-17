<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FORMATO DE VENTA. El precio de venta NO se edita: se deriva de costo + margen
 * por lista. Una MODALIDAD (Minorista, Mayorista…) agrupa LISTAS numeradas; a
 * cada producto (o presentación) se le define por lista un markup o un precio
 * fijo y las unidades mínimas que la habilitan. `reglas_marca` desbloquea una
 * modalidad al llegar a N unidades de una marca. Todo precio que cambia queda
 * en `precio_historial`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('modalidades_venta', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 80);
            $table->integer('orden')->default(0);
            $table->boolean('activa')->default(true);
            $table->timestamps();
        });

        Schema::create('listas_venta', function (Blueprint $table) {
            $table->id();
            $table->foreignId('modalidad_id')->constrained('modalidades_venta')->cascadeOnDelete();
            $table->integer('numero');
            $table->string('nombre', 80);
            $table->integer('orden')->default(0)->index();
            $table->boolean('activa')->default(true);
            $table->timestamps();
            $table->unique(['modalidad_id', 'numero']);
        });

        Schema::create('producto_listas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            // NULL = el producto entero/granel; con valor = ese tamaño fraccionado.
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->cascadeOnDelete();
            $table->foreignId('lista_id')->constrained('listas_venta')->cascadeOnDelete();
            // Unidades por "formato de venta" (pack x6 → 6).
            $table->double('unidades')->default(1);
            $table->string('codigo_barras', 60)->default('');
            // 'markup' (% sobre costo neto: el precio acompaña al costo) o 'precio' (final a mano).
            $table->string('modo_precio', 10)->default('markup');
            $table->double('markup')->default(0);
            $table->double('precio_fijo')->default(0);
            // Desde cuántas unidades se habilita esta lista en el ticket.
            $table->double('unidades_minimas')->default(0);
            $table->timestamps();

            /*
             * Una fila por (producto, lista) cuando no hay presentación y una por
             * (presentación, lista) cuando la hay. COALESCE porque dos NULL no
             * chocan en un UNIQUE.
             */
            $table->unsignedBigInteger('presentacion_key')->storedAs('COALESCE(presentacion_id, 0)');
            $table->unique(['producto_id', 'presentacion_key', 'lista_id'], 'uq_producto_presentacion_lista');
            $table->string('codigo_barras_unico', 60)->nullable()->storedAs("NULLIF(codigo_barras, '')")->unique();
            $table->index('presentacion_id');
        });

        Schema::create('reglas_marca', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marca_id')->constrained('marcas')->cascadeOnDelete();
            $table->double('unidades_minimas')->default(0);
            $table->foreignId('modalidad_id')->constrained('modalidades_venta')->cascadeOnDelete();
            $table->boolean('activa')->default(true);
            $table->timestamps();
            $table->unique(['marca_id', 'modalidad_id']);
        });

        Schema::create('precio_historial', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->foreignId('lista_id')->constrained('listas_venta')->cascadeOnDelete();
            $table->timestamp('fecha')->useCurrent()->index();
            $table->double('precio_anterior')->nullable();
            $table->double('precio')->default(0);
            // inicial · costo · formato_compra · formato_venta · activacion · reversion
            $table->string('origen', 20)->default('costo');
            $table->string('detalle', 300)->default('');
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->index(['producto_id', 'fecha']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('precio_historial');
        Schema::dropIfExists('reglas_marca');
        Schema::dropIfExists('producto_listas');
        Schema::dropIfExists('listas_venta');
        Schema::dropIfExists('modalidades_venta');
    }
};
