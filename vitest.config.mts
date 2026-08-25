import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    // Prepara el entorno antes de que los módulos bajo prueba se importen:
    // es lo que permite apuntar `lib/db` a la base de datos de pruebas.
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Las pruebas de integración comparten una única base de datos, así que
    // los archivos no pueden correr en paralelo pisándose las tablas.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` lanza al importarse fuera del empaquetador de Next; en
      // las pruebas se sustituye por un módulo vacío.
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
});
