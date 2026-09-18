<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F2 · CLIENTES, OFERTAS Y DESCUENTOS CON NOMBRE.
 *
 * El cliente concentra las reglas que la venta consulta después (letra del
 * comprobante, listas, crédito). Existe SIEMPRE un "Consumidor Final" genérico
 * y un cliente con historial nunca se borra (baja lógica).
 *
 * Ofertas: la definición vive acá, la aplicación en vivo la hace el motor del
 * POS y el servidor la ACOTA al confirmar. Una sola oferta por renglón.
 *
 * Descuentos con nombre: autorizaciones que el dueño crea de antemano
 * ("Empleados") y la cajera elige. Uno por lista de precios.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clientes', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 160)->index();               // razón social
            $table->string('nombre_fantasia', 160)->default('');
            $table->string('tipo_doc', 20)->default('dni');       // cuit|cuil|dni|sin_identificar
            $table->string('numero_doc', 20)->default('');
            $table->string('condicion_iva', 30)->default('consumidor_final');
            $table->string('direccion', 200)->default('');
            $table->string('localidad', 120)->default('');
            $table->string('telefono', 60)->default('');
            $table->string('email', 160)->default('');
            $table->double('descuento')->default(0);              // % general del cliente
            $table->foreignId('vendedor_id')->nullable()->constrained('usuarios')->nullOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->nullOnDelete();
            $table->boolean('cta_cte_habilitada')->default(false);
            $table->double('limite_credito')->default(0);         // 0 = sin tope
            $table->integer('dias_plazo')->default(0);
            $table->text('observaciones')->nullable();
            $table->boolean('activo')->default(true);
            $table->boolean('es_consumidor_final')->default(false);
            $table->timestamps();
            $table->index(['tipo_doc', 'numero_doc']);
        });

        /** Listas predeterminadas del cliente: puede tener varias. */
        Schema::create('cliente_listas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->constrained('clientes')->cascadeOnDelete();
            $table->foreignId('lista_id')->constrained('listas_venta')->cascadeOnDelete();
            $table->unique(['cliente_id', 'lista_id']);
        });

        Schema::create('ofertas', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 120);
            $table->string('tipo', 20);                            // porcentaje|precio_fijo|nxm|segunda_unidad|pack|combo|ticket
            $table->double('porcentaje')->default(0);
            $table->double('precio')->default(0);                  // FINAL con IVA
            $table->double('lleva')->default(0);
            $table->double('paga')->default(0);
            $table->double('monto_minimo')->default(0);
            $table->dateTime('desde')->nullable();
            $table->dateTime('hasta')->nullable();
            $table->string('dias', 7)->default('');                // máscara lunes→domingo, '' = todos
            $table->string('sucursales', 100)->default('');        // CSV, '' = todas
            $table->string('medios_pago', 200)->default('');       // solo ticket, CSV
            $table->string('listas', 100)->default('');            // CSV de listas, '' = todas
            $table->boolean('incluye_fraccionados')->default(false);
            $table->boolean('activa')->default(true);
            $table->timestamps();
        });

        Schema::create('oferta_alcances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('oferta_id')->constrained('ofertas')->cascadeOnDelete();
            $table->string('tipo', 20);                            // producto|marca|categoria|etiqueta|presentacion
            $table->unsignedBigInteger('ref_id');
            $table->unique(['oferta_id', 'tipo', 'ref_id'], 'uq_oferta_alcance');
        });

        Schema::create('oferta_componentes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('oferta_id')->constrained('ofertas')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->double('cantidad')->default(1);
            $table->unique(['oferta_id', 'producto_id'], 'uq_oferta_componente');
        });

        Schema::create('descuentos', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 60)->unique();
            $table->double('porcentaje')->default(0);
            $table->dateTime('vence')->nullable();                 // instante FINAL del día elegido
            $table->string('medio_pago', 20)->nullable();          // null = cualquiera; con valor, pago ÍNTEGRO
            $table->foreignId('lista_id')->constrained('listas_venta')->restrictOnDelete();
            $table->foreignId('sucursal_id')->nullable()->constrained('sucursales')->cascadeOnDelete();
            $table->boolean('requiere_admin')->default(false);
            $table->boolean('activo')->default(true);
            $table->timestamps();
            $table->index(['activo', 'lista_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('descuentos');
        Schema::dropIfExists('oferta_componentes');
        Schema::dropIfExists('oferta_alcances');
        Schema::dropIfExists('ofertas');
        Schema::dropIfExists('cliente_listas');
        Schema::dropIfExists('clientes');
    }
};
