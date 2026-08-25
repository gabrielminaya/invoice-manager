import { ImageResponse } from "next/og";

/** Color de marca del icono. Coincide con el theme-color del manifest. */
export const BRAND_COLOR = "#3a49c9";

/**
 * Icono de la app generado en el servidor con next/og.
 *
 * Se construye solo con cajas y bordes (sin SVG ni fuentes especiales) para que
 * el renderizado sea idéntico en cualquier tamaño, y con margen amplio para que
 * también funcione como icono `maskable` en Android.
 */
export function renderBrandIcon(size: number) {
  const unit = size / 100;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(145deg, ${BRAND_COLOR} 0%, #212c8f 100%)`,
        }}
      >
        {/* Hoja de la factura */}
        <div
          style={{
            position: "relative",
            width: 46 * unit,
            height: 58 * unit,
            borderRadius: 6 * unit,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 6 * unit,
            padding: 9 * unit,
          }}
        >
          <div style={{ height: 5 * unit, width: "100%", borderRadius: 99, background: "#c3c9f2" }} />
          <div style={{ height: 5 * unit, width: "72%", borderRadius: 99, background: "#c3c9f2" }} />
          <div style={{ height: 5 * unit, width: "86%", borderRadius: 99, background: "#c3c9f2" }} />
        </div>

        {/* Anillo: la marca de la recurrencia */}
        <div
          style={{
            position: "absolute",
            right: 20 * unit,
            bottom: 20 * unit,
            width: 26 * unit,
            height: 26 * unit,
            borderRadius: "50%",
            border: `${5 * unit}px solid #ffffff`,
            borderRightColor: "transparent",
            transform: "rotate(-45deg)",
            background: BRAND_COLOR,
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
