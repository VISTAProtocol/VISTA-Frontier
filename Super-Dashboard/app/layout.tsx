import "@rainbow-me/rainbowkit/styles.css"
import type { Metadata } from "next"
import localFont from "next/font/local"
import { headers } from "next/headers"
import { cookieToInitialState } from "wagmi"

import { Providers } from "@/components/providers"
import { wagmiConfig } from "@/lib/wagmi"
import "./globals.css"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
})

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: {
    default: "VISTA Protocol",
    template: "%s | VISTA Protocol",
  },
  description: "Real-time attention monetization dashboard where users earn USDC for verified ad views.",
  icons: {
    icon: "/favicon/favicon.ico",
    shortcut: "/favicon/favicon-32x32.png",
    apple: "/favicon/apple-touch-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const initialState = cookieToInitialState(wagmiConfig, headers().get("cookie"))

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} theme min-h-screen bg-background text-foreground antialiased`}>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  )
}
