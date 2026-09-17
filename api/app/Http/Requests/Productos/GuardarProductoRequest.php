<?php

namespace App\Http\Requests\Productos;

use App\Http\Requests\ApiRequest;

class GuardarProductoRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'min:1', 'max:200'],
            'descripcion' => ['nullable', 'string', 'max:2000'],
            'codigoPropio' => ['nullable', 'string', 'max:60'],
            'codigoBarras' => ['nullable', 'string', 'max:60'],
            'dun' => ['nullable', 'string', 'max:60'],
            'unidadesPorBulto' => ['nullable', 'numeric', 'min:0'],
            'etiquetaMarca' => ['nullable', 'string', 'max:120'],
            'etiquetaNombre' => ['nullable', 'string', 'max:200'],
            'marcaId' => ['nullable', 'integer', 'exists:marcas,id'],
            'categoriaId' => ['nullable', 'integer', 'exists:categorias,id'],
            'subcategoriaId' => ['nullable', 'integer'],
            'etiquetas' => ['nullable', 'array'],
            'etiquetas.*' => ['integer'],
            'iva' => ['nullable', 'numeric'],
            'redondeo' => ['nullable', 'integer', 'min:0'],
            'stockMin' => ['nullable', 'numeric', 'min:0'],
            'publicado' => ['nullable', 'boolean'],
            'idExterno' => ['nullable', 'string', 'max:60'],
            'soloFraccionar' => ['nullable', 'boolean'],
            'esGranel' => ['nullable', 'boolean'],
            // Alta rápida con proveedor y costo inicial.
            'proveedorId' => ['nullable', 'integer'],
            'costoInicial' => ['nullable', 'numeric', 'min:0'],
            'codigoProveedor' => ['nullable', 'string', 'max:60'],
            'descuento' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'descuento2' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'descuento3' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'descuento4' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'flete' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return ['nombre.*' => 'Poné el nombre del producto.', 'marcaId.exists' => 'Marca inválida.', 'categoriaId.exists' => 'Categoría inválida.'];
    }
}
