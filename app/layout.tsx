// Root layout. Hanya memasang CSS global dan bahasa halaman.
// Header dan navigasi sengaja TIDAK di sini, karena bergantung pada user yang
// login. Setiap halaman memanggil <KerangkaHalaman> sendiri.

import './globals.css';

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
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
