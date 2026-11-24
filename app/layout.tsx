// Root layout. Hanya memasang font, CSS global, dan bahasa halaman.
// Header dan navigasi sengaja TIDAK di sini, karena bergantung pada user yang
// login. Setiap halaman memanggil <KerangkaHalaman> sendiri.

import { DM_Sans } from 'next/font/google';
import './globals.css';

// Font wajib dari visual theme. weights 400-700 dipakai di seluruh UI.
const dmSans = DM_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Star Generation',
  description: 'Manajemen kelas grup, logbook, dan pembayaran',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
