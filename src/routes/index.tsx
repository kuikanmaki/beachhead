import { createFileRoute } from "@tanstack/react-router";
import { BeachheadGame } from "@/components/BeachheadGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beachhead — Bug War Tower Defense" },
      { name: "description", content: "Hold a desert beachhead against arachnid swarms with expendable infantry and machine-gun towers." },
      { property: "og:title", content: "Beachhead — Bug War Tower Defense" },
      { property: "og:description", content: "Land your team, hold the chokepoints, build towers, survive the horde." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BeachheadGame,
});
