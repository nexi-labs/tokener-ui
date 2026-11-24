/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server output for the container image (deploy/docker/ui.Dockerfile).
  output: "standalone",
  // The floating dev-mode indicator (route badge / "try Turbopack" prompt) is a `next dev`-
  // only overlay, never present in a production build/start — disabled explicitly anyway so
  // it doesn't appear during local `npm run dev` previews either.
  devIndicators: false,
  // The browser calls /api on this origin and the server forwards it to the control plane. That keeps the refresh-token cookie first
  // party (no CORS, no third-party cookie rules). Set TOKENER_API_ORIGIN at build time for any address other than a local backend.
  async rewrites() {
    const origin = (process.env.TOKENER_API_ORIGIN || "http://localhost:8080").replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
  },
};

export default nextConfig;
