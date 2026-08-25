"use client";

import { useActionState } from "react";
import { createClient, updateClient } from "@/lib/actions/clients";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormError, Input, Select, Switch, Textarea } from "@/components/ui";
import { currencyEnum, type Client, type Currency } from "@/lib/db/schema";
import { CURRENCY_LABEL } from "@/lib/money";
import type { ActionState } from "@/lib/form";

export function ClientForm({
  client,
  companyDefaults,
}: {
  client?: Client;
  companyDefaults: { currency: Currency; taxRate: number; paymentTermsDays: number };
}) {
  const editing = Boolean(client);
  const [state, action] = useActionState<ActionState, FormData>(
    editing ? updateClient : createClient,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {client ? <input type="hidden" name="id" value={client.id} /> : null}

      <Card className="space-y-3.5 p-4">
        <Field label="Nombre o razón social">
          <Input name="name" required defaultValue={client?.name} placeholder="Cliente S.R.L." />
        </Field>

        <Field label="RNC / Cédula">
          <Input name="rnc" defaultValue={client?.rnc ?? ""} placeholder="130-87881-1" inputMode="numeric" />
        </Field>

        <Field label="Dirección" hint="Se imprime en la factura tal como la escribas.">
          <Input
            name="addressLine"
            defaultValue={client?.addressLine ?? ""}
            placeholder="C/Rafael A. Sanchez 39, Piantini"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ciudad">
            <Input name="city" defaultValue={client?.city ?? ""} placeholder="Santo Domingo" />
          </Field>
          <Field label="País">
            <Input
              name="country"
              defaultValue={client?.country ?? "República Dominicana"}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Correo">
            <Input type="email" name="email" defaultValue={client?.email ?? ""} placeholder="pagos@cliente.do" />
          </Field>
          <Field label="Teléfono">
            <Input type="tel" name="phone" defaultValue={client?.phone ?? ""} placeholder="809 000 0000" />
          </Field>
        </div>

        <Field
          label="Correos en copia (CC)"
          hint="Separa varias direcciones con comas. Reciben copia de la factura, el recibo y los avisos de vencimiento."
        >
          <Textarea
            name="emailCc"
            rows={2}
            defaultValue={client?.emailCc ?? ""}
            placeholder="contabilidad@cliente.do, gerencia@cliente.do"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      </Card>

      <Card className="space-y-3.5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
          Condiciones de facturación
        </h2>
        <p className="-mt-1.5 text-xs text-muted">
          Si dejas un campo vacío, se usa el valor de la compañía emisora.
        </p>

        <Field label="Divisa">
          <Select name="currency" defaultValue={client?.currency ?? ""}>
            <option value="">
              Heredar de la compañía ({companyDefaults.currency})
            </option>
            {currencyEnum.enumValues.map((value) => (
              <option key={value} value={value}>
                {value} · {CURRENCY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Días de crédito"
            hint={`Compañía: ${companyDefaults.paymentTermsDays}`}
          >
            <Input
              type="number"
              name="paymentTermsDays"
              min={0}
              max={365}
              inputMode="numeric"
              defaultValue={client?.paymentTermsDays ?? ""}
              placeholder="—"
            />
          </Field>
          <Field label="ITBIS %" hint={`Compañía: ${companyDefaults.taxRate}`}>
            <Input
              type="number"
              name="taxRate"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              defaultValue={client?.taxRate ?? ""}
              placeholder="—"
            />
          </Field>
        </div>

        <Field label="Notas internas">
          <Textarea name="notes" defaultValue={client?.notes ?? ""} />
        </Field>

        <Switch
          name="active"
          label="Cliente activo"
          hint="Los inactivos no aparecen al crear facturas, pero conservan su historial."
          defaultChecked={client?.active ?? true}
        />
      </Card>

      <SubmitButton className="w-full" pendingLabel="Guardando…">
        {editing ? "Guardar cambios" : "Crear cliente"}
      </SubmitButton>
    </form>
  );
}
