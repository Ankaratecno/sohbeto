import { createFileRoute } from "@tanstack/react-router";
import Sohbeto from "@/components/Sohbeto";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sohbeto — P2P Sohbet ve Arama" },
      {
        name: "description",
        content:
          "Sohbeto: sunucusuz, uçtan uca P2P sohbet, sesli ve görüntülü arama uygulaması.",
      },
      { property: "og:title", content: "Sohbeto — P2P Sohbet ve Arama" },
      {
        property: "og:description",
        content:
          "Sohbeto: sunucusuz, uçtan uca P2P sohbet, sesli ve görüntülü arama uygulaması.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <Sohbeto />;
}
