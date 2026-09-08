import type { Metadata } from "next";
import { Space_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Serif editorial para los titulares — es lo que le da el aire de reporte
// serio en vez de panel de terminal. Solo para titulares, nunca para datos.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Nagimi AI",
  description: "Análisis de flujo de opciones, niveles GEX y planificación de operaciones.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${spaceGrotesk.className} ${newsreader.variable}`}>
        <div className="shell">
          <Sidebar />
          <div className="shell-main">{children}</div>
        </div>
      </body>
    </html>
  );
}
