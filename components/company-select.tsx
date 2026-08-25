"use client";

import { Field, Select } from "@/components/ui";
import type { Currency } from "@/lib/db/schema";

/** Datos de la compañía que necesitan los formularios de emisión. */
export type CompanyChoice = {
  id: string;
  name: string;
  defaultCurrency: Currency;
  defaultTaxRate: number;
  defaultPaymentTermsDays: number;
  defaultPaymentMethod: string;
};

/**
 * Selector de compañía emisora.
 *
 * Con una sola compañía no se dibuja el desplegable —sería un menú de una
 * opción— pero el identificador se envía igual en un campo oculto, para que la
 * acción no dependa de la cookie de compañía activa.
 */
export function CompanySelect({
  companies,
  value,
  onChange,
}: {
  companies: CompanyChoice[];
  value: string;
  onChange: (companyId: string) => void;
}) {
  if (companies.length <= 1) {
    return <input type="hidden" name="companyId" value={value} />;
  }

  return (
    <Field label="Compañía emisora" hint="Determina la serie de numeración y los datos fiscales.">
      <Select name="companyId" value={value} onChange={(event) => onChange(event.target.value)}>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
