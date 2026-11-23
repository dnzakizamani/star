// Server Action untuk admin: kelola kelas, invoice, logbook, dan les.
//
// Semua aksi di file ini mengandalkan dua lapis pengamanan:
//   1. wajibPeran() memastikan yang memanggil benar-benar admin
//   2. RLS di database menolak juga kalau lapis pertama terlewat
//
// Pesan error dari database ditangkap dan diterjemahkan ke bahasa manusia,
// karena pesan asli Postgres berbahasa Inggris dan menyebut nama constraint.

'use server';

import { revalidatePath } from 'next/cache';
import { buatClientServer } from '@/lib/supabase/server';
import { wajibPeran } from '@/lib/session';

// Menerjemahkan error database menjadi kalimat yang bisa dibaca pengguna.
// Fungsi ini sengaja sederhana: cocokkan kata kunci, bukan kode error.
function terjemahkanErrorDatabase(pesan: string): string {
  const pesanKecil = pesan.toLowerCase();

  if (pesanKecil.includes('class is full')) {
    return 'Kelas sudah penuh. Tambah kapasitas atau keluarkan siswa lain.';
  }
  if (pesanKecil.includes('accepts no new enrollments')) {
    return 'Kelas sudah diarsipkan dan tidak menerima siswa baru.';
  }
  if (pesanKecil.includes('already has a logbook entry cannot be cancelled') ||
      pesanKecil.includes('already has a logbook entry')) {
    return 'Les ini sudah dicatat di logbook, jadi tidak bisa dibatalkan.';
  }
  if (pesanKecil.includes('no longer accepts entries')) {
    return 'Logbook sudah dikirim ke admin, jadi tidak bisa ditambah lagi.';
  }
  if (pesanKecil.includes('outside the logbook period')) {
    return 'Tanggal les tidak masuk periode logbook ini.';
  }
  if (pesanKecil.includes('cannot be reverted') ||
      pesanKecil.includes('after lessons were logged')) {
    return 'Invoice tidak bisa dibatalkan karena jamnya sudah terpakai.';
  }
  if (pesanKecil.includes('conflicting key value')) {
    return 'Tutor sudah punya les lain di jam yang sama.';
  }
  if (pesanKecil.includes('duplicate key value')) {
    return 'Data ini sudah ada. Periksa kembali isian Anda.';
  }

  // Kalau tidak dikenali, tampilkan apa adanya tapi tetap di bawah.
  return pesan;
}

export async function buatKelas(formData: FormData) {
  await wajibPeran('admin');
  const supabase = await buatClientServer();

  const nama = String(formData.get('nama') ?? '').trim();
  const tutorId = String(formData.get('tutor_id') ?? '');
  const kapasitas = Number(formData.get('kapasitas') ?? 0);
  const rateSiswa = Number(formData.get('rate_siswa') ?? 0);
  const rateTutor = Number(formData.get('rate_tutor') ?? 0);

  if (!nama || !tutorId) {
    return { pesanError: 'Nama kelas dan tutor wajib diisi.' };
  }
  if (kapasitas < 1) {
    return { pesanError: 'Kapasitas minimal 1 siswa.' };
  }
  if (rateSiswa <= 0 || rateTutor <= 0) {
    return { pesanError: 'Rate siswa dan rate tutor harus lebih dari 0.' };
  }

  const { error } = await supabase.from('classes').insert({
    name: nama,
    tutor_id: tutorId,
    capacity: kapasitas,
    student_rate: rateSiswa,
    tutor_rate: rateTutor,
  });

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/kelas');
  return { pesanSukses: 'Kelas berhasil dibuat.' };
}

export async function ubahRateKelas(formData: FormData) {
  await wajibPeran('admin');
  const supabase = await buatClientServer();

  const kelasId = String(formData.get('kelas_id') ?? '');
  const rateSiswa = Number(formData.get('rate_siswa') ?? 0);
  const rateTutor = Number(formData.get('rate_tutor') ?? 0);

  if (rateSiswa <= 0 || rateTutor <= 0) {
    return { pesanError: 'Rate harus lebih dari 0.' };
  }

  const { error } = await supabase
    .from('classes')
    .update({ student_rate: rateSiswa, tutor_rate: rateTutor })
    .eq('id', kelasId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath(`/admin/kelas/${kelasId}`);
  return { pesanSukses: 'Rate diperbarui. Invoice lama tidak berubah.' };
}

export async function arsipkanKelas(formData: FormData) {
  await wajibPeran('admin');
  const supabase = await buatClientServer();

  const kelasId = String(formData.get('kelas_id') ?? '');
  const statusBaru = String(formData.get('status') ?? 'archived');

  const { error } = await supabase
    .from('classes')
    .update({ status: statusBaru })
    .eq('id', kelasId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/admin/kelas');
  revalidatePath(`/admin/kelas/${kelasId}`);
  return {
    pesanSukses:
      statusBaru === 'archived' ? 'Kelas diarsipkan.' : 'Kelas diaktifkan kembali.',
  };
}

// Mendaftarkan siswa ke kelas. Invoice dibuat otomatis oleh trigger database
// dengan nominal = paket jam x rate yang berlaku saat itu, jadi nominal tidak
// pernah dikirim dari browser.
export async function tambahSiswa(formData: FormData) {
  await wajibPeran('admin');
  const supabase = await buatClientServer();

  const kelasId = String(formData.get('kelas_id') ?? '');
  const siswaId = String(formData.get('student_id') ?? '');
  const paketJam = Number(formData.get('paket_jam') ?? 0);

  if (!kelasId || !siswaId) {
    return { pesanError: 'Kelas dan siswa wajib dipilih.' };
  }
  if (paketJam <= 0) {
    return { pesanError: 'Paket jam harus lebih dari 0.' };
  }

  // Rate diambil dari kelas, bukan dari input. Ini yang membuat harga
  // terkunci di sisi server: browser tidak bisa mengirim rate palsu.
  const { data: kelas } = await supabase
    .from('classes')
    .select('student_rate')
    .eq('id', kelasId)
    .single();

  if (!kelas) {
    return { pesanError: 'Kelas tidak ditemukan.' };
  }

  const { error } = await supabase.from('enrollments').insert({
    class_id: kelasId,
    student_id: siswaId,
    package_hours: paketJam,
    rate_at_purchase: kelas.student_rate,
  });

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath(`/admin/kelas/${kelasId}`);
  revalidatePath('/admin/invoice');
  revalidatePath('/admin');
  return { pesanSukses: 'Siswa terdaftar. Invoice sudah dibuat otomatis.' };
}

// Menandai invoice lunas. Ini simulasi pembayaran sesuai PRD.
export async function tandaiInvoiceLunas(formData: FormData) {
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  const invoiceId = String(formData.get('invoice_id') ?? '');

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: profil.id,
    })
    .eq('id', invoiceId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/admin/invoice');
  revalidatePath('/admin');
  return { pesanSukses: 'Invoice ditandai lunas.' };
}

export async function setujuiLogbook(formData: FormData) {
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  const logbookId = String(formData.get('logbook_id') ?? '');

  // Trigger database yang membuat baris earnings_ledger.
  // Aplikasi tidak perlu menghitung pendapatan sendiri.
  const { error } = await supabase
    .from('logbooks')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: profil.id,
    })
    .eq('id', logbookId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/admin/logbook');
  revalidatePath('/admin');
  return { pesanSukses: 'Logbook disetujui dan pendapatan tutor tercatat.' };
}

export async function kembalikanLogbook(formData: FormData) {
  await wajibPeran('admin');
  const supabase = await buatClientServer();

  const logbookId = String(formData.get('logbook_id') ?? '');
  const catatan = String(formData.get('catatan') ?? '').trim();

  if (!catatan) {
    return { pesanError: 'Catatan wajib diisi saat mengembalikan logbook.' };
  }

  const { error } = await supabase
    .from('logbooks')
    .update({ status: 'returned', admin_note: catatan })
    .eq('id', logbookId);

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/admin/logbook');
  return { pesanSukses: 'Logbook dikembalikan ke tutor untuk diperbaiki.' };
}

export async function buatLes(formData: FormData) {
  const profil = await wajibPeran(['admin', 'tutor']);
  const supabase = await buatClientServer();

  const kelasId = String(formData.get('kelas_id') ?? '');
  const mulai = String(formData.get('mulai') ?? '');
  const selesai = String(formData.get('selesai') ?? '');

  if (!kelasId || !mulai || !selesai) {
    return { pesanError: 'Kelas, waktu mulai, dan waktu selesai wajib diisi.' };
  }

  // <input type="datetime-local"> menghasilkan waktu lokal tanpa zona.
  // Tanpa new Date(), jam yang tersimpan akan dianggap UTC dan bergeser 7 jam.
  const waktuMulai = new Date(mulai);
  const waktuSelesai = new Date(selesai);

  if (waktuSelesai <= waktuMulai) {
    return { pesanError: 'Waktu selesai harus setelah waktu mulai.' };
  }

  // Tutor hanya boleh membuat les untuk kelasnya sendiri.
  // Untuk admin, tutor diambil dari kelas.
  const { data: kelas } = await supabase
    .from('classes')
    .select('tutor_id')
    .eq('id', kelasId)
    .single();

  if (!kelas) {
    return { pesanError: 'Kelas tidak ditemukan.' };
  }

  if (profil.role === 'tutor' && kelas.tutor_id !== profil.id) {
    return { pesanError: 'Anda bukan tutor kelas ini.' };
  }

  const { error } = await supabase.from('lessons').insert({
    class_id: kelasId,
    tutor_id: kelas.tutor_id,
    starts_at: waktuMulai.toISOString(),
    ends_at: waktuSelesai.toISOString(),
  });

  if (error) {
    return { pesanError: terjemahkanErrorDatabase(error.message) };
  }

  revalidatePath('/admin');
  revalidatePath('/tutor');
  return { pesanSukses: 'Les berhasil dijadwalkan.' };
}

// Menandai les selesai. Trigger database otomatis membuka logbook bulan itu.
export async function selesaikanLes(formData: FormData) {
  await wajibPeran(['admin', 'tutor']);
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
  revalidatePath('/admin');
  return { pesanSukses: 'Les ditandai selesai. Logbook bulan ini sudah dibuka.' };
}
