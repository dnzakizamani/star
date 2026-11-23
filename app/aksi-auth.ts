// Server Action untuk login dan logout.
//
// Kenapa Server Action, bukan API route?
// =========================
// Server Action adalah fungsi yang jalan di server tapi bisa dipanggil langsung
// dari <form action={...}>. Tidak perlu fetch(), tidak perlu tulis route
// handler, tidak perlu parsing body. Untuk form login sederhana ini jauh lebih
// sedikit kodenya dan lebih mudah diikuti.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { buatClientServer } from '@/lib/supabase/server';
import { berandaUntuk } from '@/lib/session';

export async function masukKeAkun(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { pesanError: 'Email dan password wajib diisi.' };
  }

  const supabase = await buatClientServer();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Pesan asli Supabase berbahasa Inggris dan teknis. Untuk halaman login,
    // pesan generik lebih tepat: jangan bocorkan apakah email terdaftar.
    return { pesanError: 'Email atau password salah.' };
  }

  // Ambil peran untuk menentukan halaman tujuan.
  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (!profil) {
    return { pesanError: 'Profil tidak ditemukan. Hubungi admin.' };
  }

  revalidatePath('/', 'layout');
  redirect(berandaUntuk(profil.role));
}

export async function keluarDariAkun() {
  const supabase = await buatClientServer();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}
