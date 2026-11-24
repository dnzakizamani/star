// Label status berwarna. Dipakai untuk invoice, logbook, les, dan pendaftaran.
// Satu komponen supaya warna status konsisten di seluruh aplikasi: kalau nanti
// mau ganti warna "paid", cukup ubah di sini.

type NadaWarna = 'netral' | 'ok' | 'warn' | 'danger';

const WARNA_PER_NADA: Record<NadaWarna, string> = {
  netral: 'bg-cloud/40 text-navy border-cloud',
  ok: 'bg-success/10 text-[#078A36] border-success/40',
  warn: 'bg-gold-soft text-[#8A6D00] border-gold/60',
  danger: 'bg-danger/10 text-danger border-danger/40',
};

// Menerjemahkan status database menjadi teks Indonesia + warna.
function terjemahkanStatus(status: string): { teks: string; nada: NadaWarna } {
  switch (status) {
    // invoice
    case 'unpaid':
      return { teks: 'Belum dibayar', nada: 'warn' };
    case 'paid':
      return { teks: 'Lunas', nada: 'ok' };
    case 'void':
      return { teks: 'Dibatalkan', nada: 'netral' };

    // logbook
    case 'draft':
      return { teks: 'Draft', nada: 'netral' };
    case 'submitted':
      return { teks: 'Menunggu review', nada: 'warn' };
    case 'returned':
      return { teks: 'Dikembalikan', nada: 'danger' };
    case 'approved':
      return { teks: 'Disetujui', nada: 'ok' };

    // les
    case 'scheduled':
      return { teks: 'Terjadwal', nada: 'netral' };
    case 'completed':
      return { teks: 'Selesai', nada: 'ok' };
    case 'cancelled':
      return { teks: 'Dibatalkan', nada: 'danger' };

    // pendaftaran & kelas
    case 'pending':
      return { teks: 'Menunggu bayar', nada: 'warn' };
    case 'active':
      return { teks: 'Aktif', nada: 'ok' };
    case 'archived':
      return { teks: 'Diarsipkan', nada: 'netral' };
    case 'dropped':
      return { teks: 'Berhenti', nada: 'danger' };

    default:
      return { teks: status, nada: 'netral' };
  }
}

export function BadgeStatus({ status }: { status: string }) {
  const { teks, nada } = terjemahkanStatus(status);

  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${WARNA_PER_NADA[nada]}`}
    >
      {teks}
    </span>
  );
}
