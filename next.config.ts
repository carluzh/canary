import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Silence optional deps pulled in transitively by the wagmi/walletconnect
  // logger (we only use the injected connector); not used at runtime.
  webpack: (config) => {
    config.externals.push(
      "pino-pretty",
      "lokijs",
      "encoding",
      "@react-native-async-storage/async-storage"
    );
    return config;
  },
};

export default nextConfig;
