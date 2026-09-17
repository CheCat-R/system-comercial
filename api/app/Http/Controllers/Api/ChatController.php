<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Services\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** El chat es de la SUCURSAL de la sesión: no se elige, se está. */
class ChatController extends Controller
{
    public function __construct(private readonly ChatService $svc) {}

    public function bootstrap(Sesion $s): JsonResponse
    {
        return response()->json($this->svc->bootstrap($s->sucursalId, $s->usuarioId));
    }

    public function nuevos(Request $request, Sesion $s): JsonResponse
    {
        return response()->json($this->svc->nuevos($s->sucursalId, $s->usuarioId, (int) $request->query('desde', 0)));
    }

    public function enviar(Request $request, Sesion $s): JsonResponse
    {
        $d = $request->validate(['texto' => ['required', 'string', 'max:1000'], 'paraUsuarioId' => ['nullable', 'integer']]);

        return response()->json($this->svc->enviar($s->sucursalId, $s->usuarioId, $d['texto'], (int) ($d['paraUsuarioId'] ?? 0) ?: null), 201);
    }

    public function leido(Request $request, Sesion $s): JsonResponse
    {
        $d = $request->validate(['canalUsuarioId' => ['nullable', 'integer'], 'ultimoMensajeId' => ['required', 'integer']]);

        return response()->json($this->svc->marcarLeido($s->sucursalId, $s->usuarioId, (int) ($d['canalUsuarioId'] ?? 0), (int) $d['ultimoMensajeId']));
    }
}
