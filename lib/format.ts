// Helper format untuk tampilan. Semua tanggal dan uang diformat lewat sini
// supaya konsisten di seluruh aplikasi.

const ZONA_WAKTU = 'Asia/Jakarta';

// 1200000 -> "Rp 1.200.000"
export function formatRupiah(nilai: number | null): string {
  if (nilai === null || nilai === undefined) {
    return '-';
  }

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(nilai);
}

// "2026-11-23T09:00:00Z" -> "23 Nov 2026"
export function formatTanggal(waktu: string | null): string {
  if (!waktu) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: ZONA_WAKTU,
  }).format(new Date(waktu));
}

// "2026-11-23T09:00:00Z" -> "23 Nov 2026, 16.00"
export function formatTanggalJam(waktu: string | null): string {
  if (!waktu) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA_WAKTU,
  }).format(new Date(waktu));
}

// "2026-11-23T09:00:00Z" -> "16.00" (dipakai di jadwal les)
export function formatJam(waktu: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA_WAKTU,
  }).format(new Date(waktu));
}

// 1.5 -> "1,5 jam"
export function formatJamPelajaran(jam: number): string {
  return `${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(jam)} jam`;
}

// 11 -> "November"
export function namaBulan(bulan: number): string {
  const daftar = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  return daftar[bulan - 1] ?? '-';
}

// Dipakai untuk mengisi <input type="datetime-local">.
// Perlu waktu lokal WIB, bukan ISO UTC, kalau tidak jamnya akan bergeser.
export function keDatetimeLokal(waktu: string): string {
  const tanggal = new Date(waktu);
  const bagian = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA_WAKTU,
  }).format(tanggal);

  return bagian.replace(' ', 'T');
}
