/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // standalone menghasilkan server.js mandiri dengan hanya dependency yang
  // benar-benar dipakai. Ini yang membuat image Docker kecil (~71MB) dan
  // tidak perlu node_modules di dalam container.
  output: 'standalone',
};

module.exports = nextConfig;
