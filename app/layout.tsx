import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { getCurrentUser } from "@/lib/auth/dal";
import { BRAND_COLOR } from "@/lib/brand-icon";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Facturación recurrente",
    template: "%s · Facturación",
  },
  description:
    "Emite y cobra facturas recurrentes de tus clientes desde el móvil, con múltiples compañías emisoras.",
  applicationName: "Facturación recurrente",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Facturas",
    // "default" mantiene el texto de la barra de estado legible sobre el fondo claro.
    statusBarStyle: "default",
  },
  formatDetection: {
    // Evita que iOS convierta números de factura y RNC en enlaces de teléfono.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // cover: la app se dibuja bajo el notch y usamos env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: BRAND_COLOR },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Sin sesión solo se llega al login y a la configuración inicial, donde la
  // barra de pestañas no tendría a dónde navegar.
  const user = await getCurrentUser();

  return (
    <html lang="es-DO" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh bg-bg text-ink">
        <OfflineBanner />

        {user ? (
          <div className="md:flex md:items-start">
            <SideNav userName={user.name} />
            {/* min-w-0 evita que una tabla ancha desborde la columna. */}
            <div className="min-w-0 flex-1">
              {/* El hueco inferior solo hace falta donde existe la barra de pestañas. */}
              <div className="min-h-dvh pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
                {children}
              </div>
            </div>
          </div>
        ) : (
          children
        )}

        {user ? <BottomNav /> : null}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
