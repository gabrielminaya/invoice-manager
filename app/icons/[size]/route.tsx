import { renderBrandIcon } from "@/lib/brand-icon";

/** Tamaños que declara el manifest. Se prerenderizan en el build. */
const SIZES = ["192", "512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export const dynamicParams = false;

export async function GET(_request: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const parsed = Number(size);
  if (!Number.isFinite(parsed) || parsed < 16 || parsed > 1024) {
    return new Response("Tamaño no soportado", { status: 400 });
  }
  return renderBrandIcon(parsed);
}
