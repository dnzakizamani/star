// Wrapper untuk form yang memanggil Server Action dan menampilkan hasilnya.
//
// Kenapa perlu komponen terpisah?
// =========================
// Server Action tidak bisa dipanggil langsung dari Server Component kalau kita
// ingin menampilkan pesan error. Kita butuh useState, dan useState hanya ada di
// Client Component. Komponen ini menyembunyikan kerumitan itu: halaman cukup
// membungkus form dengan <FormAksi> dan mengisi action-nya.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PesanError, PesanSukses } from './Pesan';

type HasilAksi = { pesanError?: string; pesanSukses?: string } | undefined;

export function FormAksi({
  action,
  children,
  labelTombol,
  varianTombol = 'utama',
}: {
  // Server Action yang menerima FormData dan mengembalikan pesan.
  action: (formData: FormData) => Promise<HasilAksi>;
  children: React.ReactNode;
  labelTombol: string;
  varianTombol?: 'utama' | 'sekunder' | 'bahaya';
}) {
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);
  const [sedangProses, setSedangProses] = useState(false);
  const router = useRouter();

  const kelasTombol: Record<string, string> = {
    // Navy untuk tombol utama: teks putih di atas gold tidak lolos kontras.
    utama: 'bg-navy text-white border-navy hover:bg-navy-soft',
    sekunder: 'bg-surface text-navy border-cloud hover:bg-cloud/30',
    bahaya: 'bg-surface text-danger border-danger/40 hover:bg-danger/10',
  };

  async function tanganiSubmit(formData: FormData) {
    setSedangProses(true);
    setPesanError(null);
    setPesanSukses(null);

    const hasil = await action(formData);

    if (hasil?.pesanError) {
      setPesanError(hasil.pesanError);
    }
    if (hasil?.pesanSukses) {
      setPesanSukses(hasil.pesanSukses);

      // Kenapa perlu router.refresh()?
      // ==============================
      // Server Action dipanggil di sini sebagai fungsi biasa, bukan lewat
      // atribut action pada <form>. Di jalur itu Next.js TIDAK mengirim ulang
      // hasil render halaman: revalidatePath() hanya menandai cache basi.
      // Akibatnya pesan sukses muncul tapi badge/daftar masih versi lama, dan
      // user harus mengklik lagi supaya perubahannya terlihat.
      // refresh() memaksa Server Component dirender ulang dengan data baru.
      router.refresh();
    }

    setSedangProses(false);
  }

  return (
    <form action={tanganiSubmit} className="space-y-3">
      {children}

      <PesanError pesan={pesanError} />
      <PesanSukses pesan={pesanSukses} />

      <button
        type="submit"
        disabled={sedangProses}
        className={`inline-flex items-center justify-center rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${kelasTombol[varianTombol]}`}
      >
        {sedangProses ? 'Memproses...' : labelTombol}
      </button>
    </form>
  );
}
