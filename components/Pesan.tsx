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
      className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
      className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
    >
      {pesan}
    </div>
  );
}
