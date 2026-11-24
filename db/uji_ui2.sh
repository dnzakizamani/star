#!/usr/bin/env bash
# Login lewat Server Action sungguhan untuk mendapat cookie sesi asli,
# lalu ulangi uji UI dengan cookie itu.
set -uo pipefail
BASE="http://localhost:3030"
KEY="sb_publishable_8rVvChvHPzMY0aWuLLoutQ_67Pj8x9N"

# 1. Ambil action id dari flight payload halaman login.
HTML=$(curl -s "$BASE/login" -H "RSC: 1")
ACTION_ID=$(echo "$HTML" | grep -oE '"\$ACTION_ID_[a-f0-9]+"' | head -1 | tr -d '"' | sed 's/\$ACTION_ID_//')
if [ -z "$ACTION_ID" ]; then
    # alternatif: cari pola lain
    ACTION_ID=$(echo "$HTML" | grep -oE '[0-9a-f]{40,}' | head -1)
fi
echo "action_id=$ACTION_ID"

login_via_action() {
    local email="$1" jar="$2"
    curl -s -o /dev/null -c "$jar" -X POST "$BASE/login" \
        -H "Next-Action: $ACTION_ID" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "email=$email" \
        --data-urlencode "password=Password123!"
}

login_via_action "admin@stargeneration.test" /tmp/ck_admin.txt
login_via_action "tutor1@stargeneration.test" /tmp/ck_tutor.txt

echo "--- cookie admin ---"
grep -c "auth-token" /tmp/ck_admin.txt 2>/dev/null || echo 0
echo "--- cookie tutor ---"
grep -c "auth-token" /tmp/ck_tutor.txt 2>/dev/null || echo 0

lulus=0; gagal=0
cek() {
    local nama="$1" harap="$2" dapat="$3"
    if [ "$harap" = "$dapat" ]; then
        printf '  PASS  %-52s %s\n' "$nama" "$dapat"; lulus=$((lulus+1))
    else
        printf '  FAIL  %-52s harap %s, dapat %s\n' "$nama" "$harap" "$dapat"; gagal=$((gagal+1))
    fi
}

echo
echo "== Billing panel =="
kode=$(curl -s -o /tmp/admin.html -w "%{http_code}" "$BASE/admin/billing" -b /tmp/ck_admin.txt)
cek "GET /admin/billing (admin)" "200" "$kode"
grep -q "Kesehatan Billing" /tmp/admin.html && r="ya" || r="tidak"
cek "judul billing dirender" "ya" "$r"
grep -q "Margin per kelas" /tmp/admin.html && r="ya" || r="tidak"
cek "tabel margin tampil" "ya" "$r"

# Tutor diblokir: diarahkan ke /tidak-berhak (200) atau redirect.
curl -s -o /tmp/tutor_billing.html -w "%{http_code}" "$BASE/admin/billing" -b /tmp/ck_tutor.txt > /tmp/kode_tutor.txt
kode=$(cat /tmp/kode_tutor.txt)
if grep -q "tidak bisa dibuka\|Halaman tidak tersedia" /tmp/tutor_billing.html || [ "$kode" = "307" ]; then
    printf '  PASS  %-52s (%s)\n' "tutor diblokir dari billing" "$kode"; lulus=$((lulus+1))
else
    printf '  FAIL  %-52s http %s\n' "tutor diblokir dari billing" "$kode"; gagal=$((gagal+1))
fi

echo
echo "== CSV pendapatan =="
kode=$(curl -s -o /tmp/pendapatan.csv -w "%{http_code}" "$BASE/tutor/pendapatan/unduh" -b /tmp/ck_tutor.txt -D /tmp/csv_headers.txt)
cek "GET unduh CSV (tutor)" "200" "$kode"
head -1 /tmp/pendapatan.csv | grep -q "tanggal_les" && r="ya" || r="tidak"
cek "header CSV benar" "ya" "$r"
grep -qi "text/csv" /tmp/csv_headers.txt && r="ya" || r="tidak"
cek "Content-Type text/csv" "ya" "$r"
grep -qi "attachment" /tmp/csv_headers.txt && r="ya" || r="tidak"
cek "Content-Disposition attachment" "ya" "$r"

# Admin juga boleh unduh (rekap semua).
kode=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/tutor/pendapatan/unduh" -b /tmp/ck_admin.txt)
cek "GET unduh CSV (admin, semua)" "200" "$kode"

# Anon ditolak.
kode=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/tutor/pendapatan/unduh")
cek "anon ditolak" "403" "$kode"

echo
echo "== Halaman tutor punya form jadwal =="
curl -s -o /tmp/tutor.html "$BASE/tutor" -b /tmp/ck_tutor.txt
grep -q "Jadwalkan les" /tmp/tutor.html && r="ya" || r="tidak"
cek "form jadwalkan les tampil" "ya" "$r"

echo
echo "================================================"
echo "LULUS: $lulus   GAGAL: $gagal"
echo "================================================"
[ "$gagal" -eq 0 ]
