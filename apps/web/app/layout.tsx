import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeatherWear Lite",
  description: "Personal city weather with simple outfit and umbrella suggestions."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

