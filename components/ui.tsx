import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import type { InvoiceStatus, SubscriptionStatus } from "@/lib/db/schema";

/* ------------------------------------------------------------------ *
 * Clases compartidas
 * ------------------------------------------------------------------ */

/** Altura mínima 44px en todo lo pulsable: el objetivo táctil recomendado. */
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-medium transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const buttonVariants = {
  primary: `${BUTTON_BASE} bg-accent text-white hover:bg-accent-hover shadow-sm`,
  secondary: `${BUTTON_BASE} bg-surface-2 text-ink hover:bg-line border border-line`,
  ghost: `${BUTTON_BASE} text-muted hover:bg-surface-2 hover:text-ink`,
  danger: `${BUTTON_BASE} bg-danger-soft text-danger hover:brightness-95 border border-transparent`,
  success: `${BUTTON_BASE} bg-success text-white hover:brightness-95 shadow-sm`,
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={`${buttonVariants[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${buttonVariants[variant]} ${className}`} {...props} />;
}

/* ------------------------------------------------------------------ *
 * Superficies
 * ------------------------------------------------------------------ */

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-faint">
        <Icon name={icon} size={22} />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cabecera de página
 * ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-lg no-print">
      <div className="pt-safe" />
      <div className="page-shell flex items-center gap-2 py-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Volver"
            className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="chevronLeft" size={22} />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? (
            <p className="truncate text-[0.8125rem] leading-tight text-muted">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Insignias de estado
 * ------------------------------------------------------------------ */

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "bg-surface-2 text-muted" },
  issued: { label: "Emitida", className: "bg-accent-soft text-accent-text" },
  paid: { label: "Pagada", className: "bg-success-soft text-success" },
  overdue: { label: "Vencida", className: "bg-danger-soft text-danger" },
  void: { label: "Anulada", className: "bg-surface-2 text-faint line-through" },
};

const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; className: string }> = {
  active: { label: "Activa", className: "bg-success-soft text-success" },
  paused: { label: "Pausada", className: "bg-warning-soft text-warning" },
  cancelled: { label: "Cancelada", className: "bg-surface-2 text-faint" },
  finished: { label: "Finalizada", className: "bg-accent-soft text-accent-text" },
};

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = INVOICE_STATUS[status];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const meta = SUBSCRIPTION_STATUS[status];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export const invoiceStatusLabel = (status: InvoiceStatus) => INVOICE_STATUS[status].label;

/* ------------------------------------------------------------------ *
 * Campos de formulario
 * ------------------------------------------------------------------ */

const CONTROL =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-ink placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25";

/**
 * Etiqueta + control + pista.
 *
 * Por defecto envuelve todo en un `<label>`, que es lo más simple para un
 * control nativo. Con `htmlFor` se separan: hace falta cuando el control trae
 * su propio menú desplegable —el combobox—, porque un clic dentro de un
 * `<label>` se reenvía al campo y volvería a abrirlo.
 */
export function Field({
  label,
  hint,
  children,
  className = "",
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const Wrapper = htmlFor ? "div" : "label";
  const labelClass = "block text-[0.8125rem] font-medium text-muted";

  return (
    <Wrapper className={`block space-y-1.5 ${className}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
      {hint ? <span className="block text-xs leading-snug text-faint">{hint}</span> : null}
    </Wrapper>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${CONTROL} min-h-24 resize-y ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${CONTROL} appearance-none pr-9 ${className}`} {...props} />;
}

export function Switch({
  label,
  hint,
  name,
  defaultChecked,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-xs leading-snug text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
    >
      <Icon name="alert" size={18} className="mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Filas de lista
 * ------------------------------------------------------------------ */

export function ListRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors first:rounded-t-card last:rounded-b-card hover:bg-surface-2 active:bg-surface-2"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
    </Link>
  );
}

export function Divided({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Listados que se vuelven tabla en pantallas anchas
 *
 * En móvil cada fila es una tarjeta apilada; desde `md` pasa a rejilla con
 * columnas alineadas y cabecera, que es como mejor se comparan importes y
 * fechas. Cada modo tiene su propio marcado para que ninguno quede
 * comprometido por el otro; los datos salen del mismo objeto.
 * ------------------------------------------------------------------ */

/** Cabecera de la tabla. No existe por debajo de `lg`: allí cada fila se explica sola. */
export function TableHead({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div
      className="hidden border-b border-line px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-faint lg:grid lg:items-center lg:gap-4"
      style={{ gridTemplateColumns: columns }}
      role="presentation"
    >
      {children}
    </div>
  );
}

/** Fila pulsable: `mobile` se ve por debajo de `md`, `desktop` a partir de `md`. */
export function TableRow({
  href,
  columns,
  mobile,
  desktop,
}: {
  href: string;
  columns: string;
  mobile: ReactNode;
  desktop: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block px-4 py-3.5 transition-colors first:rounded-t-card last:rounded-b-card hover:bg-surface-2 active:bg-surface-2"
    >
      <div className="flex items-center gap-3 lg:hidden">
        <div className="min-w-0 flex-1">{mobile}</div>
        <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
      </div>

      <div
        className="hidden lg:grid lg:items-center lg:gap-4"
        style={{ gridTemplateColumns: columns }}
      >
        {desktop}
      </div>
    </Link>
  );
}

/** Celda de tabla con recorte por elipsis. */
export function Cell({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignment =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return <div className={`min-w-0 truncate ${alignment} ${className}`}>{children}</div>;
}

/** Fila etiqueta / valor, para paneles de detalle. */
export function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-[0.8125rem] text-muted">{label}</dt>
      <dd className={`min-w-0 text-right text-[0.9375rem] text-ink ${mono ? "tabular" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
