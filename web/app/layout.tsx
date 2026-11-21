import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import "./globals.css"

export const metadata: Metadata = {
  title: "Choros | Hear from your audience before launch",
  description: "Fictional personas use your site in a real browser and tell you what confused them, what was missing and whether they would return.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark"><body className={GeistSans.className}>{children}</body></html>
}
