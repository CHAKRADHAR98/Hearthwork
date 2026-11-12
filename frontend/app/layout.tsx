import { DM_Sans, Orbitron } from 'next/font/google'
import "./globals.css";
import Layout from '@/components/Layout/Layout'

const dmSans = DM_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
})

const orbitron = Orbitron({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800', '900'],
    variable: '--font-orbitron',
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000"

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Hearthwork",
  description: "A virtual office with a living village economy on NEAR.",
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.className} ${orbitron.variable}`}>
      <body>
        <Layout>
            {children}
        </Layout>
      </body>
    </html>
  );
}
