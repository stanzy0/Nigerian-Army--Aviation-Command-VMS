import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BrandingProvider from "@/components/BrandingProvider";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { SessionTimeoutProvider } from "@/components/auth/SessionTimeoutProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NA AVN VMS",
  description: "Admin dashboard for NA AVN VMS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col w-full">
        <BrandingProvider>
          <NotificationProvider>
            <SessionTimeoutProvider>
              {children}
            </SessionTimeoutProvider>
          </NotificationProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
