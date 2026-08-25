"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Field, Input } from "@/components/ui";

/** Lo mínimo que el combobox necesita de un cliente. */
export type ComboboxOption = { id: string; name: string };

/** Sin acentos ni mayúsculas: escribir "angel" encuentra "Ángel". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Selector de cliente con búsqueda.
 *
 * Sustituye al `<select>` nativo porque con cien clientes recorrer la lista a
 * dedo es inviable. El valor viaja en un campo oculto —el cuadro de texto solo
 * filtra—, así que el formulario sigue enviando un id y nunca un nombre suelto:
 * al cerrarse, el texto vuelve siempre al del cliente elegido.
 */
export function ClientCombobox({
  clients,
  value,
  onChange,
  name = "clientId",
  label = "Cliente",
  hint,
}: {
  clients: ComboboxOption[];
  value: string;
  onChange: (clientId: string) => void;
  name?: string;
  label?: string;
  hint?: string;
}) {
  const inputId = useId();
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Hasta que no se escribe se ofrece la lista entera, no la filtrada por el nombre ya puesto. */
  const [typed, setTyped] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = clients.find((client) => client.id === value) ?? null;

  const matches = useMemo(() => {
    const needle = typed ? normalize(query) : "";
    if (!needle) return clients;
    return clients.filter((client) => normalize(client.name).includes(needle));
  }, [clients, query, typed]);

  // La opción marcada se mantiene a la vista al recorrer la lista con el teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, matches]);

  function openList() {
    setQuery(selected?.name ?? "");
    setTyped(false);
    setActiveIndex(Math.max(0, clients.findIndex((client) => client.id === value)));
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setTyped(false);
    setQuery("");
  }

  function select(option: ComboboxOption) {
    onChange(option.id);
    closeList();
  }

  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <div
        ref={containerRef}
        className="relative"
        onBlur={(event) => {
          // Solo se cierra al salir del conjunto: el botón de la flecha también
          // roba el foco al cuadro de texto y no debe contar como salida.
          if (!event.currentTarget.contains(event.relatedTarget)) closeList();
        }}
      >
        <input type="hidden" name={name} value={value} />

        <Input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className="pr-10"
          placeholder="Busca por nombre"
          value={open ? query : selected?.name ?? ""}
          onChange={(event) => {
            setQuery(event.target.value);
            setTyped(true);
            setActiveIndex(0);
            setOpen(true);
          }}
          // Al enfocar se abre con todo seleccionado: escribir sustituye el nombre.
          onFocus={(event) => {
            openList();
            event.target.select();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) return openList();
              if (matches.length === 0) return;
              const delta = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex((index) => (index + delta + matches.length) % matches.length);
              return;
            }

            if (event.key === "Enter" && open) {
              // Enter elige de la lista; no envía el formulario a medio buscar.
              event.preventDefault();
              const option = matches[activeIndex];
              if (option) select(option);
              return;
            }

            if (event.key === "Escape" && open) {
              event.preventDefault();
              closeList();
              return;
            }

            if (event.key === "Tab") closeList();
          }}
        />

        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Cerrar la lista de clientes" : "Ver todos los clientes"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint"
          onClick={() => {
            if (open) closeList();
            else inputRef.current?.focus();
          }}
        >
          <Icon name="chevronDown" size={18} className={open ? "rotate-180" : undefined} />
        </button>

        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface py-1 shadow-lift"
          >
            {matches.length === 0 ? (
              <li className="px-3.5 py-2.5 text-[0.9375rem] text-muted">
                Ningún cliente coincide con “{query}”.
              </li>
            ) : (
              matches.map((client, index) => {
                const active = index === activeIndex;
                return (
                  <li key={client.id}>
                    <div
                      id={`${listId}-${client.id}`}
                      role="option"
                      aria-selected={client.id === value}
                      data-active={active}
                      className={`flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-[0.9375rem] ${
                        active ? "bg-accent-soft text-accent-text" : "text-ink"
                      }`}
                      // mousedown, no click: así el cuadro de texto no pierde el
                      // foco —y la lista no se cierra— antes de elegir.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        select(client);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="min-w-0 flex-1 truncate">{client.name}</span>
                      {client.id === value ? (
                        <Icon name="check" size={16} className="shrink-0 text-accent" />
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
