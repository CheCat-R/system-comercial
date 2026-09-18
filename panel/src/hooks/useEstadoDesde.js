/**
 * Estado local que se arma a partir de un dato externo (la respuesta de una
 * query, por ejemplo) y se vuelve a armar cuando ese dato cambia de identidad.
 * Es el patrón "ajustar estado durante el render" de React, sin useEffect:
 * no hay render intermedio con el formulario vacío ni el dato viejo.
 */
import { useState } from "react";

export const useEstadoDesde = (fuente, derivar) => {
  const [estado, setEstado] = useState(() => derivar(fuente));
  const [vista, setVista] = useState(fuente);
  if (fuente !== vista) {
    setVista(fuente);
    setEstado(derivar(fuente));
  }
  return [estado, setEstado];
};
