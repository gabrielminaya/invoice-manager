import { Icon } from "@/components/icons";

/**
 * Buscador por GET: sin JavaScript, el navegador recarga la página con `?q=`.
 * Los filtros activos se reenvían como campos ocultos para no perderlos.
 */
export function SearchForm({
  action,
  placeholder,
  defaultValue,
  hidden,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} className="relative">
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <Icon
        name="search"
        size={17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
    </form>
  );
}

/** Fila de filtros deslizable horizontalmente, al estilo de las apps móviles. */
export function FilterChips({
  options,
  active,
  hrefFor,
}: {
  options: { value: string; label: string; count?: number }[];
  active: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <a
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={selected ? "true" : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors ${
              selected
                ? "border-transparent bg-accent text-white"
                : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {option.label}
            {option.count != null ? (
              <span className={selected ? "text-white/75" : "text-faint"}>{option.count}</span>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}
