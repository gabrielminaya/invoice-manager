import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Comprobación optimista de sesión.
 *
 * Solo mira si existe la cookie —nada de consultas a la base— porque el proxy
 * se ejecuta en cada navegación, incluidas las precargas de `<Link>`. La
 * verificación real (sesión vigente, usuario activo) la hace `requireUser()` en
 * la capa de datos; esto únicamente evita renderizar páginas protegidas y
 * manda al login de una vez.
 */

/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = ["/login", "/setup", "/offline"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  // El cronjob se autentica con CRON_SECRET, no con cookie de sesión.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  // Se recuerda el destino para volver a él después de iniciar sesión.
  const login = new URL("/login", request.nextUrl);
  const target = `${pathname}${search}`;
  if (target !== "/") login.searchParams.set("redirectTo", target);

  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Todo menos los estáticos y los archivos de metadatos. El manifest y los
   * iconos tienen que ser públicos o el navegador no puede instalar la PWA.
   */
  matcher: [
    "/((?!_next/static|_next/image|icons/|icon|apple-icon|manifest.webmanifest|sw.js|favicon.ico|logos/).*)",
  ],
};
