<?php

/*
 * Mensajes de validación en castellano. Sólo las reglas que usa la API; una
 * regla sin traducción cae al genérico de abajo, nunca a "validation.xxx".
 */
return [
    'accepted' => 'Tenés que aceptar :attribute.',
    'array' => ':attribute tiene que ser una lista.',
    'between' => [
        'numeric' => ':attribute tiene que estar entre :min y :max.',
        'string' => ':attribute tiene que tener entre :min y :max caracteres.',
        'array' => ':attribute tiene que tener entre :min y :max elementos.',
    ],
    'boolean' => ':attribute tiene que ser sí o no.',
    'date' => ':attribute no es una fecha válida.',
    'digits' => ':attribute tiene que tener :digits dígitos.',
    'email' => ':attribute no es un email válido.',
    'exists' => ':attribute no existe.',
    'in' => ':attribute no es una opción válida.',
    'integer' => ':attribute tiene que ser un número entero.',
    'max' => [
        'numeric' => ':attribute no puede ser mayor a :max.',
        'string' => ':attribute no puede tener más de :max caracteres.',
        'array' => ':attribute no puede tener más de :max elementos.',
    ],
    'min' => [
        'numeric' => ':attribute tiene que ser al menos :min.',
        'string' => ':attribute tiene que tener al menos :min caracteres.',
        'array' => ':attribute tiene que tener al menos :min elementos.',
    ],
    'numeric' => ':attribute tiene que ser un número.',
    'present' => 'Falta :attribute.',
    'regex' => ':attribute no tiene el formato esperado.',
    'required' => 'Falta :attribute.',
    'required_if' => 'Falta :attribute.',
    'string' => ':attribute tiene que ser texto.',
    'unique' => ':attribute ya está en uso.',

    'attributes' => [
        'nombre' => 'el nombre', 'password' => 'la contraseña', 'texto' => 'el texto', 'cantidad' => 'la cantidad',
        'productoId' => 'el producto', 'sucursalId' => 'la sucursal', 'proveedorId' => 'el proveedor', 'usuarioId' => 'el usuario',
        'rolId' => 'el rol', 'listaId' => 'la lista', 'modalidadId' => 'la modalidad', 'marcaId' => 'la marca', 'categoriaId' => 'la categoría',
        'items' => 'los renglones', 'cambios' => 'los cambios', 'ids' => 'los ids', 'estado' => 'el estado', 'tipo' => 'el tipo',
        'motivo' => 'el motivo', 'presId' => 'la presentación', 'origenId' => 'el origen', 'destinoId' => 'el destino',
        'resolucion' => 'la resolución', 'haciaId' => 'el destino', 'ultimoMensajeId' => 'el último mensaje',
    ],
];
