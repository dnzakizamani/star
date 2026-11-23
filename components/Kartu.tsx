// Kartu putih dengan judul. Dipakai di hampir semua halaman supaya tampilan
// tidak perlu menulis ulang border, padding, dan shadow.

export function Kartu({
  judul,
  keterangan,
  aksi,
  children,
}: {
  judul?: string;
  keterangan?: string;
  // Tombol atau link di kanan judul.
  aksi?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      {(judul || aksi) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {judul && (
              <h2 className="text-base font-semibold text-ink">{judul}</h2>
            )}
            {keterangan && (
              <p className="mt-0.5 text-sm text-muted">{keterangan}</p>
            )}
          </div>
          {aksi}
        </header>
      )}

      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
