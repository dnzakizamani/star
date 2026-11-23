// Tombol dengan tiga varian. Sengaja hanya tiga: kalau butuh gaya keempat,
// biasanya masalahnya ada di desain halaman, bukan di komponen.

import Link from 'next/link';

type Varian = 'utama' | 'sekunder' | 'bahaya';

const KELAS_PER_VARIAN: Record<Varian, string> = {
  utama:
    'bg-accent text-white border-accent hover:bg-teal-800 disabled:bg-stone-300 disabled:border-stone-300',
  sekunder:
    'bg-surface text-ink border-line hover:bg-stone-50 disabled:text-stone-400',
  bahaya:
    'bg-surface text-danger border-red-200 hover:bg-red-50 disabled:text-stone-400',
};

const KELAS_DASAR =
  'inline-flex items-center justify-center rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed';

export function Tombol({
  children,
  varian = 'utama',
  type = 'submit',
  disabled,
}: {
  children: React.ReactNode;
  varian?: Varian;
  type?: 'submit' | 'button';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${KELAS_DASAR} ${KELAS_PER_VARIAN[varian]}`}
    >
      {children}
    </button>
  );
}

// Versi link, untuk navigasi yang terlihat seperti tombol.
export function TombolLink({
  href,
  children,
  varian = 'sekunder',
}: {
  href: string;
  children: React.ReactNode;
  varian?: Varian;
}) {
  return (
    <Link href={href} className={`${KELAS_DASAR} ${KELAS_PER_VARIAN[varian]}`}>
      {children}
    </Link>
  );
}
