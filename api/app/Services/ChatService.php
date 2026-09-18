<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * CHAT INTERNO por sucursal, por polling. Canal grupal del local + privados.
 * Retención de 24 h. "En línea" = latió en los últimos 15 s; vive en el cache
 * (en hosting compartido no hay proceso persistente donde guardarlo en memoria).
 */
class ChatService
{
    private const LIMITE_BOOTSTRAP = 400;
    private const LIMITE_POLL = 100;
    private const EN_LINEA_SEG = 15;
    private const RETENCION_HORAS = 24;
    private const PURGA_CADA_SEG = 600;

    private function latido(int $sucursalId, int $usuarioId): void
    {
        if ($usuarioId <= 0) {
            return;
        }
        $clave = 'chat:vistos:'.$sucursalId;
        $vistos = Cache::get($clave, []);
        $vistos[$usuarioId] = time();
        // Barrido de los que ya no están, para que el mapa no crezca.
        $corte = time() - self::EN_LINEA_SEG * 4;
        $vistos = array_filter($vistos, fn ($t) => $t >= $corte);
        Cache::put($clave, $vistos, now()->addMinutes(5));
    }

    private function enLinea(int $sucursalId): array
    {
        $corte = time() - self::EN_LINEA_SEG;
        $ids = array_keys(array_filter(Cache::get('chat:vistos:'.$sucursalId, []), fn ($t) => $t >= $corte));
        if (! $ids) {
            return [];
        }

        return DB::table('usuarios')->whereIn('id', $ids)->orderBy('nombre')->get(['id', 'nombre'])->all();
    }

    private function corte(): \Illuminate\Support\Carbon
    {
        return now()->subHours(self::RETENCION_HORAS);
    }

    private function purgarSiToca(): void
    {
        if (Cache::add('chat:purga', 1, self::PURGA_CADA_SEG)) {
            DB::table('chat_mensajes')->where('fecha', '<', $this->corte())->delete();
        }
    }

    /** Sólo la central (distribuidora) tiene chat: es donde trabaja el equipo junto. */
    private function habilitada(int $sucursalId): bool
    {
        return DB::table('sucursales')->where('id', $sucursalId)->value('tipo') === 'distribuidora';
    }

    /** Las fechas salen en ISO 8601 (UTC), como las de Eloquent, para que el panel las convierta a hora local. */
    private function fila(object $m): array
    {
        return ['id' => (int) $m->id, 'fecha' => Carbon::parse($m->fecha)->toIso8601String(), 'usuarioId' => (int) $m->usuarioId, 'usuarioNombre' => $m->usuarioNombre, 'paraUsuarioId' => $m->paraUsuarioId === null ? null : (int) $m->paraUsuarioId, 'texto' => $m->texto];
    }

    private function visibles(int $sucursalId, int $usuarioId)
    {
        return DB::table('chat_mensajes as m')
            ->leftJoin('usuarios as u', 'u.id', '=', 'm.usuario_id')
            ->where('m.sucursal_id', $sucursalId)
            ->where('m.fecha', '>=', $this->corte())
            ->where(fn ($q) => $q->whereNull('m.para_usuario_id')->orWhere('m.para_usuario_id', $usuarioId)->orWhere('m.usuario_id', $usuarioId))
            ->select(['m.id', 'm.fecha', 'm.usuario_id as usuarioId', 'u.nombre as usuarioNombre', 'm.para_usuario_id as paraUsuarioId', 'm.texto']);
    }

    public function bootstrap(int $sucursalId, int $usuarioId): array
    {
        if (! $this->habilitada($sucursalId)) {
            return ['habilitado' => false];
        }
        $this->latido($sucursalId, $usuarioId);
        $this->purgarSiToca();
        $ultimos = $this->visibles($sucursalId, $usuarioId)->orderByDesc('m.id')->limit(self::LIMITE_BOOTSTRAP)->get()->reverse()->values()->map(fn ($m) => $this->fila($m));
        $lecturas = DB::table('chat_lecturas')->where('sucursal_id', $sucursalId)->where('usuario_id', $usuarioId)
            ->get(['canal_usuario_id as canalUsuarioId', 'ultimo_mensaje_id as ultimoMensajeId']);

        return [
            'habilitado' => true, 'mensajes' => $ultimos->all(), 'lecturas' => $lecturas->all(),
            'enLinea' => $this->enLinea($sucursalId), 'retencionHoras' => self::RETENCION_HORAS,
        ];
    }

    public function nuevos(int $sucursalId, int $usuarioId, int $desde): array
    {
        $this->latido($sucursalId, $usuarioId);
        $this->purgarSiToca();
        $mensajes = $this->visibles($sucursalId, $usuarioId)->where('m.id', '>', $desde)->orderBy('m.id')->limit(self::LIMITE_POLL)->get()->map(fn ($m) => $this->fila($m));

        return ['mensajes' => $mensajes->all(), 'enLinea' => $this->enLinea($sucursalId)];
    }

    public function enviar(int $sucursalId, int $usuarioId, string $texto, ?int $paraUsuarioId = null): array
    {
        $texto = trim($texto);
        if ($texto === '') {
            throw new ErrorDeNegocio('El mensaje está vacío.');
        }
        if (! $this->habilitada($sucursalId)) {
            throw new ErrorDeNegocio('El chat no está habilitado en esta sucursal.');
        }
        $u = DB::table('usuarios')->find($usuarioId);
        if (! $u || ! $u->activo) {
            throw new ErrorDeNegocio('Usuario inválido.');
        }
        $para = null;
        if ($paraUsuarioId) {
            if ($paraUsuarioId === $u->id) {
                throw new ErrorDeNegocio('No podés escribirte a vos mismo.');
            }
            $dest = DB::table('usuarios')->find($paraUsuarioId);
            if (! $dest || ! $dest->activo) {
                throw new ErrorDeNegocio('Destinatario inválido.');
            }
            $para = $dest->id;
        }
        $this->latido($sucursalId, $u->id);
        $id = DB::table('chat_mensajes')->insertGetId(['fecha' => now(), 'sucursal_id' => $sucursalId, 'usuario_id' => $u->id, 'para_usuario_id' => $para, 'texto' => $texto]);
        $this->marcarLeido($sucursalId, $u->id, $para ?? 0, $id);
        return $this->fila($this->visibles($sucursalId, $u->id)->where('m.id', $id)->first());
    }

    public function marcarLeido(int $sucursalId, int $usuarioId, int $canalUsuarioId, int $ultimoMensajeId): array
    {
        $claves = ['sucursal_id' => $sucursalId, 'usuario_id' => $usuarioId, 'canal_usuario_id' => $canalUsuarioId];
        $actual = DB::table('chat_lecturas')->where($claves)->first();
        if (! $actual) {
            DB::table('chat_lecturas')->insert([...$claves, 'ultimo_mensaje_id' => $ultimoMensajeId]);
        } elseif ($ultimoMensajeId > (int) $actual->ultimo_mensaje_id) {
            DB::table('chat_lecturas')->where('id', $actual->id)->update(['ultimo_mensaje_id' => $ultimoMensajeId]);
        }

        return ['ok' => true];
    }
}
