// Kerangka halaman: header dengan nama user, lalu konten.
// Sidebar sengaja tidak dipakai. Navigasi per peran cukup berupa tab di header,
// karena jumlah halaman per peran hanya 3-4.

import Link from 'next/link';
import { keluarDariAkun } from '@/app/aksi-auth';
import type { Profil } from '@/lib/types';
import { BadgeStatus } from './BadgeStatus';

// Menu berbeda per peran. Ditulis sebagai data, bukan if bersarang,
// supaya menambah halaman cukup menambah satu baris.
const MENU_PER_PERAN: Record<string, { href: string; label: string }[]> = {
  admin: [
    { href: '/admin', label: 'Ringkasan' },
    { href: '/admin/kelas', label: 'Kelas' },
    { href: '/admin/invoice', label: 'Invoice' },
    { href: '/admin/logbook', label: 'Logbook' },
  ],
  tutor: [
    { href: '/tutor', label: 'Jadwal' },
    { href: '/tutor/logbook', label: 'Logbook' },
    { href: '/tutor/pendapatan', label: 'Pendapatan' },
  ],
  student: [
    { href: '/siswa', label: 'Kelas Saya' },
    { href: '/siswa/tagihan', label: 'Tagihan' },
    { href: '/siswa/logbook', label: 'Logbook' },
  ],
};

export function KerangkaHalaman({
  profil,
  children,
}: {
  profil: Profil;
  children: React.ReactNode;
}) {
  const menu = MENU_PER_PERAN[profil.role] ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight text-ink">
              Star Generation
            </span>
            <BadgeStatus status={profil.role} />
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">{profil.full_name}</span>
            <form action={keluarDariAkun}>
              <button
                type="submit"
                className="text-sm text-muted underline underline-offset-2 hover:text-ink"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap border-b-2 border-transparent px-2 py-2.5 text-sm text-muted hover:border-line hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  );
}
