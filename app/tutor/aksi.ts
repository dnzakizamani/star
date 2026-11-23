// Aksi untuk tutor: mengisi logbook dan menandai les selesai.
//
// Tutor TIDAK bisa menyetujui logbook sendiri. Itu wewenang admin, dan RLS
// di database juga menolaknya. Di sini hanya ada aksi yang memang boleh.

'use server';

import { revalidatePath } from 'next/cache';
import { buatClientServer } from '@/lib/supabase/server';
import { wajibPeran } from '@/lib/session';

function terjemahkanErrorDatabase(pesan: string): string {
  const pesanKecil = pesan.toLowerCase();

  if (pesanKecil.includes('no longer accepts entries')) {
    return 'Logbook sudah dikirim ke admin, jadi tidak bisa ditambah lagi.';
  }
  if (pesanKecil.includes('only a completed lesson')) {
    return 'Les harus ditandai selesai dulu sebelum bisa dicatat.';
  }
  if (pesanKecil.includes('outside the logbook period')) {
    return 'Tanggal les tidak masuk periode logbook ini.';
  }
  if (pesanKecil.includes('hours left')) {
    return 'Siswa tidak punya sisa jam yang cukup untuk les ini. Hubungi admin.';
  }
  if (pesanKecil.includes('duplicate key value')) {
    return 'Les ini sudah punya entri logbook.';
  }
  if (pesanKecil.includes('not a draft or returned')) {
    return 'Logbook ini sudah tidak bisa disubmit.';
  }
  if (pesanKecil.includes('at least one entry')) {
    return 'Isi minimal satu entri sebelum submit.';
  }

  return pesan;
}

// Menyimpan entri logbook untuk satu les.
export async function simpanEntri(formData: FormData) {
  const profil = await wajibPeran('tutor');
  const supabase = await buatClientServer();

  const lesId = String(formData.get('les_id') ?? '');
  const logbookId = String(formData.get('logbook_id') ?? '');
  const topik = String(formData.get('topik') ?? '').trim();
  const aktivitas = String(formData.get('aktivitas') ?? '').trim();
  const observasi = String(formData.get('observasi') ?? '').trim();
  const rekomendasi = String(formData.get('rekomendasi') ?? '').trim();

  if (!lesId || !logbookId) {
    return { pesanError: 'Les dan logbook tidak lengkap.' };
  }
  if (!topik || !aktivitas || !observasi) {
    return { pesanError: 'Topik, aktivitas, dan observasi wajib diisi.' };
  }

  // Entri bisa baru atau perbaikan setelah dikembalikan admin.
  // Karena UNIQUE(lesson_id), cukup upsert saja: tidak perlu cek dulu.
  const { error } = await supabase.from('logbook_entries').upsert(
    {
      logbook_id: logbookId,
      lesson_id: lesId,
      topic: topik,
      activities: aktivitas,
      tutor_observation: observasi,
      next_recommendation: rekomendasi || null,
    },
    { onConflict: 'lesson_id' }
  );

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/tutor/logbook');
  void profil;
  return { pesanSukses: 'Entri logbook tersimpan.' };
}

// Mengirim logbook ke admin untuk direview.
export async function kirimLogbook(formData: FormData) {
  await wajibPeran('tutor');
  const supabase = await buatClientServer();

  const logbookId = String(formData.get('logbook_id') ?? '');

  const { error } = await supabase
    .from('logbooks')
    .update({ status: 'submitted' })
    .eq('id', logbookId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/tutor/logbook');
  return { pesanSukses: 'Logbook dikirim ke admin untuk review.' };
}

// Menandai les selesai. Trigger database otomatis membuka logbook bulan itu.
export async function selesaikanLes(formData: FormData) {
  await wajibPeran('tutor');
  const supabase = await buatClientServer();

  const lesId = String(formData.get('les_id') ?? '');

  const { error } = await supabase
    .from('lessons')
    .update({ status: 'completed' })
    .eq('id', lesId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/tutor');
  revalidatePath('/tutor/logbook');
  return { pesanSukses: 'Les selesai. Logbook bulan ini sudah dibuka.' };
}
