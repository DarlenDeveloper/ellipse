import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ELLIPSE",
    short_name: "ELLIPSE",
    description: "AI-powered business automation and management workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F4F0",
    theme_color: "#F5F4F0",
    icons: [
      { src: "/favicon.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  }
}
