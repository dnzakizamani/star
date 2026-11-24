// Route handler untuk mengunduh pendapatan tutor sebagai CSV.
//
// Kenapa route handler dan bukan Server Action? Karena yang dibutuhkan adalah
// respons berkas (Content-Disposition), bukan update UI. Route handler adalah
// cara paling langsung untuk itu.
//
// RLS tetap berlaku: tutor hanya melihat baris miliknya sendiri, admin melihat
// semuanya. Tidak ada parameter tutor_id dari luar; pemilihan baris murni
// mengikuti pemanggil.

import { ambilProfilSekarang } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function kolomAman(nilai: string | number | null): string {
  const teks = String(nilai ?? '');

  // Tanda kutip digandakan; prefiks ' memblokir formula injection di Excel
  // (=, +, -, @) supaya CSV tidak dijadikan vektor makro.
  if (/^[=+\-@\t]/.test(teks)) {
    return `'${teks.replaceAll('"', '""')}`;
  }
  return `"${teks.replaceAll('"', '""')}"`;
}

export async function GET() {
  const profil = await ambilProfilSekarang();

  if (!profil || (profil.role !== 'tutor' && profil.role !== 'admin')) {
    return NextResponse.json({ error: 'Tidak berhak.' }, { status: 403 });
  }

  const supabase = await buatClientServer();

  let query = supabase
    .from('earnings_ledger')
    .select(
      'lesson_id, hours, tutor_rate, amount, created_at, les:lessons(starts_at, ends_at, class_id, kelas:classes(name)), tutor:profiles(full_name)'
    )
    .order('created_at', { ascending: false });

  // Tutor hanya boleh mengunduh miliknya. Admin boleh semua (untuk rekap).
  if (profil.role === 'tutor') {
    query = query.eq('tutor_id', profil.id);
  }

  const { data: pendapatan, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baris = pendapatan ?? [];

  const kepala = [
    'tanggal_les',
    'kelas',
    'tutor',
    'jam',
    'rate_per_jam',
    'nominal',
    'dicatat_pada',
  ];

  const isi = baris.map((p) => {
    const les = (p as Record<string, unknown>).les as {
      starts_at: string;
      kelas: { name: string } | null;
    } | null;
    const tutor = (p as Record<string, unknown>).tutor as {
      full_name: string;
    } | null;

    return [
      les?.starts_at?.slice(0, 10) ?? '-',
      les?.kelas?.name ?? '-',
      tutor?.full_name ?? '-',
      Number(p.hours).toFixed(2),
      Number(p.tutor_rate).toFixed(0),
      Number(p.amount).toFixed(0),
      (p.created_at as string).slice(0, 10),
    ]
      .map(kolomAman)
      .join(',');
  });

  const csv = [kepala.join(','), ...isi].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pendapatan-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
