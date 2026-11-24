// Tipe data yang mencerminkan tabel di database.
//
// Ditulis manual, bukan hasil generate, supaya kamu bisa membaca file ini
// sebagai dokumentasi: kolom apa saja yang ada, mana yang boleh null.
//
// Aturan penamaan: nama field SAMA PERSIS dengan nama kolom database. Kalau
// beda, kamu harus mengingat dua nama untuk satu data yang sama.

export type Peran = 'admin' | 'tutor' | 'student';

export type Profil = {
  id: string;
  email: string;
  full_name: string;
  role: Peran;
  is_active: boolean;
  created_at: string;
};

export type Kelas = {
  id: string;
  name: string;
  tutor_id: string;
  // null kalau yang membaca adalah tutor: kolom ini sengaja disembunyikan
  // di level database lewat view v_classes_safe.
  student_rate: number | null;
  tutor_rate: number | null;
  capacity: number;
  status: 'active' | 'archived';
  created_at: string;
};

export type Pendaftaran = {
  id: string;
  class_id: string;
  student_id: string;
  package_hours: number;
  rate_at_purchase: number;
  // pending = siswa mendaftar sendiri dan belum dibayar.
  status: 'pending' | 'active' | 'completed' | 'dropped';
  created_at: string;
};

export type Invoice = {
  id: string;
  enrollment_id: string;
  invoice_number: string;
  amount: number;
  status: 'unpaid' | 'paid' | 'void';
  paid_at: string | null;
  created_at: string;
};

export type Les = {
  id: string;
  class_id: string;
  tutor_id: string;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
};

export type Logbook = {
  id: string;
  class_id: string;
  period_year: number;
  period_month: number;
  status: 'draft' | 'submitted' | 'returned' | 'approved';
  admin_note: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export type EntriLogbook = {
  id: string;
  logbook_id: string;
  lesson_id: string;
  topic: string;
  activities: string;
  tutor_observation: string;
  next_recommendation: string | null;
  created_at: string;
  updated_at: string | null;
};

export type SaldoPendaftaran = {
  enrollment_id: string;
  class_id: string;
  student_id: string;
  enrollment_status: 'pending' | 'active' | 'completed' | 'dropped';
  package_hours: number;
  rate_at_purchase: number;
  hours_used: number;
  hours_remaining: number;
};

export type RingkasanLogbook = {
  logbook_id: string;
  class_id: string;
  period_year: number;
  period_month: number;
  status: 'draft' | 'submitted' | 'returned' | 'approved';
  class_name: string;
  tutor_id: string;
  tutor_rate: number;
  entry_count: number;
  total_hours: number;
  projected_payout: number;
  ledgered_payout: number;
};

export type PendapatanTutor = {
  id: string;
  lesson_id: string;
  logbook_id: string;
  tutor_id: string;
  hours: number;
  tutor_rate: number;
  amount: number;
  created_at: string;
};
