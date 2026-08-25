"use client";

import { useActionState } from "react";
import { changePassword, createUser } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormError, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import type { ActionState } from "@/lib/form";

export function NewUserForm() {
  const [state, action] = useActionState<ActionState, FormData>(createUser, {});

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <Card className="space-y-3.5 p-4">
        <Field label="Nombre">
          <Input name="name" required placeholder="Nombre y apellido" />
        </Field>

        <Field label="Correo">
          <Input
            type="email"
            name="email"
            required
            autoCapitalize="none"
            spellCheck={false}
            placeholder="persona@empresa.do"
          />
        </Field>

        <Field
          label="Contraseña inicial"
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres con letras y números. Compártela por un canal seguro y pídele que la cambie.`}
        >
          <Input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </Field>
      </Card>

      <SubmitButton className="w-full" pendingLabel="Creando…">
        Crear usuario
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePassword, {});

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {state.ok ? (
        <p
          role="status"
          className="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success"
        >
          Contraseña actualizada.
        </p>
      ) : null}

      <Card className="space-y-3.5 p-4">
        <Field label="Contraseña actual">
          <Input type="password" name="currentPassword" required autoComplete="current-password" />
        </Field>

        <Field
          label="Contraseña nueva"
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres con letras y números.`}
        >
          <Input
            type="password"
            name="newPassword"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </Field>

        <Field label="Repite la contraseña nueva">
          <Input
            type="password"
            name="newPasswordConfirm"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </Field>
      </Card>

      <SubmitButton className="w-full" pendingLabel="Guardando…">
        Cambiar contraseña
      </SubmitButton>
    </form>
  );
}
