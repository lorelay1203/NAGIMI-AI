import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";

// Tipografía propia de Nagimi. Antes eran Space Grotesk + Newsreader, que es
// justo el par de la página que se usó de referencia: se cambiaron a propósito
// para que Nagimi tenga cara propia y no parezca una copia.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

// Serif de titulares con más carácter (Fraunces tiene ese aire entre editorial
// y cálido). Solo para titulares, nunca para datos ni tablas.
const fraunces = Fraunces({
  subsets: ["latin"],
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
      <body className={`${jakarta.className} ${fraunces.variable}`}>
        <div className="shell">
          <Sidebar />
          <div className="shell-main">{children}</div>
        </div>
      </body>
    </html>
  );
}
