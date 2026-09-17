<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PROVEEDORES y el FORMATO DE COMPRA de cada producto (`producto_proveedores`):
 * cómo viene la mercadería (caja x12), a qué costo, con qué descuentos y flete.
 * Un producto puede tener varios formatos y uno solo fija el precio
 * (`usar_para_precio`). Todo cambio de costo queda en
 * `producto_proveedor_costos` (append-only): habilita la auditoría y el
 * deshacer por lote.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proveedores', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 160);
            $table->string('cuit', 20)->default('');
            // Define si su factura discrimina IVA (un monotributista no lo hace).
            $table->string('condicion_iva', 30)->default('responsable_inscripto');
            $table->string('direccion', 200)->default('');
            $table->string('telefono', 60)->default('');
            $table->string('email', 120)->default('');
            // Qué le compramos: mercadería (Compras) y/o servicios (Gastos).
            $table->boolean('provee_mercaderia')->default(true);
            $table->boolean('provee_gastos')->default(false);
            // Letra del comprobante de gasto que emite (A/B/C/X), si aplica.
            $table->string('letra_gasto', 1)->nullable();
            // Qué documento emite: factura, liquidación (la mitad sin factura) o mixto.
            $table->string('condicion_compra', 20)->default('factura');
            $table->double('porc_sin_factura')->default(0);
            // Ficha comercial: cómo se le paga habitualmente y a cuántos días.
            $table->string('medio_habitual', 20)->nullable();
            $table->integer('dias_pago')->nullable();
            // 'facturas' (la cuenta se imputa documento a documento) o 'libre' (saldo corrido).
            $table->string('modo_cuenta', 20)->default('facturas');
            $table->timestamp('conciliado_hasta')->nullable();
            $table->foreignId('conciliado_por')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamp('conciliado_at')->nullable();
            // Ayudas del importador de catálogo.
            $table->integer('productos_esperados')->default(0);
            $table->boolean('migracion_lista')->default(false);
            $table->timestamps();
        });

        Schema::create('producto_proveedores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();
            // Unidades (o kg) que trae el formato: caja x12 → 12.
            $table->double('cantidad')->default(1);
            // Costo de lista del formato completo, neto de IVA.
            $table->double('costo')->default(0);
            // Descuentos en cascada (% cada uno).
            $table->double('descuento')->default(0);
            $table->double('descuento2')->default(0);
            $table->double('descuento3')->default(0);
            $table->double('descuento4')->default(0);
            // Flete por formato, neto.
            $table->double('flete')->default(0);
            // 'lista' (se carga el de lista y se descuenta) o 'final' (se carga el final directo).
            $table->string('modo_costo', 10)->default('lista');
            $table->double('costo_final')->default(0);
            $table->double('porc_sin_factura')->default(0);
            // El formato ACTIVO: el único que fija costo y precios del producto.
            $table->boolean('usar_para_precio')->default(false);
            $table->string('codigo_proveedor', 60)->default('');
            $table->timestamps();

            // SIN único (producto, proveedor): el mismo proveedor puede vender el
            // mismo producto en dos formatos (caja x12 y caja x24).
            $table->index('producto_id');
            $table->index('proveedor_id');
        });

        // El artículo como lo llama el proveedor en SU factura: mapeo código → producto nuestro.
        Schema::create('proveedor_articulos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();
            $table->string('codigo', 80);
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->string('descripcion', 200)->default('');
            $table->timestamps();
            $table->unique(['proveedor_id', 'codigo']);
        });

        Schema::create('producto_proveedor_costos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_proveedor_id')->constrained('producto_proveedores')->cascadeOnDelete();
            $table->timestamp('fecha')->useCurrent();
            $table->double('costo_anterior')->default(0);
            $table->double('descuento_anterior')->default(0);
            $table->double('flete_anterior')->default(0);
            $table->double('costo')->default(0);
            $table->double('descuento')->default(0);
            $table->double('flete')->default(0);
            // alta · manual · masiva · recepcion · reversion
            $table->string('origen', 20)->default('manual');
            // Cambio de PROVEEDOR ACTIVO: mueve el precio tanto como un cambio de costo. Nulos = no tocó el activo.
            $table->unsignedBigInteger('activo_anterior')->nullable();
            $table->unsignedBigInteger('activo_nuevo')->nullable();
            $table->string('motivo', 300)->default('');
            // Tanda de actualización masiva: permite deshacer en bloque.
            $table->string('lote', 40)->default('')->index();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            // Comprobante de compra que originó el cambio (recepción). FK se agrega en F3.
            $table->unsignedBigInteger('comprobante_id')->nullable();

            $table->index(['producto_proveedor_id', 'fecha']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producto_proveedor_costos');
        Schema::dropIfExists('proveedor_articulos');
        Schema::dropIfExists('producto_proveedores');
        Schema::dropIfExists('proveedores');
    }
};
