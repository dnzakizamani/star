// Helper seputar user yang sedang login.
//
// Semua halaman memanggil ambilProfilSekarang() di baris pertama. Kalau
// hasilnya null, halaman tinggal redirect ke /login. Tidak ada pengecekan
// tersebar di banyak tempat.

import { redirect } from 'next/navigation';
import { buatClientServer } from './supabase/server';
import type { Profil, Peran } from './types';

export async function ambilProfilSekarang(): Promise<Profil | null> {
  const supabase = await buatClientServer();

  // getUser() memvalidasi token ke server Supabase, bukan sekadar membaca cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Profil dibuat otomatis oleh trigger handle_new_user saat signup,
  // jadi baris ini seharusnya selalu ada.
  const { data: profil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profil as Profil | null;
}

// Dipakai di setiap halaman yang butuh login.
// Melempar redirect kalau belum login, sehingga kode setelahnya bisa langsung
// menganggap profil selalu ada.
export async function wajibLogin(): Promise<Profil> {
  const profil = await ambilProfilSekarang();

  if (!profil) {
    redirect('/login');
  }

  return profil;
}

// Sama seperti wajibLogin, tapi sekaligus memastikan perannya benar.
export async function wajibPeran(peran: Peran | Peran[]): Promise<Profil> {
  const profil = await wajibLogin();
  const daftarPeran = Array.isArray(peran) ? peran : [peran];

  if (!daftarPeran.includes(profil.role)) {
    redirect('/tidak-berhak');
  }

  return profil;
}

// Alamat beranda sesuai peran. Dipakai setelah login dan di halaman /.
export function berandaUntuk(peran: Peran): string {
  if (peran === 'admin') return '/admin';
  if (peran === 'tutor') return '/tutor';
  return '/siswa';
}
