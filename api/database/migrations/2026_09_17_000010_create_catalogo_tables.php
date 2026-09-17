<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CATÁLOGO DE PRODUCTOS — marca, categoría › subcategoría, etiquetas, producto
 * y sus presentaciones (los tamaños fraccionados de un granel).
 *
 * Marca/categoría/etiqueta son entidades con id y no texto suelto: renombrar
 * no rompe nada, "Cachafaz" y "CACHAFAZ" no son dos marcas, y las reglas que
 * apuntan a una marca sobreviven al cambio de nombre. Se dan de baja
 * (`activa = false`), no se borran: hay ventas viejas que las referencian.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marcas', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 120)->unique();
            $table->boolean('activa')->default(true);
            $table->timestamps();
        });

        Schema::create('categorias', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 120)->unique();
            $table->boolean('activa')->default(true);
            $table->timestamps();
        });

        Schema::create('subcategorias', function (Blueprint $table) {
            $table->id();
            $table->foreignId('categoria_id')->constrained('categorias')->cascadeOnDelete();
            $table->string('nombre', 120);
            $table->boolean('activa')->default(true);
            $table->timestamps();
            // El mismo nombre puede repetirse en otra categoría: la unicidad es por par.
            $table->unique(['categoria_id', 'nombre']);
        });

        Schema::create('etiquetas', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 120)->unique();
            $table->string('color', 20)->default('');
            $table->boolean('activa')->default(true);
            $table->timestamps();
        });

        Schema::create('productos', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 200);
            $table->text('descripcion')->nullable();

            // Códigos. El vacío es "sin código" y puede repetirse cuanto haga falta.
            $table->string('codigo_propio', 60)->default('')->index();
            $table->string('codigo_barras', 60)->default('')->index();
            // DUN-14 del bulto (caja): lo que se escanea al recibir.
            $table->string('dun', 60)->default('');
            $table->double('unidades_por_bulto')->default(1);

            // Texto que va en la etiqueta de góndola, si difiere del nombre/marca.
            $table->string('etiqueta_marca', 120)->nullable();
            $table->string('etiqueta_nombre', 200)->nullable();

            $table->foreignId('marca_id')->nullable()->constrained('marcas')->nullOnDelete();
            $table->foreignId('categoria_id')->nullable()->constrained('categorias')->nullOnDelete();
            $table->foreignId('subcategoria_id')->nullable()->constrained('subcategorias')->nullOnDelete();

            $table->double('iva')->default(21);
            // 'granel' (se fracciona en presentaciones) o 'entero'.
            $table->string('tipo', 10)->default('entero');

            /*
             * CICLO DE VIDA: activo → discontinuado (no se compra más pero se
             * sigue vendiendo hasta agotar) → archivado (fuera de catálogo).
             * Reactivar conserva todo.
             */
            $table->string('estado', 20)->default('activo')->index();
            $table->timestamp('estado_desde')->nullable();
            $table->string('motivo_baja', 300)->default('');
            // Granel que sólo se vende fraccionado (nunca a granel en el POS).
            $table->boolean('solo_fraccionar')->default(false);
            $table->double('stock_min')->default(0);
            // Redondeo de góndola propio del producto (null = el general).
            $table->integer('redondeo')->nullable();

            // Sitio web.
            $table->boolean('publicado')->default(false);
            $table->string('id_externo', 60)->default('');
            $table->string('imagen_url', 500)->default('');
            $table->boolean('destacado')->default(false);
            $table->double('web_stock_min')->default(0);

            $table->timestamps();

            // Únicos parciales: NULL cuando no hay código.
            $table->string('codigo_propio_unico', 60)->nullable()->storedAs("NULLIF(codigo_propio, '')")->unique();
            $table->string('codigo_barras_unico', 60)->nullable()->storedAs("NULLIF(codigo_barras, '')")->unique();
            $table->string('dun_unico', 60)->nullable()->storedAs("NULLIF(dun, '')")->unique();
        });

        Schema::create('producto_etiquetas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->foreignId('etiqueta_id')->constrained('etiquetas')->cascadeOnDelete();
            $table->unique(['producto_id', 'etiqueta_id']);
        });

        // Cada tamaño fraccionado de un granel lleva su propia etiqueta, así que su propio código.
        Schema::create('presentaciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->double('tam_kg');
            $table->string('codigo_barras', 60)->default('')->index();
            $table->timestamps();
            $table->string('codigo_barras_unico', 60)->nullable()->storedAs("NULLIF(codigo_barras, '')")->unique();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('presentaciones');
        Schema::dropIfExists('producto_etiquetas');
        Schema::dropIfExists('productos');
        Schema::dropIfExists('etiquetas');
        Schema::dropIfExists('subcategorias');
        Schema::dropIfExists('categorias');
        Schema::dropIfExists('marcas');
    }
};
