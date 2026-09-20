/** @type {import('next').NextConfig} */
const nextConfig = {
  // The end-to-end tests build into their own directory, so running them does
  // not overwrite the build a dev server is serving from.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['node:sqlite'],
  // transformers.js runs only in the browser (the listener worker). Its Node
  // backends are never used there, so keep them out of the bundle.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      'onnxruntime-node$': false,
    };
    return config;
  },
};

export default nextConfig;
