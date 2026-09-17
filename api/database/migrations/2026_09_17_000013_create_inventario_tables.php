<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * INVENTARIO. Modelo de stock SIN LOTE: Producto × Sucursal × Presentación × Estado.
 * `movimientos` es la bitácora inmutable (kardex); transferencias, incidencias
 * y conteos son los documentos que la alimentan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock', function (Blueprint $table) {
            $table->id();
            // RESTRICT: no se borra un producto con existencias.
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('sucursal_id')->constrained('sucursales')->cascadeOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->cascadeOnDelete();
            /*
             * disponible · comprometido · retenido · defectuoso · vencido ·
             * en_transito (despachado y no recibido: queda EN EL ORIGEN, la
             * responsabilidad es del que despachó hasta que el destino firme).
             */
            $table->string('estado', 20)->default('disponible');
            $table->double('cantidad')->default(0);
            $table->timestamps();

            // Una fila por combinación. COALESCE porque dos NULL no chocan en un UNIQUE.
            $table->unsignedBigInteger('presentacion_key')->storedAs('COALESCE(presentacion_id, 0)');
            $table->unique(['producto_id', 'sucursal_id', 'presentacion_key', 'estado'], 'uq_stock_forma');
            $table->index(['sucursal_id', 'estado']);
        });

        Schema::create('movimientos', function (Blueprint $table) {
            $table->id();
            $table->timestamp('fecha')->useCurrent()->index();
            /*
             * compra · fraccionamiento · venta_granel · venta_fraccionada ·
             * devolucion · ajuste · merma · vencido · defectuoso · transferencia
             */
            $table->string('tipo', 20)->index();
            $table->foreignId('producto_id')->nullable()->constrained('productos')->nullOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->nullOnDelete();
            // +1 entra, -1 sale, 0 cambio de estado.
            $table->smallInteger('signo')->default(0);
            $table->double('cantidad')->default(0);
            $table->string('unidad', 10)->default('');
            $table->string('motivo', 300)->default('');
            // Foto del nombre de la presentación ("500 g"), por si después cambia.
            $table->string('pres_label', 60)->default('');
            $table->string('estado_desde', 20)->nullable();
            $table->string('estado_hacia', 20)->nullable();
            $table->foreignId('sucursal_destino_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->timestamp('vencimiento')->nullable();
            // Costo al momento del movimiento: la valorización no se recalcula con el costo de hoy.
            $table->double('costo_unitario')->default(0);
            $table->string('proveedor_nombre', 160)->default('');
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->unsignedBigInteger('ref_transferencia_id')->nullable();
            $table->unsignedBigInteger('ref_incidencia_id')->nullable();
            $table->unsignedBigInteger('ref_conteo_id')->nullable();
            $table->string('descripcion', 300)->default('');

            $table->index(['producto_id', 'fecha']);
            $table->index(['sucursal_id', 'fecha']);
        });

        /*
         * CONTROL DE STOCK: el físico contra el virtual. Se abre una sesión de
         * conteo (ciega o no), se cuenta, se cierra, se revisan diferencias y
         * se APLICAN como ajustes. Un conteo aplicado es historia contable.
         */
        Schema::create('conteos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sucursal_id')->constrained('sucursales')->restrictOnDelete();
            $table->string('nombre', 120)->default('');
            // Qué se cuenta: todo, una categoría, una marca… (texto descriptivo/filtro).
            $table->string('alcance', 200)->default('');
            // Ciego: el que cuenta no ve el virtual.
            $table->boolean('ciego')->default(true);
            // en_curso · cerrado · aplicado · descartado
            $table->string('estado', 20)->default('en_curso');
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamp('cerrado_en')->nullable();
            $table->timestamp('aplicado_en')->nullable();
            $table->foreignId('aplicado_por')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamps();
            $table->index(['sucursal_id', 'estado']);
        });

        Schema::create('conteo_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conteo_id')->constrained('conteos')->cascadeOnDelete();
            // RESTRICT: el conteo ES huella.
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->restrictOnDelete();
            $table->string('nombre', 200)->default('');
            $table->string('pres_label', 60)->default('');
            $table->string('unidad', 10)->default('u');
            $table->double('contado')->nullable();
            // El virtual en el momento de contar: la diferencia se calcula contra esto, no contra hoy.
            $table->double('virtual_al_contar')->nullable();
            $table->foreignId('contado_por')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamp('contado_en')->nullable();
            $table->boolean('recontar')->default(false);

            $table->unsignedBigInteger('presentacion_key')->storedAs('COALESCE(presentacion_id, 0)');
            $table->unique(['conteo_id', 'producto_id', 'presentacion_key'], 'uq_conteo_items_forma');
        });

        Schema::create('transferencias', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->default('');
            $table->timestamp('fecha')->useCurrent();
            $table->foreignId('origen_id')->constrained('sucursales')->restrictOnDelete();
            $table->foreignId('destino_id')->constrained('sucursales')->restrictOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            // borrador · pendiente · preparada · transito · recibida · cancelada
            $table->string('estado', 20)->default('pendiente')->index();
            $table->string('observaciones', 500)->default('');
            // Preparación en dos listas: enteros (el que prepara) y granel (el que fracciona).
            $table->boolean('enteros_listo')->default(false);
            $table->boolean('granel_listo')->default(false);
            $table->timestamps();
        });

        Schema::create('transferencia_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transferencia_id')->constrained('transferencias')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->nullOnDelete();
            $table->double('cantidad')->default(0);
            $table->double('cantidad_preparada')->default(0);
            // NULL hasta que el destino firme.
            $table->double('cantidad_recibida')->nullable();
            // Renglón agregado durante la preparación (no venía en el pedido).
            $table->boolean('agregado')->default(false);
            $table->string('motivo', 300)->default('');
            $table->double('costo_unitario')->default(0);
        });

        Schema::create('transferencia_hist', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transferencia_id')->constrained('transferencias')->cascadeOnDelete();
            $table->string('estado', 20);
            $table->timestamp('fecha')->useCurrent();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
        });

        Schema::create('incidencias', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->default('');
            $table->timestamp('fecha')->useCurrent();
            // Texto libre catalogado en la UI: faltante, rotura, vencido, diferencia…
            $table->string('tipo', 40);
            // pendiente · revision · resuelta
            $table->string('estado', 20)->default('pendiente')->index();
            $table->foreignId('responsable_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->string('motivo', 500)->default('');
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('sucursal_id')->constrained('sucursales')->cascadeOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->nullOnDelete();
            $table->double('cantidad')->default(0);
            $table->string('unidad', 10)->default('');
            $table->string('resolucion', 500)->nullable();
            $table->timestamp('fecha_resolucion')->nullable();
            $table->boolean('activa')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incidencias');
        Schema::dropIfExists('transferencia_hist');
        Schema::dropIfExists('transferencia_items');
        Schema::dropIfExists('transferencias');
        Schema::dropIfExists('conteo_items');
        Schema::dropIfExists('conteos');
        Schema::dropIfExists('movimientos');
        Schema::dropIfExists('stock');
    }
};
