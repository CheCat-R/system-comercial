<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F2 · CAJA, VENTAS Y COBRANZAS.
 *
 * CAJA: el turno es lo primero del punto de venta. Una sola sesión abierta por
 * sucursal (candado en la base con columna generada). No se borra ni se
 * reabre: se cierra con su arqueo y queda como registro.
 *
 * VENTAS: tabla propia con numeración asignada por el sistema (o por ARCA) y
 * estado que no vuelve atrás. Los BORRADORES del POS viven acá con `numero`
 * NULL: no consumen numeración, no tocan stock ni caja. Las notas de crédito
 * son ventas con `ref_venta_id` y signo negativo en las sumas.
 *
 * Convención de importes: precios NETOS (sin IVA); el IVA se suma aparte.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('caja_sesiones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sucursal_id')->constrained('sucursales')->restrictOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->dateTime('apertura')->useCurrent();
            $table->double('monto_inicial')->default(0);
            $table->dateTime('cierre')->nullable();
            $table->double('declarado_efectivo')->default(0);
            $table->double('sistema_efectivo')->default(0);
            $table->double('diferencia')->default(0);
            $table->json('totales')->nullable();                   // foto del cierre
            $table->string('estado', 10)->default('abierta');      // abierta|cerrada
            $table->text('observaciones')->nullable();
            $table->timestamps();
            $table->index(['sucursal_id', 'estado']);
            // UNA sola abierta por sucursal: NULL cuando está cerrada, y los NULL no chocan.
            $table->unsignedBigInteger('abierta_en')->nullable()
                ->storedAs("IF(estado = 'abierta', sucursal_id, NULL)");
            $table->unique('abierta_en', 'uq_caja_abierta_por_sucursal');
        });

        Schema::create('caja_movimientos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('caja_sesion_id')->constrained('caja_sesiones')->cascadeOnDelete();
            $table->dateTime('fecha')->useCurrent();
            $table->string('tipo', 10);                            // ingreso|egreso
            $table->string('motivo', 200)->default('');
            $table->double('importe')->default(0);
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
        });

        Schema::create('caja_controles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('caja_sesion_id')->constrained('caja_sesiones')->cascadeOnDelete();
            $table->dateTime('fecha')->useCurrent();
            $table->double('esperado_efectivo')->default(0);
            $table->double('contado_efectivo')->default(0);
            $table->double('diferencia')->default(0);
            $table->string('observaciones', 300)->default('');
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
        });

        Schema::create('ventas', function (Blueprint $table) {
            $table->id();
            $table->string('tipo', 20)->default('ticket');        // ticket|factura_a|…|nota_credito_c|nota_debito_c
            $table->string('punto_venta', 5)->default('00001');
            $table->unsignedInteger('numero')->nullable();        // se asigna al CONFIRMAR
            $table->dateTime('fecha')->useCurrent()->index();
            $table->foreignId('cliente_id')->constrained('clientes')->restrictOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->foreignId('caja_sesion_id')->nullable()->constrained('caja_sesiones')->nullOnDelete();
            $table->string('estado', 15)->default('confirmada');  // borrador|confirmada|anulada|pendiente_cae
            $table->string('condicion_pago', 20)->default('contado');
            $table->dateTime('vencimiento_pago')->nullable();
            $table->unsignedBigInteger('presupuesto_id')->nullable();
            $table->string('lista_precio', 80)->default('');
            $table->double('subtotal_neto')->default(0);
            $table->double('descuento_total')->default(0);
            $table->double('iva_total')->default(0);
            $table->double('total')->default(0);
            // Facturación electrónica.
            $table->string('cae', 20)->default('');
            $table->dateTime('cae_vencimiento')->nullable();
            $table->boolean('facturar_pendiente')->default(false);
            $table->text('facturar_motivo')->nullable();
            $table->unsignedInteger('facturar_cbte_nro')->nullable();
            $table->unsignedInteger('facturar_cbte_tipo')->nullable();
            $table->unsignedBigInteger('ref_venta_id')->nullable()->index();  // NC/ND → venta que ajustan
            $table->text('observaciones')->nullable();
            $table->foreignId('anulado_por')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->dateTime('anulado_en')->nullable();
            $table->string('anulado_motivo', 300)->default('');
            $table->foreignId('cobrado_por')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamps();
            $table->index(['sucursal_id', 'estado']);
            $table->index(['facturar_pendiente', 'estado']);
            // Parcial: varios borradores sin número conviven; los emitidos no se repiten.
            $table->unique(['tipo', 'punto_venta', 'numero'], 'uq_ventas_numero');
        });

        Schema::create('venta_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venta_id')->constrained('ventas')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->nullOnDelete();
            $table->double('cantidad')->default(0);
            $table->foreignId('lista_id')->nullable()->constrained('listas_venta')->nullOnDelete();
            $table->string('lista', 80)->default('');             // nombre CONGELADO
            $table->string('lista_origen', 15)->default('base');  // base|cliente|auto|manual|marca|monto|presupuesto
            $table->double('precio_lista')->default(0);
            $table->double('descuento')->default(0);              // % cobrado
            $table->double('precio_unitario')->default(0);
            $table->double('iva')->default(21);
            $table->foreignId('oferta_id')->nullable()->constrained('ofertas')->nullOnDelete();
            $table->string('oferta', 120)->default('');
            $table->double('oferta_descuento')->default(0);       // importe NETO
            $table->foreignId('descuento_id')->nullable()->constrained('descuentos')->nullOnDelete();
            $table->string('descuento_nombre', 60)->default('');
            $table->double('descuento_base')->default(0);         // el propio del renglón, antes del nombrado
            $table->double('subtotal')->default(0);
            // El costo CONGELADO al vender (margen real = neto − costo).
            $table->double('costo_unitario')->nullable();
            $table->double('iva_absorbido_unitario')->nullable();
            $table->double('porc_sin_factura')->nullable();
            $table->unsignedBigInteger('ref_item_id')->nullable();
        });

        Schema::create('venta_extras', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venta_id')->constrained('ventas')->cascadeOnDelete();
            $table->string('concepto', 120)->default('');
            $table->double('importe')->default(0);                // neto
            $table->double('iva')->default(21);
        });

        Schema::create('venta_pagos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venta_id')->constrained('ventas')->cascadeOnDelete();
            $table->string('medio', 20)->default('efectivo');
            $table->double('importe')->default(0);
            $table->string('referencia', 120)->default('');
        });

        Schema::create('cobranzas', function (Blueprint $table) {
            $table->id();
            $table->string('punto_venta', 5)->default('00001');
            $table->unsignedInteger('numero')->default(0);
            $table->dateTime('fecha')->useCurrent();
            $table->foreignId('cliente_id')->constrained('clientes')->restrictOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->foreignId('caja_sesion_id')->nullable()->constrained('caja_sesiones')->nullOnDelete();
            $table->double('total')->default(0);
            $table->double('a_cuenta')->default(0);
            $table->string('estado', 15)->default('confirmada');  // confirmada|anulada
            $table->text('observaciones')->nullable();
            $table->foreignId('anulado_por')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->dateTime('anulado_en')->nullable();
            $table->string('anulado_motivo', 300)->default('');
            $table->timestamps();
            $table->unique(['punto_venta', 'numero'], 'uq_cobranzas_numero');
        });

        Schema::create('cobranza_pagos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cobranza_id')->constrained('cobranzas')->cascadeOnDelete();
            $table->string('medio', 20)->default('efectivo');
            $table->double('importe')->default(0);
            $table->string('referencia', 120)->default('');
        });

        Schema::create('cobranza_imputaciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cobranza_id')->constrained('cobranzas')->cascadeOnDelete();
            $table->foreignId('venta_id')->constrained('ventas')->restrictOnDelete();
            $table->double('importe')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cobranza_imputaciones');
        Schema::dropIfExists('cobranza_pagos');
        Schema::dropIfExists('cobranzas');
        Schema::dropIfExists('venta_pagos');
        Schema::dropIfExists('venta_extras');
        Schema::dropIfExists('venta_items');
        Schema::dropIfExists('ventas');
        Schema::dropIfExists('caja_controles');
        Schema::dropIfExists('caja_movimientos');
        Schema::dropIfExists('caja_sesiones');
    }
};
