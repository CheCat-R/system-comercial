# Módulo Seguridad, Auditoría y Control — Arquitectura

> **Consultar junto con [`ARCHITECTURE.md`](../ARCHITECTURE.md)** (§2 lo ubica en la *Capa de
> Infraestructura y Transversal*, junto a Automatizaciones e Integraciones),
> [`MODULO-AUTOMATIZACIONES.md`](MODULO-AUTOMATIZACIONES.md) (comparte la idea de acción sensible y
> aprobación) y [`MODULO-INTEGRACIONES.md`](MODULO-INTEGRACIONES.md) (comparte el patrón de la hoja
> sin dependencias).
>
> **Estado (2026-09-09): MÓDULO COMPLETO.** F1 (identidad, roles y permisos), F2 (auditoría,
> activity log y registro de cambios) y F3 (control de acciones sensibles) implementadas y
> verificadas.

---

## 1. Objetivo y alcance

### 1.1 Qué es

La capa que contesta tres preguntas que hoy el panel **no puede contestar**:

1. **¿Quién sos?** — autenticación y sesión.
2. **¿Qué podés hacer?** — roles y permisos, resueltos en un solo lugar.
3. **¿Quién hizo esto, cuándo, y qué cambió exactamente?** — auditoría, registro de cambios y
   control de las operaciones que duelen.

### 1.2 Qué NO es

- **No es una capa de bloqueo nueva.** No agrega validaciones de negocio: cada módulo sigue siendo
  dueño de las suyas. Seguridad decide **quién** puede pedirlas y deja constancia de que se pidieron.
- **No es seguridad de infraestructura.** Sin backend no hay hash de contraseñas, ni tokens
  firmados, ni cierre de sesión remoto real. Lo que no se puede hacer se dice (§10) en vez de
  fingirlo — igual que el reloj simulado de Automatizaciones y los secretos de Integraciones.
- **No es un log técnico.** Un log de consola sirve para depurar; una auditoría sirve para **rendir
  cuentas**. Son cosas distintas y este módulo hace la segunda.

### 1.3 ⭐ El diagnóstico: qué falta hoy, medido

Antes de definir nada, lo que hay:

| Hecho medido | Consecuencia |
|---|---|
| **178 operaciones de escritura** exportadas por los `api/` de 12 módulos | Todo eso ocurre sin dejar rastro de autor |
| **8 firmas** con `createdBy = "Vos"` / `receivedBy = "Vos"` por defecto | El "autor" es un literal escrito a mano, y nadie le pasa el usuario real |
| El rol es **texto libre** (`"Administradora"`, `"Analista Frontend"`) y cada módulo lo interpreta con **su propia expresión regular** (`/admin\|direcci/i`, `/marketing/i`, …) en 3 archivos distintos | Agregar un rol obliga a editar código en varios módulos, y dos módulos pueden discrepar sobre el mismo rol |
| `modules/usuarios/Usuario.jsx` guarda los usuarios en `useState` dentro del componente, con roles de un equipo de desarrollo (`Backend Developer`, `UX/UI Designer`) | La pantalla de usuarios no tiene `api/` ni `data/`: es scaffold, no está conectada a nada |
| `productos/api/catalogApi.js` expone **0 mutaciones** | **"Cambio de precio" —la primera superficie sensible que hay que controlar— no existe como operación** |
| `/configuracion` está deshabilitado en el Sidebar | No hay módulo de configuración que auditar todavía |

Dos de las ocho superficies que hay que vigilar **no tienen hoy por dónde escribirse**. Eso no
invalida la política: la define. Y obliga a decir, en la fase que corresponda, si se crea la
operación mínima o si queda declarada y vacía (§4).

### 1.4 ⭐ Dónde vive, y por qué otra vez una hoja

Auditar es transversal: los 12 módulos tienen que poder registrar sin importar a Seguridad, o el
grafo de dependencias vuelve a tener ciclos. Es el mismo problema que resolvieron
`automatizaciones/lib/bus.js` y `integraciones/lib/ports.js`, y se resuelve igual:

```
pedidosApi · inventoryApi · financeApi · …
        │  audit({ action, actor, subject, before, after })
        ▼
  seguridad/lib/audit.js      (hoja: no importa nada, nunca)
        ▲
        │  subscribe() · query() · export()
  securityApi ──────────────┘
```

**Tres hojas, tres propósitos distintos, y conviene no confundirlos:**

| Hoja | Pregunta que contesta | Para qué |
|---|---|---|
| `bus.js` | *¿Qué pasó?* | Para que algo **reaccione** (automatizaciones) |
| `ports.js` | *¿Quién cumple esta capacidad?* | Para **delegar** afuera |
| `audit.js` | *¿Quién lo hizo y qué cambió?* | Para **rendir cuentas** |

> ⭐ **Por qué la auditoría no se cuelga del bus.** Es tentador: los eventos ya están ahí. Pero un
> evento del bus dice *"se pagó el pedido 10253"* y no dice quién lo confirmó ni qué campos
> cambiaron; y la traza del bus está **acotada a 200 entradas y se recorta sola**, porque es una
> herramienta de diagnóstico. Una evidencia que se borra sola para hacer lugar no es evidencia.
> Son dos registros con dos vidas distintas.

---

## 2. Políticas

Cada política dice **qué se garantiza** y **qué se prohíbe**. Lo que no se puede garantizar sin
backend está marcado y aparece completo en §10.

### 2.1 Autenticación — *¿quién sos?*

| | |
|---|---|
| **Garantiza** | Que toda pantalla y toda escritura ocurren dentro de una sesión con un usuario identificado |
| **Identidad** | Email + contraseña contra el padrón de usuarios del panel (`data/users.mock.js`) |
| **Prohíbe** | Un usuario "por defecto". `AuthContext` inventaba una `CheCAT Admin` si no había nada en `localStorage`, así que **nunca se veía la pantalla de login** y el panel arrancaba con permisos máximos sin que nadie se autenticara. **Cerrado en F1**, junto con los otros dos agujeros del mismo flujo (§11) |
| **Estados de la cuenta** | `activa` · `suspendida` · `bloqueada` (§2.6) · `invitada` (nunca entró) |
| **⚠ Sin backend** | No hay hash real, ni token firmado, ni verificación de email. **El panel no guarda contraseñas**: guarda una marca de verificación, igual que no guarda secretos de integraciones (§10) |

### 2.2 Autorización — *¿qué podés hacer?*

| | |
|---|---|
| **Garantiza** | Que el permiso se resuelve **en un solo lugar** y se aplica **en el `api/`** |
| **Regla dura** | ⭐ **Esconder un botón no es un permiso.** Si la función se puede llamar igual, el permiso no existe. Ya es la regla de Analytics, Automatizaciones e Integraciones; acá se vuelve la regla del panel |
| **Regla dura** | ⭐ **La UI muestra el porqué, no el vacío.** Una acción sin permiso se ve **deshabilitada con el motivo**, nunca desaparecida — mismo criterio que las condiciones incompatibles del builder |
| **Denegación** | Por defecto: lo que no está permitido, está denegado. Un permiso desconocido es *no* |
| **Prohíbe** | Que un módulo interprete el rol por su cuenta. Los `lib/rbac.js` de cada módulo pasan a **delegar** en el catálogo central, conservando sus nombres de función para no romper nada |

### 2.3 Roles — *paquetes de permisos con nombre*

⭐ **Un rol no es una etiqueta: es un paquete de permisos.** Hoy el rol es una cadena de texto y el
permiso se deduce de ella con una expresión regular. Se invierte: **el permiso es la unidad**, el rol
es un conjunto con nombre, y agregar un rol **no toca código**.

Roles base propuestos (revisables; lo importante es la estructura, no la lista):

| Rol | Alcance |
|---|---|
| **Administrador** | Todo, incluida la administración de usuarios, permisos e integraciones |
| **Dirección** | Ve todo (incluye métricas sensibles y tráfico), aprueba lo sensible, **no** administra permisos |
| **Operaciones** | Pedidos, logística, inventario y abastecimiento. Escribe en su terreno |
| **Finanzas** | Gastos, comisiones, reembolsos, comprobantes. **La única que aprueba dinero** |
| **Marketing** | Campañas, promociones, audiencias, contenido. No ve costos ni margen |
| **Soporte / CX** | Lectura amplia, escritura acotada (abrir incidencia, pedir devolución) |
| **Sólo lectura** | Ve, no escribe, y **no ve datos sensibles** |

Reglas:

1. **Un usuario tiene un rol** (no varios): dos roles superpuestos vuelven imposible contestar "¿por
   qué pudo hacer esto?".
2. ⭐ **Los permisos extra son excepciones nominales y se ven como tales.** Si a alguien hay que
   darle un permiso suelto, queda registrado como excepción sobre su rol, con quién se lo dio y
   cuándo — no diluido dentro de un rol nuevo llamado "Operaciones 2".
3. **El rol Administrador no se puede quedar vacío**: el sistema impide borrar o degradar al último
   administrador.
4. **Nadie puede editar su propio rol.** Ni siquiera un administrador (§2.10, segregación).

### 2.4 Permisos — *la unidad*

Un permiso es `modulo.accion` y **declara su contrato**, igual que una métrica en Analytics o un
evento en Automatizaciones. Un permiso sin contrato no existe, y `assertPermissions()` lo hace
cumplir al cargar:

```js
"pedidos.cancelar": {
  label: "Cancelar un pedido",
  module: "pedidos",
  grade: "con_motivo",              // §2.10
  appliedAt: "pedidosApi.cancelOrder",   // ⭐ el punto EXACTO donde se aplica
  roles: ["Administrador", "Operaciones"],
  hint: "Libera el stock reservado y cierra el pedido. No se puede deshacer.",
}
```

⭐ **`appliedAt` es lo que vuelve auditable al propio sistema de permisos.** Igual que `wiredAt` en
los puertos y `emittedAt` en los eventos: un permiso declarado que nadie aplica es una mentira
prolija, y con el campo se puede listar cuáles están sin cablear.

### 2.5 Sesiones

| | |
|---|---|
| **Qué es** | Un usuario autenticado, con inicio, última actividad y dispositivo declarado |
| **Expiración** | Por **inactividad** (30 min por defecto, configurable) y por **duración máxima** (8 h). Al vencer: vuelve al login, sin perder la ruta a la que quería entrar |
| **Aviso** | Se avisa **antes** de expirar y se puede extender. Una sesión que se cae sin aviso en el medio de una carga es una pérdida de trabajo, no una medida de seguridad |
| **⭐ Step-up** | Las acciones **críticas** piden **volver a autenticarse**, aunque la sesión esté viva: reembolsos, cambios de permisos, integraciones en producción, borrado de datos |
| **Listado** | El usuario ve sus sesiones activas; el administrador ve las de todos |
| **⚠ Sin backend** | "Cerrar sesión en otro dispositivo" **no se puede cumplir de verdad**: no hay servidor que invalide nada. Se declara y se muestra deshabilitado con el motivo (§10) |

### 2.6 Seguridad de cuentas

| Política | Regla |
|---|---|
| **Contraseña** | Mínimo 10 caracteres, no puede ser una de las 100 más comunes, no puede contener el email. **Fuerza visible mientras se escribe**, no un error después de enviar |
| **Intentos fallidos** | 5 intentos → cuenta **bloqueada** 15 min. El mensaje de error **no dice si el email existe** (no confirma padrón a un desconocido) |
| **Alta de usuarios** | Por invitación de un administrador. Nadie se auto-registra en un panel de gestión — hoy `/register` existe y crea un **Administrador**, que es el peor default posible |
| **Baja** | Se **desactiva**, no se borra: borrar al usuario dejaría huérfano su rastro de auditoría |
| **Cambio de contraseña** | Pide la anterior. Cambiarla **cierra las demás sesiones** (declarado; ver §10) |
| **2FA** | Declarado en el modelo, **no implementable sin backend**. Se muestra como "requiere backend" en vez de un interruptor que no hace nada |
| **Alertas** | Ingreso desde un dispositivo nuevo · 5 fallos seguidos · cambio de rol · acción sensible fuera de horario. Van al panel de seguridad **y al bus**, así que se pueden automatizar |

### 2.7 Auditoría — *la evidencia*

**Un registro de auditoría es una afirmación sobre el pasado.** De ahí salen sus cuatro reglas:

1. ⭐ **Es inmutable y no se puede borrar desde el panel.** Ni siquiera un administrador. Se filtra,
   se exporta, se archiva — no se edita. Una auditoría borrable no prueba nada, y el permiso de
   borrarla sería el único permiso que hay que auditar de verdad.
2. ⭐ **Se registra el hecho consumado, no la intención.** El asiento se escribe **después** de que
   la operación tuvo efecto. Un intento fallido también se registra, pero como intento
   (`resultado: rechazado`), nunca confundido con un cambio.
3. ⭐ **Registrar es responsabilidad del módulo dueño**, porque es el único que sabe qué cambió.
   Nadie audita desde afuera. Es la misma forma del `fallback` en Integraciones: la pasa el dueño.
4. ⭐ **Sin actor no hay escritura sensible.** Las operaciones de grado `registrada` o superior
   **exigen** `{ actor }`; si falta, la operación **falla**. Hoy el default es la cadena `"Vos"`, que
   es exactamente el bug que esta regla elimina.

### 2.8 Activity Log vs. Registro de cambios — *dos lentes, un mismo registro*

Se piden como dos cosas y son dos **preguntas** distintas sobre el mismo asiento:

| | Activity Log | Registro de cambios |
|---|---|---|
| Pregunta | *¿Qué hizo Fulana hoy?* | *¿Quién tocó este pedido?* |
| Eje | **Actor** | **Entidad** |
| Dónde se ve | Pantalla de seguridad · ficha del usuario | **Dentro de la entidad**, en su propia pantalla |
| Incluye lecturas | **Sí**: ver un dato sensible o **exportarlo** es actividad | No: sólo lo que cambió |

⭐ **El registro de cambios se lee donde está la entidad, no en una pantalla aparte.** Un rastro que
obliga a irse del pedido para saber quién lo canceló no se usa nunca.

⭐ **Exportar también se audita.** Un CSV de clientes o de tráfico saca datos del panel; es una
acción registrable, con la cantidad de filas y los filtros aplicados.

### 2.9 Registro de cambios — *el diff*

| | |
|---|---|
| **Unidad** | El **campo**, no la entidad. `precio: 12.500 → 14.900`, no "se editó el producto" |
| **Quién lo arma** | El módulo dueño, con los campos que **declara auditables**. Un diff automático sobre el objeto entero registraría ruido (`updatedAt`) y filtraría campos internos |
| **Qué guarda** | Valor anterior, valor nuevo, y el **motivo** si la acción lo exige |
| **⭐ Datos sensibles** | Se aplica la **misma redacción declarada** que en los logs de Integraciones (`lib/redact.js`): un diff que guarda un dato personal en claro es una filtración con fecha y hora |

### 2.10 Acciones sensibles — *cuatro grados de control*

⭐ **El grado lo declara el catálogo de permisos, no cada pantalla.** Así dos pantallas no pueden
tratar la misma operación con dos criterios distintos:

| Grado | Qué exige | Ejemplo |
|---|---|---|
| **libre** | Nada. No se audita | Filtrar una tabla |
| **registrada** | Actor obligatorio, queda asentada | Crear un pedido, despachar un envío |
| **con motivo** | ⭐ Actor **y motivo escrito**, antes de ejecutar | Ajuste de stock, cancelación, cambio de precio, anular comprobante |
| **con aprobación** | ⭐ Actor, motivo, y **un segundo par de ojos** | Reembolso, cambio de permisos, integración a producción |

Reglas:

1. ⭐ **El motivo es parte de la operación, no un campo del log.** Se pide **antes**, y la operación
   no ocurre sin él. Un motivo pedido después es una encuesta.
2. ⭐ **Quien aprueba no puede ser quien pidió.** Segregación mínima de funciones. Ya está resuelto
   en Automatizaciones (`lib/approvals.js` revalida sujeto y condiciones antes de ejecutar) y se
   reutiliza el mismo mecanismo en vez de escribir otro.
3. **Aprobar revalida.** Entre el pedido y la aprobación el mundo cambió: se vuelve a verificar que
   la operación siga siendo posible antes de ejecutarla.
4. ⭐ **Una automatización no puede saltear un grado.** Si una acción exige aprobación a una persona,
   también se la exige a la regla que la ejecuta — es la regla de Automatizaciones (*"una
   automatización no puede hacer nada que un usuario no pueda hacer a mano, por el mismo camino"*)
   leída desde el otro lado.

---

## 3. Responsabilidades

Quién hace qué. **Ésta es la parte que evita que la auditoría se convierta en decoración.**

| Responsable | Responsabilidad | Cómo se hace cumplir |
|---|---|---|
| **Módulo dueño** (`pedidosApi`, `inventoryApi`, …) | Validar, ejecutar, y **registrar el hecho con actor, motivo y diff** | La operación **falla** si no recibe actor cuando el grado lo exige |
| **Seguridad** | Definir permisos y grados, resolverlos, guardar la evidencia, exigir motivo y aprobación, mostrar el rastro | `assertPermissions()` al cargar: un permiso sin contrato o sin `appliedAt` se reporta |
| **UI** | Mostrar **el porqué** de lo que no se puede, pedir el motivo antes, y mostrar el rastro **dentro** de la entidad | Revisión de pantalla: ningún botón desaparece por permisos |
| **Automatizaciones** | Cuando actúa una regla, **el actor es la regla** | El motor pasa `actor: { kind: "automation", id: "RULE-3" }` |
| **Integraciones** | Cuando el cambio entra de afuera, **el actor es la conexión** | El puente pasa `actor: { kind: "integration", id: "payments.charge", ref: providerEventId }` |

### ⭐ Un actor puede ser una persona, una automatización o una integración

Es la decisión conceptual central del módulo, y la que hace que la auditoría del panel sea
verdadera en lugar de parcial:

```
persona       actor: { kind: "user",        id: "USR-3",            name: "María López" }
automatización actor: { kind: "automation",  id: "RULE-3",           name: "Stock bajo → OC" }
integración   actor: { kind: "integration", id: "payments.charge",  ref: "evt_191763" }
```

Sin esto, el día que una automatización cancele un pedido o un webhook confirme un pago, el rastro
diría "sistema" — que es la forma elegante de decir *no sabemos*. Con esto, el asiento del pedido
#10253 puede decir: *"pagado por la conexión `payments.charge`, evento `evt_191763`"*, y desde ahí se
llega a la llamada exacta en la consola de tráfico.

---

## 4. Las ocho superficies bajo vigilancia

Para cada una: qué se registra, quién puede, qué grado tiene y **qué falta hoy**.

### 4.1 Cambios de precios

| | |
|---|---|
| **Qué se registra** | SKU, precio anterior → nuevo, % de variación, costo vigente y **margen resultante**, motivo, vigencia |
| **Grado** | `con motivo`; **`con aprobación` si la variación supera un umbral** (±20 % propuesto) o si deja el margen por debajo de cero |
| **Quién** | Administrador · Dirección · (Marketing sólo vía promociones, que es otra cosa) |
| **⚠ Hoy** | **No existe la operación.** `catalogApi` es de sólo lectura y `ProductoDetalle` no persiste. Controlar esto exige **crear primero la escritura mínima** en Productos |
| **Ojo** | Un descuento de Marketing **no es** un cambio de precio: el precio de lista no se toca. Los dos se auditan, pero por caminos distintos y no hay que mezclarlos |

### 4.2 Ajustes de stock

| | |
|---|---|
| **Qué se registra** | Depósito, SKU, cantidad anterior → nueva, diferencia, motivo tipificado (rotura, faltante, recuento, devolución), valorización de la diferencia |
| **Grado** | `con motivo` siempre; `con aprobación` si el valor del ajuste supera un umbral |
| **Quién** | Operaciones · Administrador |
| **Hoy** | `inventoryApi.createAdjustment` ya existe **y ya tiene el campo del autor con el valor `"Vos"`**: es el ejemplo más claro de lo que hay que corregir |

### 4.3 Cancelaciones

| | |
|---|---|
| **Qué se registra** | Pedido, estado anterior, motivo, si liberó stock reservado, si tenía comprobante emitido |
| **Grado** | `con motivo` |
| **Quién** | Operaciones · Administrador |
| **Hoy** | `pedidosApi.cancelOrder` existe, sin actor ni motivo |

### 4.4 Reembolsos

| | |
|---|---|
| **Qué se registra** | Pedido, importe, medio, motivo, nota de crédito asociada, quién lo pidió y **quién lo aprobó** |
| **Grado** | ⭐ `con aprobación` — y con **step-up** (§2.5): es plata saliendo |
| **Quién** | Pide: Soporte/CX u Operaciones · **Aprueba: Finanzas o Dirección**, y nunca la misma persona |
| **Hoy** | Ya existe el gate en dos pasos (`markReturnRequested` → `approveRefund`), pero **sin identidad**: "Solicitado por: Logística / CX" es un texto fijo |

### 4.5 Cambios financieros

| | |
|---|---|
| **Alcance** | Gastos, tarifas de comisión, liquidaciones, categorías de IVA, anulación de comprobantes |
| **Qué se registra** | Entidad, campo, antes → después, período afectado y **si altera un P&L ya mirado** |
| **Grado** | `con motivo`; `con aprobación` para anular un comprobante y para cambiar una tasa de IVA |
| **Quién** | Finanzas · Administrador |
| **Ojo** | ⭐ Un cambio de tarifa **no reescribe el pasado**: las comisiones ya devengadas quedan con la tasa vigente cuando ocurrieron. Si no, el registro de cambios diría una cosa y el P&L otra |

### 4.6 Cambios de permisos

| | |
|---|---|
| **Qué se registra** | Usuario afectado, rol anterior → nuevo, permisos-excepción agregados o quitados, quién lo hizo |
| **Grado** | ⭐ `con aprobación` + step-up. Es el permiso que otorga permisos |
| **Quién** | Sólo Administrador |
| **Reglas** | Nadie edita su propio rol · no se puede degradar al último administrador · **cambiar un rol notifica al afectado** |

### 4.7 Configuración

| | |
|---|---|
| **Alcance** | Parámetros del panel: umbrales, políticas de sesión, datos fiscales, tema, sucursales |
| **Grado** | `registrada`; `con motivo` para lo que altera cálculos (umbrales de stock, política de sesión) |
| **⚠ Hoy** | **No hay módulo de Configuración** (`/configuracion` está deshabilitado). Lo que existe hoy son ajustes dispersos dentro de cada módulo, y se auditan ahí |

### 4.8 Integraciones

| | |
|---|---|
| **Qué se registra** | Conectar, configurar, **habilitar/deshabilitar**, cambiar de modo, olvidar la conexión, reintentar una llamada, inyectar un webhook |
| **Grado** | `con motivo` para habilitar/deshabilitar; ⭐ `con aprobación` + step-up para **pasar a producción** |
| **Quién** | Sólo Administrador (ya está así en `integraciones/lib/rbac.js`) |
| **Ojo** | ⭐ Habilitar una integración **cambia por dónde pasa la operación real** del negocio. Es un cambio de configuración con consecuencias de dinero, y se audita como tal |
| **Bonus** | Ya está medio hecho: la consola de tráfico registra cada llamada. Falta atarle **el actor humano** que la habilitó |

---

## 5. Modelo de dominio

| Entidad | Descripción | Dueño |
|---|---|---|
| **Usuario** (`User`) | Persona con acceso: identidad, rol, estado, excepciones | Seguridad |
| **Rol** (`Role`) | Paquete de permisos con nombre | Seguridad |
| **Permiso** (`Permission`) | `modulo.accion` + grado + `appliedAt` + roles | Seguridad |
| **Sesión** (`Session`) | Usuario autenticado, inicio, última actividad, dispositivo | Seguridad |
| **Asiento** (`AuditEntry`) | ⭐ Hecho consumado: actor, acción, sujeto, antes/después, motivo, resultado | Seguridad |
| **Solicitud** (`ApprovalRequest`) | Acción sensible esperando el segundo par de ojos | Seguridad (mecanismo de Automatizaciones) |
| **Alerta** (`SecurityAlert`) | Algo que amerita mirar: fallos, dispositivo nuevo, acción fuera de horario | Seguridad |

Forma del asiento:

```js
{
  id, at,
  actor:   { kind: "user" | "automation" | "integration", id, name, role },
  action:  "inventario.ajustar",            // clave del catálogo de permisos
  grade:   "con_motivo",
  subject: { type: "sku", id: "SKU-5", label: "Auricular BT" },
  changes: [ { field: "onHand", before: 24, after: 12 } ],   // redactado según lo declarado
  reason:  "Recuento físico depósito Palermo",
  result:  "ok" | "rechazado",
  denial:  null,                            // por qué se rechazó, si se rechazó
  session: "SES-12",
  ref:     null,                            // callId, providerEventId, runId — el hilo hacia el otro módulo
}
```

⭐ **`ref` es lo que ata los tres registros del panel**: desde el asiento se llega a la llamada de la
consola de tráfico, a la ejecución del historial de automatizaciones o al webhook entrante.

---

## 6. Reglas del módulo

1. **El permiso se aplica en el `api/`, no escondiendo botones.**
2. **Lo que no está permitido, está denegado.**
3. **El rol es un paquete de permisos; el permiso es la unidad.**
4. **Sin actor no hay escritura sensible** — y el actor puede ser persona, automatización o integración.
5. **Registrar es del módulo dueño**, porque es el único que sabe qué cambió.
6. **La auditoría es inmutable y no se borra desde el panel.**
7. **El motivo se pide antes, no después.**
8. **Quien aprueba no es quien pide.**
9. **El registro de cambios se lee dentro de la entidad.**
10. **Lo que no se puede garantizar sin backend, se dice** (§10).

---

## 7. UX

| Ruta | Pantalla |
|---|---|
| `/seguridad` | Tablero: alertas, últimas acciones sensibles, aprobaciones pendientes, sesiones activas |
| `/seguridad/usuarios` | Padrón: alta por invitación, rol, estado, excepciones (reemplaza el scaffold actual) |
| `/seguridad/roles` | Roles y su matriz de permisos, con el `appliedAt` de cada uno |
| `/seguridad/actividad` | Activity Log: por actor, con filtros y export |
| `/seguridad/auditoria` | Asientos: por entidad, acción, grado, período |
| `/seguridad/aprobaciones` | Cola del segundo par de ojos |
| `/seguridad/sesiones` | Sesiones activas y política |
| **Dentro de cada entidad** | ⭐ Bloque **"Historial de cambios"** en pedido, producto, SKU, comprobante, conexión |

Y en el shell: el login deja de ser saltable, y el menú de usuario muestra rol, sesión y "mi
actividad".

---

## 8. Estructura de archivos

```
modules/seguridad/
├── lib/
│   ├── audit.js         # ⭐ la hoja: registra y consulta. No importa NADA
│   ├── permissions.js   # catálogo de permisos + grados + umbrales + assertPermissions()
│   ├── roles.js         # paquetes de permisos
│   ├── gate.js          # ⭐ el portón: permiso + motivo + step-up + aprobación (F3)
│   ├── approvals.js     # la cola: segregación de funciones y revalidación (F3)
│   ├── sessions.js      # vigencia, inactividad, step-up
│   ├── accounts.js      # política de contraseña, bloqueo, estados
│   ├── diff.js          # campos auditables declarados → cambios
│   └── actors.js        # persona | automatización | integración
├── data/  users.mock.js
├── api/   securityApi.js
├── components/  ChangeLog.jsx · ReasonDialog.jsx (+ GradeNotice) · StepUpDialog.jsx
└── Seguridad.jsx · Usuarios.jsx · Roles.jsx · Auditoria.jsx · Actividad.jsx · Aprobaciones.jsx
```

`ChangeLog.jsx` es el componente que se incrusta en las pantallas de los otros módulos: **es la
única pieza de Seguridad que viaja fuera de su carpeta**, y viaja porque el rastro tiene que leerse
donde está la entidad (§2.8).

`ReasonDialog.jsx` viaja por el mismo motivo, y `lib/gate.js` viaja por el opuesto: lo importan los
`api/` del núcleo —no las pantallas—, porque **el control tiene que estar en la operación y no en el
botón**. Por eso es hoja: lo que necesita de la sesión se lo enchufa `securityApi` al cargar
(`setStepUpCheck` · `setPrincipalResolver` · `setAlertSink`), igual que Integraciones enchufa su
política de llamada con `setPipeline`.

---

## 9. Relación con los otros módulos transversales

| | Automatizaciones | Integraciones | **Seguridad** |
|---|---|---|---|
| Responde | ¿**Cuándo** actuar? | ¿**Con quién** se cumple? | ¿**Quién** puede, y **quién lo hizo**? |
| Unidad | Regla | Conexión | Permiso / asiento |
| Hoja | `bus.js` | `ports.js` | `audit.js` |

**Lo que Seguridad les pide a los otros dos:** que pasen su actor. **Lo que les da:** que sus propias
acciones queden explicadas — una regla que cancela un pedido y un webhook que confirma un pago dejan
de ser "el sistema".

---

## 10. ⭐ Lo que no se puede hacer sin backend

Se dice acá, entero, y la UI lo repite donde corresponde:

| No se puede | Por qué | Qué se hace en su lugar |
|---|---|---|
| Guardar contraseñas de verdad | No hay hash ni servidor | **El panel no guarda contraseñas.** Se valida la política y se marca la cuenta como verificada |
| Cerrar sesión en otro dispositivo | No hay nada que invalidar | Se declara y se muestra deshabilitado con el motivo |
| 2FA | Requiere emisor y verificación | Declarado en el modelo, marcado como "requiere backend" |
| Auditoría a prueba de manipulación | Todo vive en memoria del navegador | Se declara que es **demostrativa**: no se puede borrar *desde el panel*, y se dice que un backend real la haría append-only de verdad |
| Retención larga | Memoria acotada | Tope explícito y exportación a CSV |

Es la misma honestidad del reloj simulado de Automatizaciones y de los secretos de Integraciones: se
dice qué es simulado y se lo hace demostrable.

---

## 11. Fases

### F1 — Identidad, roles y permisos ✅

**Implementada (2026-09-09).**

- **80 permisos** con contrato en `lib/permissions.js` (hoja sin imports), verificados al cargar por
  `assertPermissions()`. Cada uno declara `grade` y `appliedAt`; **19 ya se aplican** ahí y 61 quedan
  declarados —el mismo dato honesto que *consumido* vs *declarado* en los puertos.
- **7 roles como paquetes** (`lib/roles.js`), con comodines (`*.ver`, `pedidos.*`) y `except` para lo
  que se excluye a propósito (Marketing no ve `analytics.sensibles`).
- **Excepciones nominales**: un permiso suelto por encima o por debajo del rol, **visible como
  excepción**.
- **Padrón real** (`data/users.mock.js`, 10 personas) + `api/securityApi.js` con invitación, cambio de
  rol, estados, desbloqueo y excepciones. **Se jubiló `modules/usuarios/`** (242 líneas de scaffold).
- **Sesión** con expiración por inactividad (30 min) y duración máxima (8 h), y **step-up**
  (`components/StepUpDialog.jsx`) para los 4 permisos críticos.
- **Los tres RBAC por regex ahora delegan** en el catálogo, conservando sus firmas: ningún módulo se
  tocó por fuera de su `lib/rbac.js` (y de las tres líneas de Analytics).
- Pantallas **Seguridad · Usuarios · Roles y permisos**.

#### Decisiones y hallazgos al implementar F1

1. **⭐ Eran tres agujeros del mismo flujo, no uno.** Al usuario por defecto del contexto se le
   sumaban `/register`, que creaba cuentas con rol **Administrador**, y la pantalla de login, que
   venía **precargada con `admin@checat.dev` / `admin123`**. Los tres cerrados. Detalle sabroso:
   `admin123` **no cumple la política de contraseñas** que el propio panel ahora exige.

2. **⭐ La migración corrigió una divergencia real, no fue cosmética.** Con `/admin|direcci/i`,
   **Dirección podía configurar integraciones** — justo lo contrario de lo que la tabla de permisos
   de `MODULO-INTEGRACIONES.md` §10 declara. Verificado en el navegador: hoy Dirección ve la consola
   de tráfico y tiene *Conectar un proveedor* **deshabilitado con el motivo**. Tres expresiones
   regulares separadas no divergen en teoría: divergen.

3. **⭐ Un step-up sin salida es peor que no tener step-up.** El primer intento dejó el cambio de rol
   bloqueado sin forma de cumplir el requisito: el select deshabilitado y nada que apretar. Una regla
   de seguridad que no se puede cumplir se termina sacando. Se agregó el diálogo de confirmación.

4. **⭐ Bug encontrado probando: una cuenta invitada podía entrar y no podía hacer nada.** El guardián
   bloqueaba cuando el estado no era `activa`, en vez de bloquear los estados que **impiden entrar**.
   Una persona recién invitada entraba a un panel vacío sin explicación. Ahora `invitada` trabaja
   normal y pasa a `activa` en su primer ingreso; `suspendida` y `bloqueada` dan **0 permisos
   efectivos**, que es lo correcto.

5. **El puente con lo viejo se cuenta.** Las pantallas siguen mandando `user.role` como cadena;
   `resolveRoleKey()` la acepta y **lleva la cuenta de cuántas veces se usó**. Contar el puente es lo
   que evita que se vuelva permanente: el tablero muestra ese número.

6. **La regla del último administrador es defensiva y hoy no se alcanza.** Con un solo admin, la
   regla de "nadie edita su propio rol" se dispara antes; con dos, ninguno es el último. Queda
   igual, porque el día que un backend o una automatización llame al `api/` sin ser esa persona, sí
   se alcanza.

#### Verificación de F1

```
login              : ya no hay usuario por defecto — la app abre en /login
credenciales       : el formulario ya no viene precargado, y dice que sin backend
                     NO se verifica la credencial: se valida la política (§10)
padrón             : 10 usuarios · 7 roles · permisos efectivos por persona
                     admin 80 · dirección 23 · operaciones 34 · finanzas 27 ·
                     marketing 28 · soporte 18 · sólo lectura 14
estados            : suspendida → 0 permisos efectivos · invitada → los de su rol
RBAC entre módulos : como Dirección, «Conectar un proveedor» aparece deshabilitado con
                     «Configurar integraciones está reservado a Admin (§10)», y la consola
                     de tráfico sí se abre  ← lo que la regex hacía mal
                     como Marketing, «Invitar» en Usuarios queda deshabilitado
reglas duras       : «Nadie puede editar su propio rol» (select deshabilitado + api/)
                     «No podés suspender tu propia cuenta» (rechazado en el api/)
step-up            : cambiar un rol pide confirmar identidad; confirmado, el select se
                     habilita y el cambio se aplica («Rol cambiado.»)
catálogo           : 80 permisos con contrato · 19 aplicados · 61 declarados ·
                     32 con motivo o aprobación · 4 piden re-autenticarse
```

Lint y build limpios; consola sin errores.

### F2 — Auditoría, activity log y registro de cambios ✅

**Implementada (2026-09-09).**

- **`lib/audit.js`**, la tercera hoja sin dependencias del panel (junto al bus y al registro de
  puertos), con `audit()` para hechos y `activity()` para lo que no cambia nada.
- **`lib/actors.js`**: persona · automatización · integración, y el actor **ambiente** con
  `setActor()` / `withActor()`.
- **`lib/diff.js`**: campos auditables declarados por tipo de sujeto y `diffOf()` — el cambio es por
  **campo**, con su etiqueta y su formato.
- **26 operaciones auditadas** en 8 módulos (pedidos 7 · finanzas 5 · seguridad 5 · integraciones 4 ·
  facturación 2 · inventario · abastecimiento · logística) + **6 registros de actividad** (ingresar,
  salir, intento rechazado, exportar).
- **Las dos lentes**: `/seguridad/auditoria` (por entidad y acción, con filtros y export) y
  `/seguridad/actividad` (por actor).
- **`components/ChangeLog.jsx`** incrustado en Pedido, Conexión y la ficha de usuario.
- ⭐ **Se acabó el `createdBy = "Vos"`**: no queda ni una firma con ese literal en todo `src/`.

#### Decisiones y hallazgos al implementar F2

1. **⭐ El actor es ambiente, no un parámetro más.** Pasar `{ actor }` por las 178 funciones de
   escritura habría significado tocar todas las pantallas y olvidarse en la mitad. El shell fija
   quién opera al iniciar sesión, y quien actúa por dentro abre su propio contexto —
   `withActor(automationActor(rule), …)` en el motor, `withActor(integrationActor(portKey, ref), …)`
   en el puente de entrada. Es la misma forma que `bus.withContext`.

2. **⭐ La regla dura es aplicable porque el actor es ambiente**: `audit({ requireActor: true })`
   **tira** si nadie sabe quién está operando. Eso es exactamente lo que el `"Vos"` volvía imposible.

3. **⭐ La retención acotada no es el problema: el silencio sí.** La traza guarda 1000 asientos y
   **cuenta los que se caen**, y la pantalla lo dice. Es la crítica que le hicimos al bus (200
   entradas que se recortan solas) aplicada a nosotros mismos.

4. **⭐ Bug encontrado probando: el historial quedaba congelado.** `ChangeLog` memoizaba la traza por
   props, pero **la traza vive fuera de React**: se confirmaba un pago y el bloque seguía diciendo
   "sin cambios registrados". Sin memo.

5. **La atribución de una acción aprobada es una pregunta abierta, y es de F3.** Cuando una regla
   propone una acción sensible, quien la ejecuta al final es la persona que aprueba — así que el
   asiento la nombra a ella. ¿El actor es la regla que lo propuso o quien lo aprobó? La respuesta
   probablemente sea *las dos cosas*: actor la persona, `meta` la regla. Se resuelve en F3, que es
   donde vive la cola de aprobación.

6. **Auditar una lectura tiene sentido y se ve raro al principio.** Exportar no cambia nada y aun así
   aparece en la traza: es lo que separa el *activity log* del *registro de cambios* (§2.8). Sacar un
   CSV de clientes del panel es exactamente lo que hay que poder ver después.

#### Verificación de F2

Todo conducido desde la UI:

```
registro de cambios : confirmar el pago del #10253 deja, DENTRO del pedido:
                      «Camila Ferreyra · Confirmar el pago
                        Estado de pago: Pendiente → Pagado
                        Backorder: — → 1 línea(s) sin stock»
actor integración   : ⭐ el mismo pedido, pagado por un webhook, queda firmado
                      «payments.charge» — la conexión, no "sistema" ni una persona
actor persona       : configurar y habilitar una conexión quedan en el rastro de
                      esa conexión, con Proveedor / Modo / Habilitada antes → después
auditoría           : 4 asientos · 3 con cambios · 1 de sólo actividad · 2 tipos de actor,
                      con el grado declarado al lado de cada acción
actividad           : la misma traza por actor — Camila Ferreyra (2) · payments.charge (1)
exportar            : ⭐ el export **se audita a sí mismo**: aparece «Ver la auditoría y el
                      activity log · sólo lectura» con las filas y los filtros usados
retención           : "guarda hasta 1000 asientos y todavía no se cayó ninguno"
```

**Lo que no se pudo observar en esta sesión:** un asiento con actor **automatización**. El envoltorio
está puesto en el único punto donde el motor ejecuta, pero las acciones de las reglas de fábrica
escriben en módulos que F2 no cableó (tareas, notas, etiquetas, incidencias) o son sensibles y pasan
por aprobación — donde hoy ejecuta la persona que aprueba (punto 5). Se cierra en F3.

Lint y build limpios; consola sin errores.

### F3 — Control de acciones sensibles ✅

**Implementada (2026-09-09).**

- **`lib/gate.js`** — el portón. `sensitive({ action, subject, reason, run, revalidate })` es el
  único camino por el que pasa una operación de grado ≥ *registrada*: resuelve el permiso, exige el
  motivo, pide step-up y encola cuando hace falta una firma. **El control está en la operación, no en
  el botón.**
- **`lib/approvals.js`** — la cola de Seguridad, con segregación de funciones verificada en el
  `lib/` y no en la pantalla, y **revalidación al aprobar**.
- **`THRESHOLDS`** en el catálogo de permisos: ±20 % para el precio, $200.000 para el ajuste de
  stock. **El módulo dueño decide si se pasó; Seguridad declara el umbral y el grado de cada lado.**
- **`catalogApi.setPrice`** — la operación que no existía (§4.1), creada **con el control puesto
  desde el primer día**, junto con `describePriceChange`, el historial de precios y la pantalla
  **Precios y márgenes** (`/productos/precios`).
- **`components/ReasonDialog.jsx`** (+ `GradeNotice`) — el motivo pedido antes, y la ficha del
  grado embebida donde ya había un formulario (ajuste de stock, aprobación de reembolso).
- **`Aprobaciones.jsx`** (`/seguridad/aprobaciones`) — la cola, diciendo **quién puede firmar cada
  cosa**.
- **12 operaciones** pasan hoy por el portón: precio (normal y escalado), ajuste de stock (normal y
  escalado), cancelar un pedido, aprobar y rechazar un reembolso, cambiar tarifas de comisión, anular
  un comprobante, rol y excepción de permisos, habilitar/deshabilitar una conexión y pasar a
  producción. **28 de 80 permisos cableados** (era 19 en F1).
- **Eventos `seguridad.*` al bus**: `aprobacion_pendiente` y `aprobacion_resuelta`, con sujeto
  `approval` propio, loader y condiciones en Automatizaciones.

#### Decisiones y hallazgos al implementar F3

1. **⭐ El grado no depende sólo de qué operación es, sino de cuánto duele esta vez.** El mismo
   formulario de ajuste dice *«Con motivo»* con $112.000 y *«Con aprobación»* con $280.000, sin que
   la pantalla decida nada: el umbral y los dos grados los declara `THRESHOLDS`, y quién está de qué
   lado lo calcula el módulo dueño. Si el umbral viviera dentro de `inventoryApi`, moverlo sería
   bajarle el control a la operación sin que nadie se entere.

2. **⭐ Un cambio de precio no es un campo de un formulario que se guarda.** Si viviera dentro de un
   `updateProduct` que pisa quince campos, el asiento diría *"editó el producto"* y el motivo —si
   lo hubiera— valdría para los quince. Por eso `setPrice` es una operación con nombre propio, y por
   eso la pantalla nueva es **Precios**, no una pestaña más de la ficha.

3. **⭐ La segregación de funciones necesita que existan dos personas, y eso es un requisito del
   padrón, no del código.** Cambiar permisos es `con aprobación` y sólo el rol Administrador lo
   tiene: con **un solo administrador**, la primera solicitud quedaba encolada para siempre porque no
   había nadie habilitado a firmarla. Se resolvió por los dos lados: se agregó un segundo
   administrador al padrón (un panel con uno solo tampoco sobrevive a unas vacaciones) y la cola
   **dice quién puede firmar cada solicitud**, avisando cuando no puede nadie.

4. **⭐ El motivo tipificado no alcanza como motivo.** El ajuste de stock ya pedía uno (*«Rotura»*),
   pero eso dice la categoría, no el hecho: dentro de seis meses no le sirve a nadie. Ahora el kardex
   se queda con el código —que es lo que agrupa y reporta— y la auditoría con la frase escrita.

5. **⭐ La pregunta que F2 dejó abierta, contestada.** Cuando una regla propone y una persona aprueba,
   **el actor es quien ejecutó** —quien firmó, que es cuando la cosa efectivamente pasó— y quién lo
   pidió queda en el `meta` (`solicitadoPor`, `aprobacion`). Son las dos cosas, y el asiento las
   dice a las dos.

6. **⭐ Una automatización tampoco saltea un grado, y ahora eso no lo decide el motor.** Antes la
   regla decidía llamar a la cola de Automatizaciones; ahora la operación misma se niega a ejecutar y
   encola, venga de una persona, de una regla o de una conexión. Es la regla del otro módulo
   (*"nada que un usuario no pueda hacer a mano, por el mismo camino"*) puesta donde no se puede
   esquivar.

7. **El portón es hoja y por eso no emite: avisa.** `setAlertSink` le da a `securityApi` el aviso, y
   **el que publica el evento de dominio es el módulo dueño** — la misma regla que Integraciones
   aprendió con lo entrante. Y lo que **no** se emite también es una decisión: una acción denegada o
   un cambio de precio quedan en la auditoría, porque un evento del bus necesita un tipo de sujeto y
   *"algo sensible pasó sobre un pedido, un SKU o un comprobante"* no tiene tipo.

8. **Se cayó el `{ role }` que las pantallas pasaban a mano.** `enableConnection(portKey, { role })`
   era la UI diciéndole al `api/` con qué rol lo llamaba. Con el actor de ambiente eso desaparece:
   el que llama no elige quién es.

9. **Un asiento por operación, no uno por SKU.** F2 dejaba **un asiento por cada SKU** de un ajuste, y
   estaba mal: un ajuste es *una* operación con *un* motivo, y verla partida en cinco asientos
   idénticos hace dudar de si fueron cinco ajustes. Ahora es un asiento con una línea de cambio por
   SKU.

10. **Declarado y no cableado, dicho:** `pedidos.descuento` sigue sin portón a propósito. Esa función
    es hoy el canal pasivo por el que baja el cupón de Marketing en el checkout, y pedirle un motivo
    a cada cupón sería absurdo; el override manual de descuento todavía no existe como operación
    aparte. Igual que en F1 y F2, se prefiere decirlo en el catálogo antes que fingir cobertura.

11. **Bug ajeno encontrado verificando (y arreglado):** `bus.record()` armaba la entrada como
    `{ id: nuevo, ...event }`, y el escáner pasa sus eventos sintéticos con `id: null` esperando que
    el bus se lo asigne. Resultado: **todos los eventos observados quedaban con `id: null`** — la
    bandeja los renderizaba con la misma clave de React y el trabajo encolado no podía volver a la
    entrada que lo originó.

#### Verificación de F3

Todo conducido desde la UI, con dos personas distintas:

```
motivo antes      : «ajuste» (6 caracteres) deja el botón deshabilitado —
                    «Faltan 4 caracteres: "ajuste" no le va a servir a nadie»
con motivo        : Camila cambia $45.000 → $48.000 (+6,7 %) y se aplica;
                    el asiento dice «productos.precio · con motivo» con la frase
escala sola       : el MISMO diálogo, con $70.000 (+45,8 %), pasa a
                    «Con aprobación · Cambiar el precio fuera de umbral» y avisa
                    «No se va a aplicar ahora»
la cola           : APS-0001 · lo pidió Camila Ferreyra («sos vos») ·
                    «Quien lo pidió no puede aprobarlo. Ése es el punto de pedirla»
                    · «Puede firmarla: Sofía Bianchi»
⭐ el segundo par : Sofía firma → «Aprobada y ejecutada», el precio pasa a $70.000
   de ojos          y el asiento queda firmado por **Sofía**, con
                    «solicitadoPor: Camila Ferreyra · aprobacion: APS-0001»
umbral de stock   : el mismo formulario dice «Con motivo · valorizado en $112.000»
                    con −4 unidades y «Con aprobación · $280.000» con −10
no se aplica      : tras encolar APS-0002, la lista de ajustes sigue con 2 filas
elegibles reales  : «Puede firmarla: Camila Ferreyra, Martín Sosa» — Martín entra
                    por su **excepción nominal**, no por su rol (que lo excluye)
cancelación       : el pedido #10253 queda con «Motivo: "La clienta pidió anularlo
                    por teléfono…"» **dentro del pedido**
alertas           : «seguridad.aprobacion_pendiente» y «seguridad.aprobacion_resuelta»
                    aparecen en la bandeja de eventos con su contrato
```

Lint y build limpios; consola sin errores (los dos avisos de clave duplicada que aparecieron eran el
bug de `bus.record()` del punto 11, ya corregido).

#### Lo que queda declarado y vacío (§4.7)

**Configuración** sigue sin módulo (`/configuracion` deshabilitado), así que su grado está declarado
y no se aplica en ningún lado. No es una omisión: es lo mismo que se dijo en el diagnóstico (§1.3), y
se cablea el día que ese módulo exista.
