// Kerangka halaman saat data masih dimuat.
//
// Bedanya dengan skeleton biasa: header dan menu di sini adalah menu ASLI, bukan
// kotak abu-abu. Alasannya konkret — kalau seluruh halaman diganti kerangka,
// menu ikut hilang selama transisi dan user kehilangan navigasi tepat saat dia
// ingin pindah lagi. Yang dibuat kerangka hanya bagian isi.

import Link from 'next/link';
import { MENU_PER_PERAN } from './KerangkaHalaman';

export function KerangkaMemuat({ peran }: { peran: 'admin' | 'tutor' | 'student' }) {
  const menu = MENU_PER_PERAN[peran] ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight text-ink">
              Star Generation
            </span>
            <span className="h-4 w-12 animate-pulse rounded bg-stone-200" />
          </div>

          <div className="flex items-center gap-4">
            <span className="h-4 w-24 animate-pulse rounded bg-stone-200" />
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

      <main className="mx-auto max-w-5xl px-5 py-6">
        <div className="mb-5 h-5 w-40 animate-pulse rounded bg-stone-200" />
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-line bg-surface"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
      </main>
    </div>
  );
}