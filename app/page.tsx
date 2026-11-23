// Halaman depan: arahkan ke beranda sesuai peran, atau ke login.
//
// Tidak ada landing page marketing di sini. Aplikasi ini punya tiga peran dan
// semuanya butuh login, jadi halaman pertama yang berguna adalah beranda peran.

import { redirect } from 'next/navigation';
import { ambilProfilSekarang, berandaUntuk } from '@/lib/session';

export default async function HalamanDepan() {
  const profil = await ambilProfilSekarang();

  if (!profil) {
    redirect('/login');
  }

  redirect(berandaUntuk(profil.role));
}
