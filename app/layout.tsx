import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'ChongCha Order | Monthly Retail Order Management',
  description: 'Record, confirm, and prepare monthly retail customer orders.',
  openGraph: {
    title: 'ChongCha Order',
    description: 'Manage monthly customer orders in one place.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ChongCha Order' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChongCha Order',
    description: 'Manage monthly customer orders in one place.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
