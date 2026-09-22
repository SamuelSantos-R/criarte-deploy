import type { Metadata, Viewport } from "next";
import { Cormorant, Cormorant_Infant, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { NOIVOS, varsDoPainel } from "@/lib/painel";

const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});

const cormorantInfant = Cormorant_Infant({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-infant",
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal"],
  variable: "--font-garamond",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: `RSVP · ${NOIVOS}`,
  description: `Confirme sua presença no casamento de ${NOIVOS}.`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${cormorant.variable} ${cormorantInfant.variable} ${cormorantGaramond.variable}`}
      style={varsDoPainel()}
    >
      <head>
        <link
          rel="preload"
          href="/fonts/Milton_One_Bold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
