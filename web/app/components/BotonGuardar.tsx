"use client";

// Botón "Guardar análisis" — el equivalente al "Download PDF" de Aetheris,
// pero sin añadir librerías: el navegador ya sabe imprimir a PDF. Lo que
// faltaba era la hoja de impresión (vive en globals.css, dentro de
// @media print) que quita el menú lateral y pone el papel en blanco.
//
// Se cambia el título del documento justo antes de imprimir porque el nombre
// que el navegador le propone al PDF sale de `document.title`: sin esto todos
// los análisis se guardarían como "Nagimi AI.pdf" y en Descargas no se
// distinguiría uno de otro.

import { useCallback, useEffect, useState } from "react";
import { encabezadoImpresion, tituloImpresion } from "@/lib/tituloImpresion";

export default function BotonGuardar({ ticker }: { ticker?: string | null }) {
  // La fecha se calcula DESPUÉS de montar, no al pintar: el servidor y el
  // navegador pintan en momentos distintos y, si cae un cambio de día en el
  // medio, React se queja de que el texto no coincide.
  const [encabezado, setEncabezado] = useState("");
  useEffect(() => {
    setEncabezado(encabezadoImpresion(ticker, new Date()));
  }, [ticker]);

  const guardar = useCallback(() => {
    const anterior = document.title;
    document.title = tituloImpresion(ticker, new Date());

    // El título se devuelve con 'afterprint' y no en la línea de abajo porque
    // Chrome se queda esperando a que cierres el diálogo, pero Firefox y Safari
    // siguen de largo: si se restaurara enseguida, en esos dos el PDF saldría
    // con el nombre viejo.
    const restaura = () => {
      document.title = anterior;
      window.removeEventListener("afterprint", restaura);
    };
    window.addEventListener("afterprint", restaura);

    window.print();
  }, [ticker]);

  return (
    <div className="guardar">
      {/* Esta línea SOLO sale en papel. En pantalla el ticker y la fecha ya
          están arriba, pero el PDF viaja solo (se manda por correo, se abre
          meses después) y sin esto no se sabe de qué día es. */}
      <div className="impreso-cabecera">{encabezado}</div>

      <button type="button" className="guardar-btn" onClick={guardar}>
        ⭳ Guardar análisis
      </button>
      <div className="guardar-nota">
        Se abre el cuadro de imprimir del navegador: en “Destino” escoge “Guardar como PDF”.
      </div>
    </div>
  );
}
