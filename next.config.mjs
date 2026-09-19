/** @type {import('next').NextConfig} */
const nextConfig = {
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
