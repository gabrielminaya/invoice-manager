"use client";

import { useActionState, useState } from "react";
import { createSubscription, updateSubscription } from "@/lib/actions/subscriptions";
import { ClientCombobox } from "@/components/client-combobox";
import { CompanySelect, type CompanyChoice } from "@/components/company-select";
import { LineItemsEditor, type InitialLine } from "@/components/line-items-editor";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, Field, FormError, Input, Select, Switch, Textarea } from "@/components/ui";
import { advance, INTERVAL_LABEL } from "@/lib/recurrence";
import { formatDateLong, isISODate, type ISODate } from "@/lib/dates";
import {
  currencyEnum,
  recurrenceIntervalEnum,
  type Currency,
  type RecurrenceInterval,
  type Subscription,
} from "@/lib/db/schema";
import { CURRENCY_LABEL } from "@/lib/money";
import { paymentMethodOptions } from "@/lib/payment-methods";
import type { ActionState } from "@/lib/form";

export type ClientChoice = {
  id: string;
  companyId: string;
  name: string;
  currency: Currency | null;
  taxRate: number | null;
};

export function SubscriptionForm({
  subscription,
  initialLines,
  companies,
  clients,
  activeCompanyId,
  today,
  preselectedClientId,
}: {
  subscription?: Subscription;
  initialLines?: InitialLine[];
  companies: CompanyChoice[];
  clients: ClientChoice[];
  activeCompanyId: string;
  today: ISODate;
  preselectedClientId?: string;
}) {
  const editing = Boolean(subscription);
  const [state, action] = useActionState<ActionState, FormData>(
    editing ? updateSubscription : createSubscription,
    {},
  );

  const preselected = clients.find((client) => client.id === preselectedClientId);

  // Al editar, la compañía emisora queda fija: cambiarla dejaría las facturas
  // ya emitidas colgando de otra serie de numeración.
  const [companyId, setCompanyId] = useState(
    subscription?.companyId ?? preselected?.companyId ?? activeCompanyId,
  );
  const [clientId, setClientId] = useState(subscription?.clientId ?? preselected?.id ?? "");

  const company = companies.find((c) => c.id === companyId) ?? companies[0];
  const clientsOfCompany = clients.filter((client) => client.companyId === companyId);
  const selectedClient =
    clientsOfCompany.find((client) => client.id === clientId) ?? clientsOfCompany[0];

  const [interval, setInterval] = useState<RecurrenceInterval>(
    subscription?.interval ?? "monthly",
  );
  const [intervalCount, setIntervalCount] = useState(String(subscription?.intervalCount ?? 1));
  const [startDate, setStartDate] = useState<ISODate>(subscription?.startDate ?? today);
  const [currency, setCurrency] = useState<Currency>(
    subscription?.currency ?? preselected?.currency ?? company.defaultCurrency,
  );
  const [taxRate, setTaxRate] = useState(
    String(subscription?.taxRate ?? preselected?.taxRate ?? company.defaultTaxRate),
  );

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    const primero = clients.find((client) => client.companyId === nextCompanyId);
    setClientId(primero?.id ?? "");
    const siguiente = companies.find((c) => c.id === nextCompanyId);
    if (siguiente) {
      setCurrency(primero?.currency ?? siguiente.defaultCurrency);
      setTaxRate(String(primero?.taxRate ?? siguiente.defaultTaxRate));
    }
  }

  // Vista previa de las tres próximas emisiones: hace tangible la regla de
  // recurrencia antes de guardarla.
  const preview = buildPreview(startDate, interval, Number(intervalCount) || 1);

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
          description="Registra un cliente en esta compañía para poder crearle una recurrencia."
        />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {subscription ? <input type="hidden" name="id" value={subscription.id} /> : null}

      <Card className="space-y-3.5 p-4">
        <Field label="Nombre del contrato" hint="Uso interno; los conceptos son lo que se factura.">
          <Input
            name="name"
            required
            defaultValue={subscription?.name}
            placeholder="Mantenimiento mensual"
          />
        </Field>

        {editing ? null : (
          <CompanySelect companies={companies} value={companyId} onChange={changeCompany} />
        )}

        <ClientCombobox
          clients={clientsOfCompany}
          value={selectedClient?.id ?? ""}
          onChange={(nextClientId) => {
            // Al cambiar de cliente se adoptan sus condiciones pactadas.
            setClientId(nextClientId);
            const client = clients.find((c) => c.id === nextClientId);
            if (client?.currency) setCurrency(client.currency);
            if (client?.taxRate != null) setTaxRate(String(client.taxRate));
          }}
        />
      </Card>

      <Card className="space-y-3.5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Recurrencia</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Frecuencia">
            <Select
              name="interval"
              value={interval}
              onChange={(event) => setInterval(event.target.value as RecurrenceInterval)}
            >
              {recurrenceIntervalEnum.enumValues.map((value) => (
                <option key={value} value={value}>
                  {INTERVAL_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cada" hint={unitLabel(interval, Number(intervalCount) || 1)}>
            <Input
              type="number"
              name="intervalCount"
              min={1}
              max={60}
              inputMode="numeric"
              value={intervalCount}
              onChange={(event) => setIntervalCount(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Primera emisión">
            <Input
              type="date"
              name="startDate"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value as ISODate)}
            />
          </Field>
          <Field label="Fin (opcional)" hint="Vacío = sin fecha de fin.">
            <Input
              type="date"
              name="endDate"
              min={startDate}
              defaultValue={subscription?.endDate ?? ""}
            />
          </Field>
        </div>

        {editing ? (
          <Field
            label="Próxima emisión"
            hint="Es la fecha que consulta el cronjob. Ajústala para adelantar o retrasar el siguiente ciclo."
          >
            <Input
              type="date"
              name="nextRunDate"
              required
              defaultValue={subscription?.nextRunDate}
            />
          </Field>
        ) : null}

        <Field
          label="Número máximo de facturas (opcional)"
          hint="Al alcanzarlo, la recurrencia queda finalizada."
        >
          <Input
            type="number"
            name="maxOccurrences"
            min={1}
            inputMode="numeric"
            defaultValue={subscription?.maxOccurrences ?? ""}
            placeholder="Sin límite"
          />
        </Field>

        {preview.length > 0 ? (
          <div className="rounded-xl bg-accent-soft px-3.5 py-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-accent-text">
              Próximas emisiones
            </p>
            <ul className="mt-1 space-y-0.5 text-[0.8125rem] text-accent-text">
              {preview.map((date) => (
                <li key={date}>{formatDateLong(date)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-faint">
          Conceptos de cada factura
        </h2>
        <LineItemsEditor
          initialLines={initialLines}
          defaultTaxRate={Number(taxRate) || 0}
          currency={currency}
        />
      </div>

      <Card className="space-y-3.5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Condiciones</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Divisa">
            <Select
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              {currencyEnum.enumValues.map((value) => (
                <option key={value} value={value}>
                  {value} · {CURRENCY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ITBIS % por defecto">
            <Input
              type="number"
              name="taxRate"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de pago">
            <Select
              name="paymentMethod"
              defaultValue={subscription?.paymentMethod ?? company.defaultPaymentMethod}
            >
              {paymentMethodOptions(subscription?.paymentMethod ?? company.defaultPaymentMethod).map(
                (method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Días de crédito" hint="Vacío = el del cliente.">
            <Input
              type="number"
              name="paymentTermsDays"
              min={0}
              max={365}
              inputMode="numeric"
              defaultValue={subscription?.paymentTermsDays ?? ""}
              placeholder="—"
            />
          </Field>
        </div>

        <Field label="Notas" hint="Se añaden al pie de cada factura generada.">
          <Textarea name="notes" defaultValue={subscription?.notes ?? ""} />
        </Field>

        <Switch
          name="autoIssue"
          label="Emitir automáticamente"
          hint="Encendido: el cronjob emite la factura lista para cobrar. Apagado: la deja en borrador para que la revises."
          defaultChecked={subscription?.autoIssue ?? true}
        />
      </Card>

      <SubmitButton className="w-full" pendingLabel="Guardando…">
        {editing ? "Guardar cambios" : "Crear recurrencia"}
      </SubmitButton>
    </form>
  );
}

function unitLabel(interval: RecurrenceInterval, count: number): string {
  const units: Record<RecurrenceInterval, [string, string]> = {
    weekly: ["semana", "semanas"],
    monthly: ["mes", "meses"],
    quarterly: ["trimestre", "trimestres"],
    semiannual: ["semestre", "semestres"],
    yearly: ["año", "años"],
  };
  const [one, many] = units[interval];
  return count === 1 ? one : many;
}

function buildPreview(
  startDate: string,
  interval: RecurrenceInterval,
  intervalCount: number,
): ISODate[] {
  if (!isISODate(startDate)) return [];
  const dates: ISODate[] = [startDate];
  for (let i = 0; i < 2; i += 1) {
    dates.push(advance(dates[dates.length - 1], interval, intervalCount));
  }
  return dates;
}
