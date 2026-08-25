"use client";

import { useRef } from "react";
import { switchCompany } from "@/lib/actions/companies";
import { Icon } from "@/components/icons";

/** Selector de compañía emisora. Cambiar el valor envía el formulario. */
export function CompanySwitcher({
  companies,
  activeId,
}: {
  companies: { id: string; name: string }[];
  activeId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (companies.length <= 1) return null;

  return (
    <form ref={formRef} action={switchCompany} className="relative">
      <Icon
        name="building"
        size={15}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
      />
      <select
        name="companyId"
        defaultValue={activeId}
        aria-label="Compañía emisora"
        onChange={() => formRef.current?.requestSubmit()}
        className="min-h-9 max-w-40 appearance-none truncate rounded-full border border-line bg-surface py-1.5 pl-8 pr-3 text-[0.8125rem] font-medium text-ink outline-none focus:border-accent"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </form>
  );
}
