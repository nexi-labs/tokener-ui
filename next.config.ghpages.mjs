/** @type {import('next').NextConfig} */
const repo = 'your-repo-name'; // must match GitHub repo name
const isUserSite = false;      // true if repo is username.github.io

const nextConfig = {
    reactStrictMode: true,
    output: 'export',
    devIndicators: false,
    images: { unoptimized: true },
    trailingSlash: true,
    basePath: isUserSite ? '' : `/${repo}`,
    assetPrefix: isUserSite ? '' : `/${repo}/`,
    // No rewrites() — not supported in export mode.
};

export default nextConfig;