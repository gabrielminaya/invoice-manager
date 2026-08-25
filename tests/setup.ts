/**
 * Se ejecuta antes de importar cualquier módulo bajo prueba.
 *
 * `lib/db` abre el pool al importarse leyendo DATABASE_URL, así que la
 * redirección a la base de pruebas tiene que ocurrir aquí y no dentro de un
 * test: si no, las pruebas escribirían en la base de desarrollo.
 */
import { testDatabaseUrl } from "./helpers/database-url";

process.env.DATABASE_URL = testDatabaseUrl();

// Ninguna prueba debe poder enviar un correo real.
process.env.MAIL_PROVIDER = "mock";
process.env.MAIL_ENABLED = "false";
process.env.MAIL_FROM = "Pruebas <pruebas@example.com>";
delete process.env.RESEND_API_KEY;

// Zona horaria fija: si no, "hoy" cambiaría según la máquina.
process.env.CRON_TIMEZONE = "America/Santo_Domingo";
process.env.CRON_SECRET = "secreto-de-pruebas";
process.env.APP_URL = "https://pruebas.example.com";
