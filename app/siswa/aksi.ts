// Server Action untuk siswa: mendaftar sendiri ke kelas.
//
// Alurnya: siswa pilih kelas di katalog -> enrollment dibuat pending ->
// invoice unpaid dibuat otomatis oleh trigger database -> akses terbuka
// setelah admin menandai invoice lunas.
//
// Yang divalidasi di sini hanya kelengkapan isian. Aturan bisnis (kursi masih
// ada, harga sesuai kelas, siswa hanya bisa mendaftarkan dirinya sendiri)
// ditegakkan database lewat RLS dan trigger, jadi tidak disalin di sini.

'use server';

import { revalidatePath } from 'next/cache';
import { buatClientServer } from '@/lib/supabase/server';
import { wajibPeran } from '@/lib/session';

// Penerjemah error sendiri (bukan impor dari admin/aksi.ts) karena file
// 'use server' hanya boleh mengekspor fungsi async. Isinya memang beda:
// siswa hanya akan menabrak dua pesan di bawah ini.
function terjemahkanErrorSiswa(pesan: string): string {
  const kecil = pesan.toLowerCase();

  if (kecil.includes('class is full')) {
    return 'Kelas sudah penuh saat Anda mendaftar. Coba kelas lain atau hubungi admin.';
  }
  if (kecil.includes('duplicate key value')) {
    return 'Anda sudah terdaftar di kelas ini.';
  }

  return pesan;
}

// Paket jam yang ditawarkan di katalog. Disamakan dengan validasi di aksi.
const PAKET_JAM_PILIHAN = [6, 12, 24];

export async function daftarKelasSendiri(formData: FormData) {
  const profil = await wajibPeran('student');
  const supabase = await buatClientServer();

  const kelasId = String(formData.get('kelas_id') ?? '');
  const paketJam = Number(formData.get('paket_jam') ?? 0);

  if (!kelasId) {
    return { pesanError: 'Pilih kelas terlebih dahulu.' };
  }
  if (!PAKET_JAM_PILIHAN.includes(paketJam)) {
    return { pesanError: 'Paket jam harus 6, 12, atau 24.' };
  }

  // Harga diambil dari katalog view, bukan dari form. Browser tidak pernah
  // mengirim harga; rate_at_purchase yang tersimpan adalah harga kelas sekarang.
  const { data: kelas } = await supabase
    .from('v_classes_public')
    .select('id, student_rate, is_open')
    .eq('id', kelasId)
    .single();

  if (!kelas) {
    return { pesanError: 'Kelas tidak ditemukan di katalog.' };
  }
  if (!kelas.is_open) {
    return { pesanError: 'Kelas sudah penuh atau ditutup.' };
  }

  const { error } = await supabase.from('enrollments').insert({
    class_id: kelas.id,
    student_id: profil.id,
    package_hours: paketJam,
    rate_at_purchase: kelas.student_rate,
    status: 'pending',
  });

  if (error) {
    return { pesanError: terjemahkanErrorSiswa(error.message) };
  }

  revalidatePath('/siswa');
  revalidatePath('/siswa/tagihan');
  revalidatePath('/admin/invoice');
  revalidatePath('/admin');
  return {
    pesanSukses:
      'Pendaftaran tercatat. Invoice sudah dibuat, akses kelas terbuka setelah pembayaran dikonfirmasi admin.',
  };
}
