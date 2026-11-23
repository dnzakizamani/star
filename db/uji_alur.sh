#!/usr/bin/env bash
# Uji alur bisnis end-to-end lewat REST API, memakai JWT user sungguhan.
#
# Alur yang diuji (sesuai PRD):
#   1. Tutor menandai les selesai  -> logbook bulan itu terbuka otomatis
#   2. Tutor mengisi entri         -> tersimpan
#   3. Tutor submit                -> entri terkunci, tidak bisa ditambah
#   4. Admin approve               -> pendapatan tutor tercatat di earnings_ledger
#   5. Logbook approved            -> tidak bisa diubah siapa pun
#
# Jalankan: bash db/uji_alur.sh

set -uo pipefail

API="https://fgeulnvsjetxlobxcadd.supabase.co"
KEY="sb_publishable_8rVvChvHPzMY0aWuLLoutQ_67Pj8x9N"
SANDI="Password123!"

lulus=0
gagal=0

cek() {
    local nama="$1" harap="$2" dapat="$3"
    if [ "$harap" = "$dapat" ]; then
        printf '  PASS  %-58s %s\n' "$nama" "$dapat"
        lulus=$((lulus + 1))
    else
        printf '  FAIL  %-58s harap %s, dapat %s\n' "$nama" "$harap" "$dapat"
        gagal=$((gagal + 1))
    fi
}

token() {
    curl -s "$API/auth/v1/token?grant_type=password" \
        -H "apikey: $KEY" -H "Content-Type: application/json" \
        -d "{\"email\":\"$1\",\"password\":\"$SANDI\"}" \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
}

# PATCH sebagai user tertentu. Cetak kode HTTP.
patch() {
    local tok="$1" path="$2" body="$3"
    curl -s -o /tmp/alur_body.json -w "%{http_code}" -X PATCH "$API/rest/v1/$path" \
        -H "apikey: $KEY" -H "Authorization: Bearer $tok" \
        -H "Content-Type: application/json" -H "Prefer: return=representation" \
        -d "$body"
}

# POST sebagai user tertentu.
post() {
    local tok="$1" path="$2" body="$3"
    curl -s -o /tmp/alur_body.json -w "%{http_code}" -X POST "$API/rest/v1/$path" \
        -H "apikey: $KEY" -H "Authorization: Bearer $tok" \
        -H "Content-Type: application/json" -H "Prefer: return=representation" \
        -d "$body"
}

T_ADMIN=$(token "admin@stargeneration.test")
T_TUTOR=$(token "tutor1@stargeneration.test")

if [ -z "$T_ADMIN" ] || [ -z "$T_TUTOR" ]; then
    echo "GAGAL ambil token."
    exit 1
fi

echo "== Siapkan les baru di Desember 2026 =="
# Bersihkan sisa run sebelumnya supaya tes bisa dijalankan berulang.
# Trigger blocks mutate logbooks/entries once approved, so they are disabled
# for the cleanup only, then re-enabled immediately.
if [ -n "${SUPABASE_DB_HOST:-}" ] || [ -f "$(dirname "${BASH_SOURCE[0]}")/../.env.db" ]; then
    bash "$(dirname "${BASH_SOURCE[0]}")/supabase.sh" -q -c "
        alter table logbook_entries disable trigger trg_logbook_entries_block_delete;
        delete from logbook_entries where lesson_id in (select id from lessons where starts_at >= '2026-12-01');
        alter table logbook_entries enable trigger trg_logbook_entries_block_delete;
        delete from earnings_ledger where logbook_id in (select id from logbooks where period_month = 12);
        alter table logbooks disable trigger trg_logbooks_block_delete;
        delete from logbooks where period_month = 12;
        alter table logbooks enable trigger trg_logbooks_block_delete;
        delete from lessons where starts_at >= '2026-12-01';
    " >/dev/null 2>&1
fi

# Admin menjadwalkan les baru.
kode=$(post "$T_ADMIN" "lessons" '{
  "class_id":"77777777-7777-7777-7777-777777777777",
  "tutor_id":"22222222-2222-2222-2222-222222222222",
  "starts_at":"2026-12-05T09:00:00Z",
  "ends_at":"2026-12-05T10:30:00Z",
  "status":"scheduled"
}')
cek "admin membuat les Desember" "201" "$kode"

LES_ID=$(python3 -c "import json;d=json.load(open('/tmp/alur_body.json'));print(d[0]['id'] if isinstance(d,list) and d else '')")
if [ -z "$LES_ID" ]; then
    echo "GAGAL membuat les."
    cat /tmp/alur_body.json
    exit 1
fi
echo "  les_id=$LES_ID"

echo
echo "== 1. Tutor menandai les selesai =="
kode=$(patch "$T_TUTOR" "lessons?id=eq.$LES_ID" '{"status":"completed"}')
cek "tutor menandai les selesai" "200" "$kode"

# Trigger database harus sudah membuat logbook Desember 2026.
jumlah=$(curl -s "$API/rest/v1/logbooks?select=id,status&class_id=eq.77777777-7777-7777-7777-777777777777&period_year=eq.2026&period_month=eq.12" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_TUTOR" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else 0)")
cek "logbook Desember terbuka otomatis" "1" "$jumlah"

LOGBOOK_ID=$(curl -s "$API/rest/v1/logbooks?select=id&class_id=eq.77777777-7777-7777-7777-777777777777&period_year=eq.2026&period_month=eq.12" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_TUTOR" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else '')")
echo "  logbook_id=$LOGBOOK_ID"

echo
echo "== 2. Tutor mengisi entri =="
kode=$(post "$T_TUTOR" "logbook_entries" "{
  \"logbook_id\":\"$LOGBOOK_ID\",
  \"lesson_id\":\"$LES_ID\",
  \"topic\":\"Trigonometri: identitas sudut rangkap\",
  \"activities\":\"Latihan 12 soal identitas sudut rangkap, diskusi langkah pembuktian.\",
  \"tutor_observation\":\"Sudah lancar di sudut istimewa, masih ragu saat pembuktian panjang.\",
  \"next_recommendation\":\"Ulang pembuktian identitas, lalu latihan soal cerita.\"
}")
cek "tutor menyimpan entri" "201" "$kode"

echo
echo "== 3. Tutor submit ke admin =="
kode=$(patch "$T_TUTOR" "logbooks?id=eq.$LOGBOOK_ID" '{"status":"submitted"}')
cek "tutor submit logbook" "200" "$kode"

# Entri baru harus ditolak setelah submit.
kode=$(post "$T_TUTOR" "logbook_entries" "{
  \"logbook_id\":\"$LOGBOOK_ID\",
  \"lesson_id\":\"$LES_ID\",
  \"topic\":\"Coba lagi\",
  \"activities\":\"x\",
  \"tutor_observation\":\"x\"
}")
if [ "$kode" != "201" ]; then
    printf '  PASS  %-58s ditolak (%s)\n' "entri ditolak setelah submit" "$kode"
    lulus=$((lulus + 1))
else
    printf '  FAIL  %-58s masih diterima\n' "entri ditolak setelah submit"
    gagal=$((gagal + 1))
fi

echo
echo "== 4. Tutor tidak boleh approve sendiri =="
kode=$(patch "$T_TUTOR" "logbooks?id=eq.$LOGBOOK_ID" '{"status":"approved"}')
if [ "$kode" = "200" ]; then
    # 204 saja tidak cukup: RLS bisa menolak tanpa error, jadi cek statusnya.
    status=$(curl -s "$API/rest/v1/logbooks?select=status&id=eq.$LOGBOOK_ID" \
        -H "apikey: $KEY" -H "Authorization: Bearer $T_TUTOR" \
        | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['status'] if isinstance(d,list) and d else '')")
else
    status="ditolak($kode)"
fi

if [ "$status" = "approved" ]; then
    printf '  FAIL  %-58s tutor berhasil approve sendiri\n' "tutor tidak bisa approve sendiri"
    gagal=$((gagal + 1))
else
    printf '  PASS  %-58s status tetap %s\n' "tutor tidak bisa approve sendiri" "$status"
    lulus=$((lulus + 1))
fi

echo
echo "== 5. Admin approve =="
kode=$(patch "$T_ADMIN" "logbooks?id=eq.$LOGBOOK_ID" '{"status":"approved"}')
cek "admin approve logbook" "200" "$kode"

# Pendapatan harus otomatis tercatat: 1.5 jam x 60.000 = 90.000.
hasil=$(curl -s "$API/rest/v1/earnings_ledger?select=hours,amount,tutor_rate&logbook_id=eq.$LOGBOOK_ID" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_ADMIN" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
if isinstance(d, list) and d:
    print(f\"{float(d[0]['hours'])}jam/{int(float(d[0]['amount']))}\")
else:
    print('kosong')
")
cek "pendapatan tutor tercatat otomatis" "1.5jam/90000" "$hasil"

echo
echo "== 6. Logbook approved terkunci =="
kode=$(patch "$T_TUTOR" "logbook_entries?lesson_id=eq.$LES_ID" '{"topic":"Diubah setelah approve"}')
topik=$(curl -s "$API/rest/v1/logbook_entries?select=topic&lesson_id=eq.$LES_ID" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_TUTOR" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['topic'] if isinstance(d,list) and d else '')")

if [ "$topik" = "Diubah setelah approve" ]; then
    printf '  FAIL  %-58s entri masih bisa diubah\n' "entri terkunci setelah approved"
    gagal=$((gagal + 1))
else
    printf '  PASS  %-58s (http %s)\n' "entri terkunci setelah approved" "$kode"
    lulus=$((lulus + 1))
fi

echo
echo "================================================"
echo "LULUS: $lulus   GAGAL: $gagal"
echo "================================================"

[ "$gagal" -eq 0 ]
