import { headers } from "next/headers";
import Link from "next/link";
import { getActiveCompany, listCompanies } from "@/lib/company-context";
import { listCronRuns, listUsers } from "@/lib/queries";
import { requireUser } from "@/lib/auth/dal";
import { signOut, toggleUserActive } from "@/lib/actions/auth";
import { describeMailConfig } from "@/lib/mail";
import { formatDateDO, todayInTimeZone } from "@/lib/dates";
import { formatInvoiceNumber } from "@/lib/numbering";
import { runCronFromUi } from "@/lib/actions/cron";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icons";
import {
  Badge,
  Card,
  DataRow,
  Divided,
  LinkButton,
  ListRow,
  PageHeader,
  SectionTitle,
} from "@/components/ui";

export const metadata = { title: "Ajustes" };

/**
 * Esta página consulta la base antes de leer cabeceras, así que sin este flag
 * Next intentaría prerenderizarla en el build y exigiría una base de datos
 * accesible durante la compilación. Nada aquí es cacheable de todos modos.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUser();
  const companies = await listCompanies();
  const active = await getActiveCompany();
  const runs = await listCronRuns(8);
  const users = await listUsers();

  const timeZone = process.env.CRON_TIMEZONE ?? "America/Santo_Domingo";
  const today = todayInTimeZone(timeZone);
  const secretConfigured = Boolean(process.env.CRON_SECRET);

  const mail = describeMailConfig();

  // La URL pública se deduce de la petición, así el ejemplo de curl sirve
  // igual en local, en preview y en producción.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/cron/recurring`;
  const curl = `curl -X POST '${endpoint}' \\\n  -H 'Authorization: Bearer $CRON_SECRET'`;

  return (
    <>
      <PageHeader title="Ajustes" subtitle={`Zona horaria ${timeZone}`} />

      <main className="page-shell py-4">
      {/* Dos columnas desde lg: la página es larga y en escritorio caben las
          secciones cortas (cuenta, usuarios, compañías) junto a las del cron. */}
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-6">
        {/* Cuenta */}
        <section>
          <SectionTitle>Tu cuenta</SectionTitle>
          <Card className="space-y-3 p-4">
            <div>
              <p className="font-medium text-ink">{session.name}</p>
              <p className="text-[0.8125rem] text-muted">{session.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <LinkButton href="/settings/account" variant="secondary" className="w-full">
                Cambiar contraseña
              </LinkButton>
              <form action={signOut}>
                <SubmitButton variant="ghost" className="w-full" pendingLabel="Saliendo…">
                  Cerrar sesión
                </SubmitButton>
              </form>
            </div>
          </Card>
        </section>

        {/* Usuarios */}
        <section>
          <SectionTitle
            action={
              <Link
                href="/settings/users/new"
                className="text-[0.8125rem] font-medium text-accent-text"
              >
                Añadir
              </Link>
            }
          >
            Usuarios con acceso
          </SectionTitle>
          <Card>
            <Divided>
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{user.name}</p>
                      {user.id === session.id ? (
                        <Badge className="bg-accent-soft text-accent-text">Tú</Badge>
                      ) : null}
                      {!user.active ? (
                        <Badge className="bg-surface-2 text-faint">Inactivo</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-[0.8125rem] text-muted">{user.email}</p>
                    <p className="text-xs text-faint">
                      {user.lastLoginAt
                        ? `último acceso ${user.lastLoginAt.toLocaleString("es-DO", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}`
                        : "nunca ha entrado"}
                      {user.activeSessions > 0 ? ` · ${user.activeSessions} sesión(es)` : ""}
                    </p>
                  </div>

                  {/* Nadie puede desactivarse a sí mismo y quedarse fuera. */}
                  {user.id === session.id ? null : (
                    <form action={toggleUserActive}>
                      <input type="hidden" name="id" value={user.id} />
                      <SubmitButton
                        variant="ghost"
                        className="px-3 text-[0.8125rem]"
                        confirm={
                          user.active
                            ? `¿Quitar el acceso a ${user.name}? Se cerrarán sus sesiones al expirar.`
                            : undefined
                        }
                      >
                        {user.active ? "Desactivar" : "Reactivar"}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              ))}
            </Divided>
          </Card>
        </section>

        {/* Compañías */}
        <section>
          <SectionTitle
            action={
              <Link
                href="/settings/companies/new"
                className="text-[0.8125rem] font-medium text-accent-text"
              >
                Añadir
              </Link>
            }
          >
            Compañías emisoras
          </SectionTitle>

          {companies.length === 0 ? (
            <Card className="px-4 py-5">
              <p className="text-sm text-muted">
                No hay compañías. Crea la primera para empezar a facturar.
              </p>
              <LinkButton href="/settings/companies/new" className="mt-3 w-full">
                Crear compañía
              </LinkButton>
            </Card>
          ) : (
            <Card>
              <Divided>
                {companies.map((company) => (
                  <ListRow key={company.id} href={`/settings/companies/${company.id}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-medium text-ink">{company.name}</p>
                      {company.id === active?.id ? (
                        <Badge className="bg-accent-soft text-accent-text">Activa</Badge>
                      ) : null}
                    </div>
                    <p className="tabular mt-0.5 truncate text-[0.8125rem] text-muted">
                      {company.rnc ? `RNC ${company.rnc} · ` : ""}
                      serie {company.invoiceSeries} · siguiente{" "}
                      {formatInvoiceNumber(
                        company.invoicePrefix,
                        company.docCounter + 1,
                        company.numberFormat,
                      )}
                    </p>
                  </ListRow>
                ))}
              </Divided>
            </Card>
          )}
        </section>

        </div>

        <div className="space-y-6">
        {/* Cronjob */}
        <section>
          <SectionTitle>Cronjob de recurrencia</SectionTitle>

          <Card className="space-y-3 p-4">
            <p className="text-sm leading-relaxed text-muted">
              Este endpoint emite las facturas de todas las recurrencias vencidas
              hasta hoy y marca en mora las que pasaron su vencimiento. Es
              idempotente: llamarlo varias veces el mismo día no duplica nada, así
              que puedes programarlo con tranquilidad una o varias veces al día.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">
                  Endpoint
                </span>
                <CopyButton value={endpoint} />
              </div>
              <code className="block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">
                {endpoint}
              </code>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">
                  Ejemplo
                </span>
                <CopyButton value={curl} />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-ink">
                {curl}
              </pre>
            </div>

            <div
              className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] ${
                secretConfigured ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              <Icon name={secretConfigured ? "check" : "alert"} size={16} className="mt-px shrink-0" />
              <span>
                {secretConfigured
                  ? "CRON_SECRET está configurado. El endpoint acepta el secreto por cabecera Authorization: Bearer, por x-cron-secret o por ?token=."
                  : "Falta CRON_SECRET. Mientras no lo definas, el endpoint responde 503 y no emite nada."}
              </span>
            </div>

            <dl className="divide-y divide-line rounded-xl border border-line">
              <DataRow label="Métodos" value="GET y POST" />
              <DataRow label="Fecha lógica de hoy" value={formatDateDO(today)} mono />
              <DataRow label="Parámetro asOf" value="Simula otra fecha de corte" />
              <DataRow label="Parámetro dryRun" value="Calcula sin escribir" />
            </dl>

            <div className="grid grid-cols-2 gap-2">
              <form action={runCronFromUi}>
                <input type="hidden" name="dryRun" value="1" />
                <SubmitButton variant="secondary" className="w-full" pendingLabel="Simulando…">
                  Simular ahora
                </SubmitButton>
              </form>
              <form action={runCronFromUi}>
                <SubmitButton
                  className="w-full"
                  pendingLabel="Ejecutando…"
                  confirm="Se emitirán las facturas de todas las recurrencias vencidas. ¿Continuar?"
                >
                  <Icon name="bolt" size={18} />
                  Ejecutar
                </SubmitButton>
              </form>
            </div>
          </Card>
        </section>

        {/* Correo */}
        <section>
          <SectionTitle>Correo</SectionTitle>
          <Card className="space-y-3 p-4">
            <p className="text-sm leading-relaxed text-muted">
              Al emitir una factura y al registrar un pago se avisa al cliente por
              correo, siempre que tenga dirección registrada.
            </p>
            <dl className="divide-y divide-line rounded-xl border border-line">
              <DataRow
                label="Proveedor"
                value={
                  mail.provider === "resend"
                    ? `Resend${mail.autoDetected ? " (detectado)" : ""}`
                    : "Simulado"
                }
              />
              <DataRow label="Remitente" value={mail.from ?? "sin configurar"} />
              {mail.replyTo ? <DataRow label="Responder a" value={mail.replyTo} /> : null}
              {mail.provider === "resend" ? (
                <DataRow
                  label="RESEND_API_KEY"
                  value={mail.credentialConfigured ? "Configurada" : "Falta"}
                />
              ) : null}
              <DataRow label="Envíos" value={mail.enabled ? "Activados" : "Silenciados"} />
            </dl>

            {mail.problems.length > 0 ? (
              <div className="space-y-1.5 rounded-xl bg-warning-soft px-3 py-2.5 text-[0.8125rem] text-warning">
                {mail.problems.map((problem) => (
                  <p key={problem} className="flex items-start gap-2">
                    <Icon name="alert" size={16} className="mt-px shrink-0" />
                    <span>{problem}</span>
                  </p>
                ))}
                {mail.provider === "mock" ? (
                  <p className="pl-6 text-xs opacity-90">
                    Pega tu clave de Resend en{" "}
                    <code className="font-mono">RESEND_API_KEY</code> y los correos
                    empezarán a salir sin tocar nada más.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-[0.8125rem] text-success">
                <Icon name="check" size={16} className="mt-px shrink-0" />
                <span>
                  Resend está configurado. Recuerda tener el dominio del remitente
                  verificado en Resend.
                </span>
              </div>
            )}
          </Card>
        </section>

        {/* Bitácora */}
        <section>
          <SectionTitle>Últimas corridas</SectionTitle>
          {runs.length === 0 ? (
            <Card className="px-4 py-4">
              <p className="text-sm text-muted">El cronjob todavía no se ha ejecutado.</p>
            </Card>
          ) : (
            <Card>
              <Divided>
                {runs.map((run) => (
                  <div key={run.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[0.9375rem] font-medium text-ink">
                        {run.createdCount} emitida(s)
                        {run.dryRun ? " · simulación" : ""}
                      </p>
                      <p className="shrink-0 text-[0.8125rem] text-muted">
                        {run.startedAt.toLocaleString("es-DO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                      corte {formatDateDO(run.asOfDate)} · {run.skippedCount} omitida(s)
                      {run.errorCount > 0 ? (
                        <span className="font-medium text-danger">
                          {" "}
                          · {run.errorCount} error(es)
                        </span>
                      ) : null}
                      {run.triggeredBy ? (
                        <span className="text-faint"> · {run.triggeredBy}</span>
                      ) : null}
                    </p>
                  </div>
                ))}
              </Divided>
            </Card>
          )}
        </section>
        </div>
      </div>
    </main>
    </>
  );
}
