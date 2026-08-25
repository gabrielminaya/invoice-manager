"use client";

import { useActionState, useState } from "react";
import { createInvoice } from "@/lib/actions/invoices";
import { ClientCombobox } from "@/components/client-combobox";
import { CompanySelect, type CompanyChoice } from "@/components/company-select";
import { LineItemsEditor } from "@/components/line-items-editor";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, FormError, Input, Select, Switch, Textarea } from "@/components/ui";
import { addDays, type ISODate } from "@/lib/dates";
import { currencyEnum, type Currency } from "@/lib/db/schema";
import { CURRENCY_LABEL } from "@/lib/money";
import { paymentMethodOptions } from "@/lib/payment-methods";
import type { ActionState } from "@/lib/form";

export type ClientOption = {
  id: string;
  companyId: string;
  name: string;
  currency: Currency | null;
  paymentTermsDays: number | null;
  taxRate: number | null;
};

export function InvoiceForm({
  companies,
  clients,
  activeCompanyId,
  today,
  preselectedClientId,
}: {
  companies: CompanyChoice[];
  clients: ClientOption[];
  activeCompanyId: string;
  today: ISODate;
  preselectedClientId?: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createInvoice, {});

  // Si se llega desde un cliente concreto, se arranca en su compañía.
  const preselected = clients.find((client) => client.id === preselectedClientId);
  const [companyId, setCompanyId] = useState(preselected?.companyId ?? activeCompanyId);
  const [clientId, setClientId] = useState(preselected?.id ?? "");
  const [issueDate, setIssueDate] = useState<ISODate>(today);

  const company = companies.find((c) => c.id === companyId) ?? companies[0];
  const clientsOfCompany = clients.filter((client) => client.companyId === companyId);

  // El cliente elegido puede no pertenecer a la compañía actual tras cambiarla;
  // en ese caso se cae al primero de la nueva compañía.
  const selected =
    clientsOfCompany.find((client) => client.id === clientId) ?? clientsOfCompany[0];

  const currency = selected?.currency ?? company.defaultCurrency;
  const taxRate = selected?.taxRate ?? company.defaultTaxRate;
  const termsDays = selected?.paymentTermsDays ?? company.defaultPaymentTermsDays;
  const paymentMethod = company.defaultPaymentMethod;

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    const primero = clients.find((client) => client.companyId === nextCompanyId);
    setClientId(primero?.id ?? "");
  }

  if (clientsOfCompany.length === 0) {
    return (
      <div className="space-y-4">
        {companies.length > 1 ? (
          <Card className="p-4">
            <Field label="Compañía emisora">
              <Select value={companyId} onChange={(event) => changeCompany(event.target.value)}>
                {companies.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        ) : null}

        <EmptyState
          icon="users"
          title="Esta compañía no tiene clientes"
          description="Registra un cliente en esta compañía para poder facturarle."
        />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <Card className="space-y-3.5 p-4">
        <CompanySelect companies={companies} value={companyId} onChange={changeCompany} />

        <ClientCombobox
          clients={clientsOfCompany}
          value={selected?.id ?? ""}
          onChange={setClientId}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de emisión">
            <Input
              type="date"
              name="issueDate"
              required
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value as ISODate)}
            />
          </Field>
          <Field label="Vencimiento" hint={termsDays > 0 ? `${termsDays} días de crédito` : "Mismo día"}>
            {/* key: al cambiar la emisión o el cliente se recalcula el vencimiento. */}
            <Input
              key={`${issueDate}-${termsDays}`}
              type="date"
              name="dueDate"
              defaultValue={addDays(issueDate, termsDays)}
              min={issueDate}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Divisa">
            <Select name="currency" key={currency} defaultValue={currency}>
              {currencyEnum.enumValues.map((value) => (
                <option key={value} value={value}>
                  {value} · {CURRENCY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Forma de pago">
            <Select name="paymentMethod" key={paymentMethod} defaultValue={paymentMethod}>
              {paymentMethodOptions(paymentMethod).map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-faint">
          Conceptos
        </h2>
        <LineItemsEditor key={`${currency}-${taxRate}`} defaultTaxRate={taxRate} currency={currency} />
      </div>

      <Card className="space-y-3.5 p-4">
        <Field label="Notas" hint="Se imprimen al pie de la factura.">
          <Textarea name="notes" placeholder="Condiciones, referencias, período cubierto…" />
        </Field>

        <Switch
          name="issueNow"
          label="Emitir de inmediato"
          hint="Si lo dejas apagado, la factura queda en borrador y podrás revisarla antes."
          defaultChecked
        />
      </Card>

      <SubmitButton className="w-full" pendingLabel="Guardando…">
        Crear factura
      </SubmitButton>
    </form>
  );
}
