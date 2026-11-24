// Tombol dengan tiga varian. Sengaja hanya tiga: kalau butuh gaya keempat,
// biasanya masalahnya ada di desain halaman, bukan di komponen.

import Link from 'next/link';

type Varian = 'utama' | 'sekunder' | 'bahaya';

const KELAS_PER_VARIAN: Record<Varian, string> = {
  // Tombol utama memakai navy (bukan gold): teks putih di atas gold gagal
  // kontras. Gold dipakai sebagai aksen (border aktif, highlight), bukan
  // sebagai warna tombol dengan teks di atasnya.
  utama:
    'bg-navy text-white border-navy hover:bg-navy-soft disabled:bg-cloud disabled:border-cloud',
  sekunder:
    'bg-surface text-navy border-cloud hover:bg-cloud/30 disabled:text-cloud-strong',
  bahaya:
    'bg-surface text-danger border-danger/40 hover:bg-danger/10 disabled:text-cloud-strong',
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
