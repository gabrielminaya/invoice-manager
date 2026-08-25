"use client";

import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Abre el diálogo de impresión del navegador. En móvil y escritorio, la opción
 * "Guardar como PDF" produce el PDF de la factura sin depender de ninguna
 * librería de generación de documentos en el servidor.
 */
export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="w-full">
      <Icon name="print" size={18} />
      {label}
    </Button>
  );
}
