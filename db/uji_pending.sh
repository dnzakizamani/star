#!/usr/bin/env bash
# Uji alur self-enrollment siswa lewat REST API sungguhan:
#   siswa insert pending -> invoice unpaid muncul -> admin tandai lunas -> aktif
#
# Desain anti-race: SEMUA uji memakai kelas buatan test ini sendiri (dibuat di
# awal, di-cascade-delete di akhir). Seed tidak disentuh sama sekali, jadi
# perubahan lain pada kelas seed tidak memengaruhi hasil.
set -uo pipefail

API="https://fgeulnvsjetxlobxcadd.supabase.co"
KEY="sb_publishable_8rVvChvHPzMY0aWuLLoutQ_67Pj8x9N"
SANDI="Password123!"
SISWA3="66666666-6666-6666-6666-666666666666"   # student3, tidak terdaftar di seed
TUTOR1="22222222-2222-2222-2222-222222222222"

lulus=0; gagal=0
cek() {
    local nama="$1" harap="$2" dapat="$3"
    if [ "$harap" = "$dapat" ]; then
        printf '  PASS  %-56s %s\n' "$nama" "$dapat"; lulus=$((lulus+1))
    else
        printf '  FAIL  %-56s harap %s, dapat %s\n' "$nama" "$harap" "$dapat"; gagal=$((gagal+1))
    fi
}

ambil_token() {
    curl -s "$API/auth/v1/token?grant_type=password" \
        -H "apikey: $KEY" -H "Content-Type: application/json" \
        -d "{\"email\":\"$1\",\"password\":\"$SANDI\"}" \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
}

T_SISWA3=$(ambil_token "student3@stargeneration.test")
T_ADMIN=$(ambil_token "admin@stargeneration.test")
[ -z "$T_SISWA3" ] && { echo "token siswa3 gagal"; exit 1; }
[ -z "$T_ADMIN" ] && { echo "token admin gagal"; exit 1; }

H_SISWA3=(-H "apikey: $KEY" -H "Authorization: Bearer $T_SISWA3" -H "Content-Type: application/json" -H "Prefer: return=representation")
H_ADMIN=(-H "apikey: $KEY" -H "Authorization: Bearer $T_ADMIN" -H "Content-Type: application/json" -H "Prefer: return=representation")

echo "== 0. Admin membuat kelas khusus uji =="
KELAS=$(curl -s -X POST "$API/rest/v1/classes" "${H_ADMIN[@]}" \
    -d "{\"name\":\"Uji Pending $(date +%s)\",\"capacity\":1,\"student_rate\":75000,\"tutor_rate\":50000,\"tutor_id\":\"$TUTOR1\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')")
if [ -z "$KELAS" ]; then
    echo "  GAGAL membuat kelas uji. Stop."
    exit 1
fi
echo "  kelas uji: $KELAS"

echo
echo "== 1. Siswa mendaftar sendiri (harus masuk sbg pending) =="
respons=$(curl -s -X POST "$API/rest/v1/enrollments" "${H_SISWA3[@]}" \
    -d "{\"class_id\":\"$KELAS\",\"student_id\":\"$SISWA3\",\"package_hours\":6,\"rate_at_purchase\":75000,\"status\":\"pending\"}")
status_baru=$(echo "$respons" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'] if isinstance(d,list) and d else 'DITOLAK: '+str(d)[:80])" 2>/dev/null)
ENR_ID=$(echo "$respons" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null)
cek "insert pending diterima" "pending" "$status_baru"

echo
echo "== 1b. Siswa mencoba insert active langsung (harus ditolak) =="
kode=$(curl -s -o /tmp/coba_active.json -w "%{http_code}" -X POST "$API/rest/v1/enrollments" "${H_SISWA3[@]}" \
    -d "{\"class_id\":\"$KELAS\",\"student_id\":\"$SISWA3\",\"package_hours\":6,\"rate_at_purchase\":75000,\"status\":\"active\"}")
if [ "$kode" = "201" ]; then
    printf '  FAIL  %-56s BOCOR!\n' "insert active oleh siswa"; gagal=$((gagal+1))
else
    alasan=$(python3 -c "import json; print(json.load(open('/tmp/coba_active.json')).get('code','-'))" 2>/dev/null)
    printf '  PASS  %-56s ditolak (%s, %s)\n' "insert active oleh siswa" "$kode" "$alasan"; lulus=$((lulus+1))
fi

echo
echo "== 1c. Rate palsu ditolak (client tidak boleh buat harga sendiri) =="
kode=$(curl -s -o /tmp/coba_rate.json -w "%{http_code}" -X POST "$API/rest/v1/enrollments" "${H_SISWA3[@]}" \
    -d "{\"class_id\":\"$KELAS\",\"student_id\":\"$SISWA3\",\"package_hours\":6,\"rate_at_purchase\":1,\"status\":\"pending\"}")
if [ "$kode" = "201" ]; then
    printf '  FAIL  %-56s rate palsu lolos!\n' "rate palsu"; gagal=$((gagal+1))
    ENR_PALSU=$(python3 -c "import json; print(json.load(open('/tmp/coba_rate.json'))[0]['id'])" 2>/dev/null)
    [ -n "$ENR_PALSU" ] && curl -s -X DELETE "$API/rest/v1/enrollments?id=eq.$ENR_PALSU" "${H_ADMIN[@]}" >/dev/null
else
    printf '  PASS  %-56s ditolak (%s)\n' "rate palsu" "$kode"; lulus=$((lulus+1))
fi

echo
echo "== 2. Invoice unpaid otomatis dibuat trigger =="
inv_json=$(curl -s "$API/rest/v1/invoices?enrollment_id=eq.$ENR_ID&select=id,status,amount" "${H_ADMIN[@]}")
jumlah_inv=$(echo "$inv_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
cek "invoice untuk enrollment baru" "1" "$jumlah_inv"
INV_ID=$(echo "$inv_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
status_inv=$(echo "$inv_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'] if d else '-')")
nominal=$(echo "$inv_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['amount'] if d else '-')")
cek "status invoice unpaid" "unpaid" "$status_inv"
nominal=$(echo "$inv_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('BENAR' if d and float(d[0]['amount'])==450000 else 'SALAH:'+str(d[0]['amount']) if d else '-')")
cek "nominal = 6 jam x 75000" "BENAR" "$nominal"

echo
echo "== 3. Kelas belum terlihat siswa sebelum lunas =="
n_kelas=$(curl -s "$API/rest/v1/classes?id=eq.$KELAS&select=id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_SISWA3" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'ERR')")
cek "siswa3 belum lihat kelas uji" "0" "$n_kelas"

echo
echo "== 4. Admin tandai lunas -> enrollment aktif otomatis =="
curl -s -X PATCH "$API/rest/v1/invoices?id=eq.$INV_ID" "${H_ADMIN[@]}" \
    -d '{"status":"paid","paid_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","paid_by":"11111111-1111-1111-1111-111111111111"}' >/dev/null
status_enr=$(curl -s "$API/rest/v1/enrollments?id=eq.$ENR_ID&select=status" "${H_ADMIN[@]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['status'])")
cek "enrollment jadi active setelah lunas" "active" "$status_enr"

echo
echo "== 5. Setelah lunas, siswa melihat kelas =="
n_kelas=$(curl -s "$API/rest/v1/classes?id=eq.$KELAS&select=id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $T_SISWA3" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'ERR')")
cek "siswa3 kini lihat kelasnya" "1" "$n_kelas"

echo
echo "== bersih-bersih: void invoice (paid dilindungi trigger), lalu hapus kelas =="
curl -s -X PATCH "$API/rest/v1/invoices?id=eq.$INV_ID" "${H_ADMIN[@]}" \
    -d '{"status":"void"}' >/dev/null
curl -s -X DELETE "$API/rest/v1/classes?id=eq.$KELAS" "${H_ADMIN[@]}" >/dev/null
sisa_enr=$(curl -s "$API/rest/v1/enrollments?id=eq.$ENR_ID&select=id" "${H_ADMIN[@]}" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
cek "enrollment uji terhapus (cascade)" "0" "$sisa_enr"

echo
echo "================================================"
echo "LULUS: $lulus   GAGAL: $gagal"
echo "================================================"
[ "$gagal" -eq 0 ]
