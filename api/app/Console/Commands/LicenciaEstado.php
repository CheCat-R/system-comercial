<?php

namespace App\Console\Commands;

use App\Services\LicenciaService;
use Illuminate\Console\Command;

/**
 * El ID de esta instalación (lo que se le pasa a CCS para emitir la clave) y el
 * estado de su licencia. Es lo primero que se corre al armar un servidor nuevo.
 */
class LicenciaEstado extends Command
{
    protected $signature = 'licencia:estado';

    protected $description = 'Muestra el ID de esta instalación y el estado de su licencia';

    private const ETIQUETA = [
        'no_exigida' => 'no se exige licencia en este entorno',
        'sin_licencia' => 'SIN LICENCIA (solo lectura)',
        'invalida' => 'clave inválida (solo lectura)',
        'activa' => 'activa',
        'por_vencer' => 'activa, por vencer',
        'en_gracia' => 'VENCIDA, en gracia (todavía funciona)',
        'vencida' => 'VENCIDA (solo lectura)',
    ];

    public function handle(LicenciaService $licencia): int
    {
        $e = $licencia->estado();
        $this->line('ID de instalación: '.$licencia->instalacionId());
        $this->line('Estado:            '.self::ETIQUETA[$e['estado']]);
        if ($e['cliente']) {
            $this->line('Cliente:           '.$e['cliente']);
            $this->line('Plan:              '.$e['plan'].' ('.$e['modalidad'].')');
            $this->line('Vence:             '.date('d/m/Y', strtotime((string) $e['vence'])).' ('.$e['diasRestantes'].' días)');
        }
        if ($e['motivo']) {
            $this->line('Motivo:            '.$e['motivo']);
        }

        return self::SUCCESS;
    }
}
