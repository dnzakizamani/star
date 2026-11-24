// Pesan error dan pesan sukses.
//
// Server Action mengembalikan { pesanError } atau { pesanSukses }, dan komponen
// ini yang menampilkannya. Tidak perlu library notifikasi.

export function PesanError({ pesan }: { pesan?: string | null }) {
  if (!pesan) {
    return null;
  }

  return (
    <div
      role="alert"
      className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {pesan}
    </div>
  );
}

export function PesanSukses({ pesan }: { pesan?: string | null }) {
  if (!pesan) {
    return null;
  }

  return (
    <div
      role="status"
      className="rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-[#078A36]"
    >
      {pesan}
    </div>
  );
}
