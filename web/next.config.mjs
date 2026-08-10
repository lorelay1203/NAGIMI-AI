/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright es pesado y usa binarios nativos: no lo empaquetes, cárgalo en runtime.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
