#!/usr/bin/env bash
# Uji RLS lewat REST API, memakai akun demo yang benar-benar login.
#
# Kenapa lewat API dan bukan SQL langsung?
# SQL langsung berjalan sebagai postgres dan melewati RLS, jadi hasilnya selalu
# "terlihat semua" dan tidak membuktikan apa pun. Lewat API, request membawa JWT
# user, dan PostgREST menegakkan policy persis seperti yang dialami browser.
#
# Jalankan: bash db/uji_rls.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="https://fgeulnvsjetxlobxcadd.supabase.co"
KEY="sb_publishable_8rVvChvHPzMY0aWuLLoutQ_67Pj8x9N"
SANDI="Password123!"

lulus=0
gagal=0

# Ambil access token untuk satu akun demo.
ambil_token() {
    curl -s "$API/auth/v1/token?grant_type=password" \
        -H "apikey: $KEY" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$1\",\"password\":\"$SANDI\"}" \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
}

# periksa "nama uji" "jumlah_diharapkan" "token" "path"
# Menghitung panjang array JSON yang dikembalikan.
periksa_jumlah() {
    local nama="$1" harap="$2" token="$3" path="$4"
    local hasil
    hasil=$(curl -s "$API/rest/v1/$path" \
        -H "apikey: $KEY" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'ERR')" 2>/dev/null)

    if [ "$hasil" = "$harap" ]; then
        printf '  PASS  %-52s %s baris\n' "$nama" "$hasil"
        lulus=$((lulus + 1))
    else
        printf '  FAIL  %-52s harap %s, dapat %s\n' "$nama" "$harap" "$hasil"
        gagal=$((gagal + 1))
    fi
}

# periksa_nihil "nama uji" "token" "path"
# Memastikan query ditolak atau mengembalikan nol baris.
periksa_nihil() {
    local nama="$1" token="$2" path="$3"
    local hasil
    hasil=$(curl -s "$API/rest/v1/$path" \
        -H "apikey: $KEY" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'DENIED')" 2>/dev/null)

    if [ "$hasil" = "0" ] || [ "$hasil" = "DENIED" ]; then
        printf '  PASS  %-52s terkurung (%s)\n' "$nama" "$hasil"
        lulus=$((lulus + 1))
    else
        printf '  FAIL  %-52s BOCOR, dapat %s baris\n' "$nama" "$hasil"
        gagal=$((gagal + 1))
    fi
}

echo "Mengambil token..."
T_ADMIN=$(ambil_token "admin@stargeneration.test")
T_TUTOR1=$(ambil_token "tutor1@stargeneration.test")
T_TUTOR2=$(ambil_token "tutor2@stargeneration.test")
T_SISWA1=$(ambil_token "student1@stargeneration.test")
ANON=""

for t in "$T_ADMIN" "$T_TUTOR1" "$T_TUTOR2" "$T_SISWA1"; do
    if [ -z "$t" ]; then
        echo "GAGAL mengambil token. Cek password akun demo."
        exit 1
    fi
done

echo
echo "== Admin boleh melihat semua =="
periksa_jumlah "admin lihat semua kelas"        1 "$T_ADMIN"  "classes?select=id"
periksa_jumlah "admin lihat semua invoice"      2 "$T_ADMIN"  "invoices?select=id"
periksa_jumlah "admin lihat semua pendaftaran"  2 "$T_ADMIN"  "enrollments?select=id"

echo
echo "== Tutor hanya kelas sendiri =="
periksa_jumlah "tutor1 lihat kelas sendiri"      1 "$T_TUTOR1" "classes?select=id"
periksa_nihil  "tutor2 tidak lihat kelas tutor1" "$T_TUTOR2" "classes?select=id&tutor_id=eq.22222222-2222-2222-2222-222222222222"

echo
echo "== Rate siswa tersembunyi dari tutor =="
hasil_rate=$(curl -s "$API/rest/v1/v_classes_safe?select=student_rate" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_TUTOR1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('NULL' if d and d[0]['student_rate'] is None else 'BOCOR')")
if [ "$hasil_rate" = "NULL" ]; then
    printf '  PASS  %-52s %s\n' "tutor lihat student_rate" "null"
    lulus=$((lulus + 1))
else
    printf '  FAIL  %-52s BOCOR\n' "tutor lihat student_rate"
    gagal=$((gagal + 1))
fi

echo
echo "== Siswa hanya miliknya sendiri =="
periksa_jumlah "siswa1 lihat invoice sendiri"    1 "$T_SISWA1" "invoices?select=id"
periksa_nihil  "siswa1 tidak lihat invoice lain" "$T_SISWA1" "invoices?select=id&student_id=neq.44444444-4444-4444-4444-444444444444"

echo
echo "== Tanpa login tidak dapat apa pun =="
periksa_nihil "anon baca classes"   "$ANON" "classes?select=id"
periksa_nihil "anon baca invoices"  "$ANON" "invoices?select=id"
periksa_nihil "anon baca profiles"  "$ANON" "profiles?select=id"

echo
echo "================================================"
echo "LULUS: $lulus   GAGAL: $gagal"
echo "================================================"

[ "$gagal" -eq 0 ]
