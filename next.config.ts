import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `npm run dev` opened from phones/tablets on the same Wi-Fi (private LAN ranges).
  // Add others via ALLOWED_DEV_ORIGINS="host1,host2".
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
    ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
  ],
};

export default config;
