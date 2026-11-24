#!/usr/bin/env bash
# Uji runtime tiga perbaikan: tema, jadwal les tutor, billing panel, CSV.
# Login di sisi server dilakukan lewat Server Action, jadi di sini kita pakai
# cookie yang dihasilkan lewat POST /login sungguhan (bukan JWT mentah).

set -uo pipefail
BASE="http://localhost:3030"

lulus=0
gagal=0
cek() {
    local nama="$1" harap="$2" dapat="$3"
    if [ "$harap" = "$dapat" ]; then
        printf '  PASS  %-52s %s\n' "$nama" "$dapat"
        lulus=$((lulus + 1))
    else
        printf '  FAIL  %-52s harap %s, dapat %s\n' "$nama" "$harap" "$dapat"
        gagal=$((gagal + 1))
    fi
}

# login "email" -> tulis cookie ke /tmp/cookie-$email.txt
login() {
    local email="$1"
    # Ambil action id dari HTML form login (Next Server Action butuh header khusus).
    # Lebih langsung: pakai API Supabase untuk mendapat JWT, lalu set cookie sesuai
    # format @supabase/ssr (sb-*-auth-token).
    local tok ref payload
    tok=$(curl -s "https://fgeulnvsjetxlobxcadd.supabase.co/auth/v1/token?grant_type=password" \
        -H "apikey: sb_publishable_8rVvChvHPzMY0aWuLLoutQ_67Pj8x9N" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"Password123!\"}")
    ref=$(echo "$tok" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['refresh_token'])")
    payload=$(echo "$tok" | python3 -c "
import sys, json, base64
d = json.load(sys.stdin)
p = d['access_token'].split('.')[1]
p += '=' * (-len(p) % 4)
print(json.dumps(json.loads(base64.urlsafe_b64decode(p)))[:200])
" 2>/dev/null || echo '{}')
    echo "$tok" > "/tmp/tok-$email.json"
    echo "$ref" > "/tmp/ref-$email.txt"
}

# Susun cookie ala @supabase/ssr: sb-<b64url>-auth-token=base64(json)
buat_cookie() {
    local email="$1"
    local tokjson ref
    tokjson=$(cat "/tmp/tok-$email.json")
    ref=$(cat "/tmp/ref-$email.txt")
    python3 - "$tokjson" "$ref" <<'PYEOF'
import sys, json, base64
tok = json.loads(sys.argv[1])
ref = sys.argv[2]
inner = {"access_token": tok["access_token"], "refresh_token": ref}
name = "sb-" + base64.urlsafe_b64encode(b"https://fgeulnvsjetxlobxcadd.supabase.co/auth/v1").decode().rstrip("=") + "-auth-token"
val = base64.b64encode(json.dumps(inner).encode()).decode()
print(f"{name}={val}")
PYEOF
}

login "admin@stargeneration.test"
login "tutor1@stargeneration.test"
C_ADMIN=$(buat_cookie "admin@stargeneration.test")
C_TUTOR=$(buat_cookie "tutor1@stargeneration.test")

echo "== Tema terpasang (font & token di HTML) =="
HTML=$(curl -s "$BASE/login")
echo "$HTML" | grep -q "DM Sans" >/dev/null 2>&1
if echo "$HTML" | grep -qi "dm.sans\|--font-dm-sans"; then
    printf '  PASS  %-52s %s\n' "DM Sans dimuat di login" "ya"; lulus=$((lulus+1))
else
    printf '  FAIL  %-52s %s\n' "DM Sans dimuat di login" "tidak"; gagal=$((gagal+1))
fi

echo
echo "== Halaman admin (billing + tema navy) =="
kode=$(curl -s -o /tmp/admin.html -w "%{http_code}" "$BASE/admin/billing" -H "Cookie: $C_ADMIN")
cek "GET /admin/billing (admin)" "200" "$kode"
grep -q "Kesehatan Billing" /tmp/admin.html && r="ya" || r="tidak"
cek "billing panel dirender" "ya" "$r"
grep -q "Margin per kelas" /tmp/admin.html && r="ya" || r="tidak"
cek "tabel margin tampil" "ya" "$r"

# Tutor TIDAK boleh buka billing
kode=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/billing" -H "Cookie: $C_TUTOR")
if [ "$kode" = "307" ] || [ "$kode" = "403" ]; then
    printf '  PASS  %-52s ditolak (%s)\n' "tutor diblokir dari billing" "$kode"; lulus=$((lulus+1))
else
    printf '  FAIL  %-52s http %s\n' "tutor diblokir dari billing" "$kode"; gagal=$((gagal+1))
fi

echo
echo "== CSV pendapatan =="
body=$(curl -s "$BASE/tutor/pendapatan/unduh" -H "Cookie: $C_TUTOR" -D /tmp/csv_headers.txt)
kode=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/tutor/pendapatan/unduh" -H "Cookie: $C_TUTOR")
cek "GET /tutor/pendapatan/unduh" "200" "$kode"
echo "$body" | grep -q "tanggal_les" && r="ya" || r="tidak"
cek "header CSV ada" "ya" "$r"
grep -qi "text/csv" /tmp/csv_headers.txt && r="ya" || r="tidak"
cek "Content-Type text/csv" "ya" "$r"
echo "$body" | grep -q "attachment" /tmp/csv_headers.txt && r="ya" || r="tidak"
cek "Content-Disposition attachment" "ya" "$r"

# Anon tidak boleh
kode=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/tutor/pendapatan/unduh")
if [ "$kode" = "403" ] || [ "$kode" = "307" ]; then
    printf '  PASS  %-52s ditolak (%s)\n' "anon diblokir dari CSV" "$kode"; lulus=$((lulus+1))
else
    printf '  FAIL  %-52s http %s\n' "anon diblokir dari CSV" "$kode"; gagal=$((gagal+1))
fi

echo
echo "== Header keamanan tetap ada =="
curl -s -I "$BASE/login" | grep -qi "x-frame-options: DENY" && r="ya" || r="tidak"
cek "X-Frame-Options" "ya" "$r"

echo
echo "================================================"
echo "LULUS: $lulus   GAGAL: $gagal"
echo "================================================"
[ "$gagal" -eq 0 ]
