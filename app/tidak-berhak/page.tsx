// Halaman yang muncul kalau user membuka halaman peran lain.
//
// Lebih jelas daripada redirect diam-diam ke beranda: user jadi tahu kenapa
// dia tidak melihat apa yang dicari.

import Link from 'next/link';
import { ambilProfilSekarang, berandaUntuk } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function HalamanTidakBerhak() {
  const profil = await ambilProfilSekarang();

  if (!profil) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-navy">Halaman tidak tersedia</h1>
        <p className="mt-2 text-sm text-cloud-strong">
          Akun Anda masuk sebagai <strong>{profil.role}</strong>, jadi halaman ini
          tidak bisa dibuka.
        </p>
        <Link
          href={berandaUntuk(profil.role)}
          className="mt-4 inline-block rounded border border-cloud bg-surface px-3 py-1.5 text-sm text-navy hover:bg-cloud/30"
        >
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}
