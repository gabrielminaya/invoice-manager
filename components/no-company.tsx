import { PageHeader, LinkButton, EmptyState } from "@/components/ui";

/** Estado inicial de la app: todavía no hay ninguna compañía emisora. */
export function NoCompany({ title = "Facturación" }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <main className="px-4 py-6">
        <EmptyState
          icon="building"
          title="Crea tu compañía emisora"
          description="Necesitas al menos una compañía —con su RNC, dirección y serie de facturación— antes de registrar clientes y recurrencias."
          action={
            <LinkButton href="/settings/companies/new">Crear compañía</LinkButton>
          }
        />
      </main>
    </>
  );
}
