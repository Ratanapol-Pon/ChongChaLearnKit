import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'ชงชา ออเดอร์ | ระบบจัดการออเดอร์รายเดือน',
  description: 'ระบบบันทึกและยืนยันออเดอร์รายเดือนสำหรับร้านค้าปลีกชงชา',
  openGraph: {
    title: 'ชงชา ออเดอร์',
    description: 'จัดการออเดอร์รายเดือน ง่าย ครบ จบในที่เดียว',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ชงชา ออเดอร์' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ชงชา ออเดอร์',
    description: 'จัดการออเดอร์รายเดือน ง่าย ครบ จบในที่เดียว',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
