<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F3 · COMPRAS, GASTOS Y PAGOS A PROVEEDORES.
 *
 * COMPROBANTES DE COMPRA: lo que el proveedor emite. Tres preguntas definen
 * cada tipo — ¿mueve stock? ¿genera deuda? ¿es fiscal?
 *
 *                  stock         deuda      fiscal
 *   orden_compra    no            no         no
 *   remito          sí (entra)    no         no
 *   factura         sí (entra)    sí         SÍ
 *   liquidacion     sí (entra)    sí         no      ← la mitad sin factura
 *   nota_credito    sí (sale)     resta      SÍ
 *   nota_debito     no            suma       SÍ
 *
 * GASTOS: lo que se paga y no es mercadería, imputado a un rubro. Mismo padrón
 * de proveedores que compras: lo que separa los dos mundos es el documento.
 *
 * PAGOS A PROVEEDORES: un solo registro para toda la plata que sale, salga por
 * donde salga (cajón de la sucursal o transferencia de administración) y contra
 * lo que termine aplicándose (factura de compra o gasto). Reglas:
 *   · la plata sale UNA vez, al crear el pago; imputar no vuelve a mover plata;
 *   · `aplicado` y `pagado` se RECALCULAN sumando imputaciones, nunca deltas;
 *   · un pago solo se imputa a documentos del MISMO proveedor.
 *
 * COMPROMISOS y ECHEQS: el vencimiento como entidad ("esta factura se paga el
 * día X") y la cartera de echeqs propios. AJUSTES: correcciones manuales del
 * estado de cuenta con motivo obligatorio. PEDIDOS: el kanban de coordinación
 * (no toca stock ni deuda).
 */
return new class extends Migration
{
    public function up(): void
    {
        /* ---------------- Ficha operativa del proveedor ---------------- */

        // Percepciones que el proveedor cobra en el pie de su factura (RG 5329, IIBB…).
        Schema::create('proveedor_percepciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();
            $table->string('nombre', 120);
            $table->double('alicuota')->default(0);
            $table->string('base', 10)->default('neto');       // neto|total
            $table->boolean('activa')->default(true);
        });

        // Cuentas bancarias (CBU/alias) a las que se le transfiere.
        Schema::create('proveedor_cuentas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();
            $table->string('cbu_alias', 120)->default('');
            $table->string('descripcion', 120)->default('');
        });

        /* ---------------- Comprobantes de compra ---------------- */

        Schema::create('comprobantes', function (Blueprint $table) {
            $table->id();
            $table->string('tipo', 20);                          // orden_compra|remito|factura|liquidacion|nota_credito|nota_debito
            $table->string('letra', 1)->default('A');
            $table->string('punto_venta', 5)->default('00001');
            $table->unsignedInteger('numero')->nullable();
            // El CAE del papel del proveedor (sale del QR, no se tipea). Solo fiscales.
            $table->string('cae', 32)->default('');
            // La del papel (define el período fiscal) y la de carga (cuándo entró al sistema).
            $table->dateTime('fecha')->useCurrent();
            $table->dateTime('fecha_carga')->useCurrent();
            $table->foreignId('proveedor_id')->constrained('proveedores')->restrictOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->string('estado', 12)->default('confirmado');  // borrador|confirmado|anulado
            $table->string('condicion_pago', 20)->default('cuenta_corriente');
            $table->dateTime('vencimiento_pago')->nullable();
            // Si el documento ingresó (o devolvió, en una NC) mercadería.
            $table->boolean('recepcion')->default(false);
            // El pie: bruto − bonificación = subtotal_neto; + iva + percepciones = total.
            $table->double('bonificacion')->default(0);            // % del papel
            $table->double('bonificacion_importe')->default(0);    // el importe manda
            $table->double('subtotal_neto')->default(0);
            $table->double('iva_total')->default(0);
            $table->double('percepciones_total')->default(0);
            $table->double('total')->default(0);
            // Cuánto ya se le pagó al proveedor por este documento (suma de imputaciones).
            $table->double('pagado')->default(0);
            // NC/ND: la factura que ajustan. Sin FK dura (autorreferencia).
            $table->unsignedBigInteger('ref_comprobante_id')->nullable()->index();
            $table->text('observaciones')->nullable();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamps();

            // El mismo papel no se carga dos veces (los NULL de `numero` no chocan).
            $table->unique(['proveedor_id', 'tipo', 'punto_venta', 'numero'], 'uq_comprobantes_numero');
            $table->index(['proveedor_id', 'estado']);
            $table->index(['tipo', 'estado']);
            $table->index('fecha');
        });

        Schema::create('comprobante_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comprobante_id')->constrained('comprobantes')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->nullOnDelete();
            $table->double('cantidad')->default(0);
            $table->double('costo_unitario')->default(0);
            $table->double('descuento')->default(0);
            $table->double('iva')->default(21);
            $table->double('subtotal')->default(0);                // neto, ya bonificado
            $table->index('comprobante_id');
        });

        // Las percepciones de UN comprobante, con nombre y alícuota COPIADOS.
        Schema::create('comprobante_percepciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comprobante_id')->constrained('comprobantes')->cascadeOnDelete();
            $table->string('nombre', 120);
            $table->double('alicuota')->default(0);
            $table->string('base', 10)->default('neto');
            $table->double('importe')->default(0);
        });

        /* ---------------- Gastos ---------------- */

        Schema::create('gasto_categorias', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 120)->unique();
            $table->string('tipo', 10)->default('variable');      // fijo|variable
            $table->string('descripcion', 300)->default('');
            $table->boolean('activa')->default(true);
            $table->integer('orden')->default(0);
        });

        Schema::create('gastos', function (Blueprint $table) {
            $table->id();
            $table->dateTime('fecha')->useCurrent();
            $table->dateTime('fecha_carga')->useCurrent();
            $table->string('tipo_doc', 15)->default('factura');   // factura|ticket|recibo|nota_credito|otro
            $table->string('letra', 1)->default('B');
            // Libre: los servicios numeran como quieren ("0002-00013456").
            $table->string('numero', 40)->default('');
            // Opcional: el ticket de nafta no justifica un proveedor; queda el texto.
            $table->foreignId('proveedor_id')->nullable()->constrained('proveedores')->restrictOnDelete();
            $table->string('proveedor_texto', 160)->default('');
            $table->foreignId('categoria_id')->constrained('gasto_categorias')->restrictOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->string('descripcion', 500)->default('');
            $table->string('condicion_pago', 20)->default('contado');
            $table->dateTime('vencimiento')->nullable();
            $table->double('neto')->default(0);
            $table->double('iva')->default(0);
            // TODO lo que suma abajo del IVA; las tres de abajo son su detalle.
            $table->double('otros')->default(0);
            $table->double('imp_internos')->default(0);
            $table->double('perc_dgi')->default(0);
            $table->double('perc_dgr')->default(0);
            $table->double('total')->default(0);
            $table->double('pagado')->default(0);
            $table->string('estado', 12)->default('pendiente');   // pendiente|pagado|anulado
            // Si lo generó un gasto fijo, de qué plantilla salió (sin FK: borrar la plantilla no borra la historia).
            $table->unsignedBigInteger('recurrente_id')->nullable()->index();
            $table->text('observaciones')->nullable();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamps();
            $table->index('fecha');
            $table->index(['estado', 'vencimiento']);
            $table->index('categoria_id');
            $table->index('proveedor_id');
        });

        // Los renglones del gasto: concepto + monto, como se leen del papel.
        Schema::create('gasto_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gasto_id')->constrained('gastos')->cascadeOnDelete();
            $table->string('concepto', 200)->default('');
            $table->double('monto')->default(0);
        });

        // Plantilla de lo que se repite todos los meses. No es un gasto: es el recordatorio.
        Schema::create('gastos_recurrentes', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 160);
            $table->foreignId('categoria_id')->constrained('gasto_categorias')->restrictOnDelete();
            $table->foreignId('proveedor_id')->nullable()->constrained('proveedores')->nullOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->double('importe_estimado')->default(0);
            $table->string('frecuencia', 12)->default('mensual'); // mensual|bimestral|trimestral|semestral|anual
            $table->unsignedTinyInteger('dia_vencimiento')->default(10);
            $table->boolean('activo')->default(true);
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });

        // Foto/PDF del comprobante. Tabla aparte para que el listado nunca arrastre los bytes.
        Schema::create('gasto_adjuntos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gasto_id')->constrained('gastos')->cascadeOnDelete();
            $table->string('nombre', 160)->default('');
            $table->string('mime', 60)->default('image/jpeg');
            $table->longText('data');                              // base64 sin prefijo
            $table->dateTime('subido_en')->useCurrent();
        });

        /* ---------------- Pagos a proveedores ---------------- */

        Schema::create('proveedor_pagos', function (Blueprint $table) {
            $table->id();
            $table->dateTime('fecha')->useCurrent();
            // Opcional SOLO para el pago que nace pegado a su documento (gasto sin proveedor).
            $table->foreignId('proveedor_id')->nullable()->constrained('proveedores')->restrictOnDelete();
            $table->string('medio', 20)->default('efectivo');
            $table->double('importe')->default(0);
            // En qué bandeja vive: mercaderia (comprobantes) o gastos.
            $table->string('destino', 12)->default('mercaderia');
            $table->double('aplicado')->default(0);
            // El flete que el proveedor descuenta de su factura (pagado a un tercero por su cuenta).
            $table->boolean('es_flete')->default(false);
            $table->string('concepto', 300)->default('');
            $table->string('referencia', 200)->default('');
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->foreignId('caja_sesion_id')->nullable()->constrained('caja_sesiones')->nullOnDelete();
            $table->foreignId('caja_movimiento_id')->nullable()->constrained('caja_movimientos')->nullOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->string('estado', 10)->default('activo');      // activo|anulado
            $table->text('observaciones')->nullable();
            $table->timestamps();
            $table->index(['proveedor_id', 'estado']);
            $table->index('fecha');
            $table->index('caja_sesion_id');
        });

        // El split multi-forma: SUM(importe) == pago.importe. La parte en efectivo es la del cajón.
        Schema::create('pago_formas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pago_id')->constrained('proveedor_pagos')->cascadeOnDelete();
            $table->string('medio', 20)->default('efectivo');
            $table->double('importe')->default(0);
            $table->dateTime('fecha')->nullable();
        });

        // A qué documento fue cada pago: gasto O comprobante (uno y solo uno).
        Schema::create('proveedor_imputaciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pago_id')->constrained('proveedor_pagos')->cascadeOnDelete();
            $table->foreignId('gasto_id')->nullable()->constrained('gastos')->cascadeOnDelete();
            $table->foreignId('comprobante_id')->nullable()->constrained('comprobantes')->cascadeOnDelete();
            $table->double('importe')->default(0);
            $table->dateTime('fecha')->useCurrent();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
        });

        /* ---------------- Compromisos, echeqs, ajustes ---------------- */

        Schema::create('proveedor_compromisos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proveedor_id')->constrained('proveedores')->restrictOnDelete();
            $table->foreignId('comprobante_id')->nullable()->constrained('comprobantes')->nullOnDelete();
            $table->double('importe')->default(0);
            $table->dateTime('fecha_emision')->useCurrent();
            $table->dateTime('fecha_venc');
            $table->string('origen', 10)->default('manual');      // factura|manual
            $table->boolean('es_echeq')->default(false);
            // "Cuota 2 de 3" cuando la factura vino partida. NULL = único.
            $table->unsignedSmallInteger('cuota')->nullable();
            $table->unsignedSmallInteger('cuotas')->nullable();
            $table->boolean('pagado')->default(false);
            // Qué pago lo cerró: la llave para REABRIRLO si ese pago se anula.
            $table->foreignId('pago_id')->nullable()->constrained('proveedor_pagos')->nullOnDelete();
            $table->string('obs', 300)->default('');
            $table->timestamps();
            $table->index(['pagado', 'fecha_venc']);
            $table->index(['proveedor_id', 'pagado']);
        });

        Schema::create('proveedor_echeqs', function (Blueprint $table) {
            $table->id();
            $table->string('numero', 40)->default('');
            $table->string('banco', 100)->default('');
            $table->double('importe')->default(0);
            $table->dateTime('fecha_emision')->useCurrent();
            $table->dateTime('fecha_venc');
            $table->foreignId('proveedor_id')->constrained('proveedores')->restrictOnDelete();
            $table->foreignId('compromiso_id')->nullable()->constrained('proveedor_compromisos')->nullOnDelete();
            $table->foreignId('pago_id')->nullable()->constrained('proveedor_pagos')->nullOnDelete();
            $table->string('estado', 10)->default('emitido');     // emitido|entregado|cobrado|anulado
            $table->text('obs')->nullable();
            $table->timestamps();
            $table->index(['estado', 'fecha_venc']);
        });

        // Ajustes manuales del estado de cuenta. Importe CON SIGNO (+debe / −haber) y motivo obligatorio.
        Schema::create('proveedor_ajustes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();
            $table->double('importe');
            $table->string('motivo', 500);
            $table->dateTime('fecha')->useCurrent();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamps();
        });

        /* ---------------- Pedidos (kanban) ---------------- */

        Schema::create('pedidos_proveedor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();
            $table->string('estado', 12)->default('solicitado');  // solicitado|pedido|recibido|retomar
            $table->text('notas')->nullable();
            $table->dateTime('fecha_alta')->useCurrent();
            $table->dateTime('fecha_pedido')->nullable();
            $table->dateTime('fecha_recepcion')->nullable();
            $table->boolean('pedido_enviado')->default(false);
            $table->dateTime('revisado_at')->nullable();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->index(['estado', 'proveedor_id']);
        });

        // El comprobante que originó cada cambio de costo (recepción), ahora con FK.
        Schema::table('producto_proveedor_costos', function (Blueprint $table) {
            $table->foreign('comprobante_id')->references('id')->on('comprobantes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('producto_proveedor_costos', function (Blueprint $table) {
            $table->dropForeign(['comprobante_id']);
        });
        foreach ([
            'pedidos_proveedor', 'proveedor_ajustes', 'proveedor_echeqs', 'proveedor_compromisos', 'proveedor_imputaciones',
            'pago_formas', 'proveedor_pagos', 'gasto_adjuntos', 'gastos_recurrentes', 'gasto_items', 'gastos', 'gasto_categorias',
            'comprobante_percepciones', 'comprobante_items', 'comprobantes', 'proveedor_cuentas', 'proveedor_percepciones',
        ] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
