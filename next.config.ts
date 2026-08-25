import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Empaqueta el servidor y solo las dependencias que realmente usa en
   * `.next/standalone`, para que la imagen de Docker no tenga que llevar
   * node_modules completo.
   */
  output: "standalone",
};

export default nextConfig;
