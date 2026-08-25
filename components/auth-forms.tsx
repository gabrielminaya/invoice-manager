"use client";

import { useActionState } from "react";
import { completeSetup, signIn } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormError, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import type { ActionState } from "@/lib/form";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      <Card className="space-y-3.5 p-4 sm:p-5">
        <Field label="Correo">
          <Input
            type="email"
            name="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="tu@empresa.do"
          />
        </Field>

        <Field label="Contraseña">
          <Input type="password" name="password" required autoComplete="current-password" />
        </Field>
      </Card>

      <SubmitButton className="w-full" pendingLabel="Entrando…">
        Iniciar sesión
      </SubmitButton>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState<ActionState, FormData>(completeSetup, {});

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <Card className="space-y-3.5 p-4 sm:p-5">
        <Field label="Tu nombre">
          <Input name="name" required autoComplete="name" placeholder="Gabriel Minaya" />
        </Field>

        <Field label="Correo" hint="Con este correo iniciarás sesión.">
          <Input
            type="email"
            name="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="tu@empresa.do"
          />
        </Field>

        <Field
          label="Contraseña"
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres, combinando letras y números.`}
        >
          <Input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </Field>

        <Field label="Repite la contraseña">
          <Input
            type="password"
            name="passwordConfirm"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </Field>
      </Card>

      <SubmitButton className="w-full" pendingLabel="Creando la cuenta…">
        Crear mi cuenta y empezar
      </SubmitButton>
    </form>
  );
}
