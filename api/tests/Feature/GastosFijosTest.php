<?php

namespace Tests\Feature;


use Illuminate\Support\Facades\DB;

/**
 * la idempotencia de "Generar gastos fijos del período" se mide por la `fecha` del gasto, y esa fecha es
 * editable (el cartel del propio gasto generado dice "Corregí el importe cuando llegue el comprobante" y la edición
 * deja cambiar la fecha mientras no tenga pagos). Si se corrige la fecha a la del comprobante real (que casi
 * siempre cae en el mes siguiente), el período original vuelve a figurar como PENDIENTE: generarlo de nuevo duplica
 * el alquiler de ese mes, y el mes siguiente queda marcado como "ya emitido" sin estarlo.
 */
class GastosFijosTest extends PruebaDeComprasBase
{
    public function test_corregir_la_fecha_de_un_gasto_fijo_generado_no_permite_generar_el_mismo_periodo_otra_vez(): void
    {
        $cat = $this->admin()->getJson('/api/gastos/categorias')->assertOk()->json('0');
        $this->admin()->postJson('/api/gastos/recurrentes', ['nombre' => 'Alquiler', 'categoriaId' => $cat['id'], 'importeEstimado' => 100000, 'frecuencia' => 'mensual', 'diaVencimiento' => 10])->assertCreated();

        $this->admin()->postJson('/api/gastos/recurrentes/generar', ['periodo' => '2026-03'])->assertOk()->assertJsonPath('creados', 1);
        $gastoId = DB::table('gastos')->value('id');

        // Llega la factura del alquiler de marzo, fechada el 2 de abril: se corrige la fecha del gasto generado.
        $this->admin()->patchJson('/api/gastos/'.$gastoId, ['fecha' => '2026-04-02'])->assertOk();

        $segunda = $this->admin()->postJson('/api/gastos/recurrentes/generar', ['periodo' => '2026-03'])->assertOk();

        $this->assertSame(0, $segunda->json('creados'), 'Marzo ya tenía su alquiler: se generó un segundo gasto fijo para el mismo período (gastos en base: '.DB::table('gastos')->count().').');
    }
}
