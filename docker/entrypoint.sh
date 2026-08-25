#!/bin/sh
# Punto de entrada del contenedor: migra y luego arranca lo que se le pase.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] aplicando migraciones…"
  node migrate.mjs
else
  echo "[entrypoint] RUN_MIGRATIONS=false, se omiten las migraciones"
fi

# exec para que el servidor sea el PID 1 y reciba las señales de parada.
exec "$@"
