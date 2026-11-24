// Kerangka saat data halaman tutor dimuat. Header dan menunya menu asli,
// supaya navigasi tetap bisa dipakai selama menunggu.

import { KerangkaMemuat } from '@/components/KerangkaMemuat';

export default function Loading() {
  return <KerangkaMemuat peran="tutor" />;
}