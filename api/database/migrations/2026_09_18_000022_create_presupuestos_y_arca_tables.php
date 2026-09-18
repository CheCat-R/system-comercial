<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F2 · PRESUPUESTOS (pedidos mayoristas) y el cache de tickets de ARCA.
 *
 * El presupuesto NO es fiscal ni toca la caja: es la palabra dada al cliente,
 * con ciclo borrador → enviado → confirmado (reserva stock) → cerrado (venta) |
 * cancelado. `pendiente` es exclusivo de los pedidos web.
 *
 * `arca_tokens`: el ticket de acceso (WSAA) dura ~12 h y ARCA RECHAZA pedir
 * otro mientras haya uno vigente, así que guardarlo es obligatorio.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('presupuestos', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->default('');
            $table->dateTime('fecha')->useCurrent();
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->restrictOnDelete();
            $table->foreignId('sucursal_id')->constrained('sucursales')->restrictOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->foreignId('vendedor_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->string('estado', 15)->default('borrador');   // borrador|enviado|confirmado|cerrado|cancelado|pendiente
            $table->string('entrega', 15)->default('retiro');    // retiro|cadete|camioneta
            $table->dateTime('vencimiento')->nullable();
            $table->foreignId('venta_id')->nullable()->constrained('ventas')->nullOnDelete();
            $table->boolean('reservado')->default(false);
            $table->string('origen', 10)->default('manual');     // manual|web
            $table->json('web_cliente')->nullable();
            $table->text('observaciones')->nullable();
            $table->double('subtotal_neto')->default(0);
            $table->double('iva_total')->default(0);
            $table->double('total')->default(0);
            $table->timestamps();
            $table->index(['estado', 'origen']);
        });

        Schema::create('presupuesto_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('presupuesto_id')->constrained('presupuestos')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->nullOnDelete();
            $table->string('nombre', 200)->default('');
            $table->string('detalle', 200)->default('');
            $table->double('cantidad')->default(0);
            $table->double('cantidad_armada')->nullable();
            $table->double('precio_lista')->default(0);           // NETO unitario congelado
            $table->double('descuento')->default(0);
            $table->double('iva')->default(21);
            $table->string('lista', 80)->default('');
            $table->foreignId('lista_id')->nullable()->constrained('listas_venta')->nullOnDelete();
            $table->string('oferta_nombre', 120)->default('');
            $table->string('motivo', 200)->default('');
        });

        Schema::create('arca_tokens', function (Blueprint $table) {
            $table->string('service', 60)->primary();
            $table->text('token');
            $table->text('sign');
            $table->dateTime('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arca_tokens');
        Schema::dropIfExists('presupuesto_items');
        Schema::dropIfExists('presupuestos');
    }
};
