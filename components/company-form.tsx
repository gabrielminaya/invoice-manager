"use client";

import { useActionState, useState } from "react";
import { createCompany, updateCompany } from "@/lib/actions/companies";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormError, Input, Select } from "@/components/ui";
import { currencyEnum, type Company } from "@/lib/db/schema";
import { formatInvoiceNumber } from "@/lib/numbering";
import { CURRENCY_LABEL } from "@/lib/money";
import { DEFAULT_PAYMENT_METHOD, paymentMethodOptions } from "@/lib/payment-methods";
import type { ActionState } from "@/lib/form";

export function CompanyForm({ company }: { company?: Company }) {
  const editing = Boolean(company);
  const [state, action] = useActionState<ActionState, FormData>(
    editing ? updateCompany : createCompany,
    {},
  );

  // Prefijo y serie sí son decisión del usuario; el correlativo no. Se guardan
  // en estado solo para que la vista previa del número reaccione al escribir.
  const [prefix, setPrefix] = useState(company?.invoicePrefix ?? "FAC");
  const [series, setSeries] = useState(company?.invoiceSeries ?? "General");

  const nextNumber = formatInvoiceNumber(
    prefix,
    (company?.docCounter ?? 0) + 1,
    company?.numberFormat ?? "hex",
  );
  const nextSeriesNumber = (company?.seriesCounter ?? 0) + 1;

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {company ? <input type="hidden" name="id" value={company.id} /> : null}

      <Card className="space-y-3.5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
          Datos del emisor
        </h2>

        <Field label="Nombre comercial" hint="Es el que se imprime en la cabecera de la factura.">
          <Input name="name" required defaultValue={company?.name} placeholder="Neurosoft" />
        </Field>

        <Field label="Razón social">
          <Input name="legalName" defaultValue={company?.legalName ?? ""} placeholder="Neurosoft SRL" />
        </Field>

        <Field label="RNC">
          <Input name="rnc" defaultValue={company?.rnc ?? ""} inputMode="numeric" placeholder="131-00000-1" />
        </Field>

        <Field label="Dirección">
          <Input
            name="addressLine"
            defaultValue={company?.addressLine ?? ""}
            placeholder="CALLE PALMA LINDA NUM. W4"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Código postal">
            <Input name="postalCode" defaultValue={company?.postalCode ?? ""} placeholder="51000" />
          </Field>
          <Field label="Ciudad">
            <Input name="city" defaultValue={company?.city ?? ""} placeholder="Santiago" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Región">
            <Input name="region" defaultValue={company?.region ?? ""} placeholder="Dominican Rep. reg." />
          </Field>
          <Field label="País">
            <Input
              name="country"
              required
              defaultValue={company?.country ?? "República Dominicana"}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono">
            <Input type="tel" name="phone" defaultValue={company?.phone ?? ""} placeholder="8294513026" />
          </Field>
          <Field label="Correo" hint="Recibe copia (CC) de los correos enviados a tus clientes.">
            <Input type="email" name="email" defaultValue={company?.email ?? ""} placeholder="support@neurosoft.dev" />
          </Field>
        </div>

        <Field label="Sitio web">
          <Input type="url" name="website" defaultValue={company?.website ?? ""} placeholder="https://" />
        </Field>

        <Field
          label="Logo"
          hint="Se muestra a la izquierda de la cabecera de la factura. Copia el archivo en public/logos/ y pon la ruta (/logos/mi-logo.svg), o pega una URL completa o un data-URI."
        >
          <Input
            name="logoUrl"
            defaultValue={company?.logoUrl ?? ""}
            placeholder="/logos/mi-logo.svg"
          />
        </Field>
      </Card>

      <Card className="space-y-3.5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
          Valores por defecto
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Divisa">
            <Select name="defaultCurrency" defaultValue={company?.defaultCurrency ?? "DOP"}>
              {currencyEnum.enumValues.map((value) => (
                <option key={value} value={value}>
                  {value} · {CURRENCY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ITBIS %" hint="18 en República Dominicana; 0 si estás exento.">
            <Input
              type="number"
              name="defaultTaxRate"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              defaultValue={company?.defaultTaxRate ?? 0}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Días de crédito" hint="0 = vence el mismo día.">
            <Input
              type="number"
              name="defaultPaymentTermsDays"
              min={0}
              max={365}
              inputMode="numeric"
              defaultValue={company?.defaultPaymentTermsDays ?? 0}
            />
          </Field>
          <Field label="Forma de pago" hint="La que se propone en cada factura nueva.">
            <Select
              name="defaultPaymentMethod"
              required
              defaultValue={company?.defaultPaymentMethod ?? DEFAULT_PAYMENT_METHOD}
            >
              {paymentMethodOptions(company?.defaultPaymentMethod).map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-3.5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Numeración</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prefijo">
            <Input
              name="invoicePrefix"
              required
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
            />
          </Field>
          <Field label="Serie">
            <Input
              name="invoiceSeries"
              required
              value={series}
              onChange={(event) => setSeries(event.target.value)}
            />
          </Field>
        </div>

        {/* El correlativo lo lleva el sistema: aquí solo se muestra, para que
            quede claro qué número saldrá sin poder descuadrarlo a mano. */}
        <p className="rounded-xl bg-accent-soft px-3.5 py-3 text-[0.8125rem] leading-relaxed text-accent-text">
          Las facturas se numeran automáticamente. La {company ? "próxima" : "primera"} será{" "}
          <strong className="tabular font-semibold">{nextNumber}</strong>, número{" "}
          <strong className="tabular font-semibold">{nextSeriesNumber}</strong> de la serie{" "}
          {series || "General"}.
        </p>
      </Card>

      <SubmitButton className="w-full" pendingLabel="Guardando…">
        {editing ? "Guardar cambios" : "Crear compañía"}
      </SubmitButton>
    </form>
  );
}
