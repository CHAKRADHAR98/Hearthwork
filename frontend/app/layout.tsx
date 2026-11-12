import { Nunito, Pixelify_Sans } from 'next/font/google'
import "./globals.css";
import Layout from '@/components/Layout/Layout'

const nunito = Nunito({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800'],
    variable: '--font-body',
})

const pixel = Pixelify_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-pixel',
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000"

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Hearthwork",
  description: "A virtual office with a living village economy on NEAR.",
  icons: {
    icon: '/hearthwork-logo.svg',
    shortcut: '/hearthwork-logo.png',
    apple: '/hearthwork-logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.className} ${nunito.variable} ${pixel.variable}`}>
      <body>
        <Layout>
            {children}
        </Layout>
      </body>
    </html>
  );
}
