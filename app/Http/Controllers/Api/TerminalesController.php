<?php

namespace App\Http\Controllers\Api;

use App\Auth\Sesion;
use App\Http\Controllers\Controller;
use App\Http\Requests\Terminales\GuardarTerminalRequest;
use App\Http\Resources\TerminalResource;
use App\Models\Sucursal;
use App\Models\Terminal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class TerminalesController extends Controller
{
    /**
     * PÚBLICO: el navegador pregunta "¿quién soy?" con su token antes del login,
     * para mostrar "Caja 2 · Express Norte" y no pedir la sucursal.
     */
    public function actual(Request $request): JsonResponse
    {
        $t = Terminal::porToken($request->input('token'));
        if (! $t) {
            return response()->json(['terminal' => null]);
        }

        return response()->json([
            'terminal' => [
                'id' => $t->id,
                'nombre' => $t->nombre,
                'sucursal' => ['id' => $t->sucursal->id, 'nombre' => $t->sucursal->nombre],
            ],
        ]);
    }

    public function index(): AnonymousResourceCollection
    {
        $terminales = Terminal::query()->with('sucursal')->get()
            ->sortBy(fn (Terminal $t) => [$t->sucursal->nombre, $t->nombre])->values();

        return TerminalResource::collection($terminales);
    }

    /** Devuelve el token EN CLARO una única vez: el navegador lo guarda y no vuelve a verse. */
    public function store(GuardarTerminalRequest $request, Sesion $sesion): JsonResponse
    {
        [$token, $hash] = Terminal::nuevoToken();
        $terminal = Terminal::query()->create([
            'nombre' => trim($request->input('nombre')),
            'sucursal_id' => (int) $request->input('sucursalId'),
            'token_hash' => $hash,
            'creada_por' => $sesion->usuarioId,
        ]);

        return response()->json([
            'terminal' => new TerminalResource($terminal->load('sucursal')),
            'token' => $token,
        ], 201);
    }

    public function update(GuardarTerminalRequest $request, Terminal $terminal): TerminalResource
    {
        $d = $request->validated();
        if (array_key_exists('nombre', $d)) {
            $terminal->nombre = trim($d['nombre']);
        }
        if (isset($d['sucursalId'])) {
            $terminal->sucursal_id = Sucursal::query()->findOrFail($d['sucursalId'])->id;
        }
        if (array_key_exists('activa', $d)) {
            $terminal->activa = (bool) $d['activa'];
        }
        $terminal->save();

        return new TerminalResource($terminal->refresh()->load('sucursal'));
    }

    public function destroy(Terminal $terminal): JsonResponse
    {
        $terminal->delete();

        return response()->json(['ok' => true]);
    }
}
