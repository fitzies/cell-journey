import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cell Journey",
    short_name: "Cell Journey",
    description:
      "Church cell group attendance tracking for members, leaders, and admins.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5B4FCF",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
