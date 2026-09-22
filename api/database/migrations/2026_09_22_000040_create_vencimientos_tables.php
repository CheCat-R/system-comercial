<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * VENCIMIENTOS — el vigía de fechas, sin lote (Almacén › Vencimientos).
 *
 * El modelo en tres actos: CONTROL (una sesión anota "N unidades de X vencen
 * tal día", con el costo del formato activo CONGELADO ese día — la pérdida de
 * marzo no cambia en julio porque subió el catálogo), OFERTA (el registro se
 * ata a una oferta armada en el motor de Ventas, nunca arma la suya propia) y
 * PROCESAR (el cierre: cuántas se vendieron, cuántas se perdieron, con la baja
 * real de stock opcional en la misma transacción).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vencimiento_sesiones', function (Blueprint $table) {
            $table->id();
            $table->timestamp('fecha')->useCurrent();
            $table->foreignId('sucursal_id')->constrained('sucursales')->restrictOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->integer('total_items')->default(0);
            $table->double('total_unidades')->default(0);
            $table->index('fecha');
        });

        Schema::create('vencimientos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->foreignId('presentacion_id')->nullable()->constrained('presentaciones')->restrictOnDelete();
            $table->foreignId('sucursal_id')->constrained('sucursales')->restrictOnDelete();
            $table->foreignId('sesion_id')->nullable()->constrained('vencimiento_sesiones')->nullOnDelete();
            // DATE pelado, sin zona: es la fecha impresa en el paquete, no un instante.
            $table->date('fecha_vencimiento');
            $table->double('cantidad')->default(0);
            // Congelado al registrar, con el costo real del formato activo de ese día.
            $table->double('costo_unitario')->default(0);
            // Snapshot para listar y exportar sin joins (patrón pedidos de cafetería).
            $table->string('nombre', 200)->default('');
            $table->string('unidad', 10)->default('');
            $table->string('codigo_barras', 60)->default('');
            $table->string('observaciones', 300)->default('');
            // El cierre del ciclo: venció → se procesa. La pérdida REAL es costo × (cantidad − vendidas).
            $table->double('unidades_vendidas')->default(0);
            $table->boolean('procesado')->default(false);
            $table->timestamp('procesado_en')->nullable();
            // La baja real generada al procesar (movimiento 'vencido'), si se generó.
            $table->foreignId('merma_movimiento_id')->nullable()->constrained('movimientos')->nullOnDelete();
            // La oferta REAL armada desde este registro (Ventas › Ofertas, aplica en caja).
            $table->foreignId('oferta_id')->nullable()->constrained('ofertas')->nullOnDelete();
            $table->foreignId('usuario_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->timestamps();

            $table->index(['fecha_vencimiento', 'procesado']);
            $table->index(['sucursal_id', 'procesado']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vencimientos');
        Schema::dropIfExists('vencimiento_sesiones');
    }
};
