import type { Metadata } from "next";

import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import { Toaster } from "sonner";

import "@/styles/globals.css";



const inter = Inter({ subsets: ["latin"] });



export const metadata: Metadata = {

  title: "NFG Logistics | Admin Dashboard",

  description: "Enterprise Logistics & Fleet Management System by NFG Logistics. Streamline your dispatching and load tracking.",

  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },

};



export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (

    <html lang="en" suppressHydrationWarning>

      <body className={`${inter.className} min-h-screen bg-background antialiased`}>

        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>

          {children}

          <Toaster position="top-right" richColors closeButton />

        </ThemeProvider>

      </body>

    </html>

  );

}

