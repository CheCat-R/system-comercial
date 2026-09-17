<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sucursales', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 80);
            // 'distribuidora' (la central/depósito) o 'express' (local de venta).
            $table->string('tipo', 20)->default('express');
            /*
             * El punto de venta de ARCA de este local, cinco dígitos con ceros a la
             * izquierda (por eso string). Vacío = todavía no cargado.
             */
            $table->string('punto_venta', 5)->default('');
            // El domicilio comercial declarado en ARCA para ese punto de venta: va impreso en la factura.
            $table->string('direccion', 200)->default('');
            $table->timestamps();

            /*
             * Índices únicos PARCIALES (no existen en MySQL/MariaDB): se resuelven con
             * columnas generadas que valen NULL cuando la fila no participa.
             *  - Dos sucursales con el mismo punto de venta pedirían el mismo número a ARCA.
             *  - Una sola distribuidora: decide a qué depósito entra una compra sin sucursal.
             */
            $table->string('punto_venta_unico', 5)->nullable()
                ->storedAs("NULLIF(punto_venta, '')")->unique();
            $table->unsignedTinyInteger('distribuidora_unica')->nullable()
                ->storedAs("IF(tipo = 'distribuidora', 1, NULL)")->unique();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sucursales');
    }
};
