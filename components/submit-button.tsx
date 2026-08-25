"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui";

/**
 * Botón de envío que se deshabilita mientras la acción está en vuelo.
 * Debe vivir dentro del <form> para que `useFormStatus` lo vea.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  formAction,
  name,
  value,
  confirm,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
  /** Si se indica, pide confirmación antes de enviar. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      formAction={formAction}
      name={name}
      value={value}
      onClick={
        confirm
          ? (event) => {
              if (!window.confirm(confirm)) event.preventDefault();
            }
          : undefined
      }
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
