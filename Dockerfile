# Dockerfile
#
# Tiga tahap. Alasannya sederhana: node_modules untuk build (~390MB) tidak
# perlu ikut ke image akhir, yang cuma butuh hasil build standalone (~71MB).
#
# Catatan penting: NEXT_PUBLIC_* dibaca saat BUILD, bukan saat runtime. Jadi
# kalau URL atau key berubah, image harus di-build ulang, bukan sekadar restart.

# ---------- tahap 1: dependency ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- tahap 2: build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variabel ini di-inline ke bundle JavaScript, karena itu harus tersedia
# sekarang. Nilainya bukan rahasia (publishable key memang untuk publik).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- tahap 3: runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5027
ENV HOSTNAME=0.0.0.0

# Jangan jalan sebagai root. Kalau nanti ada celah di aplikasi, penyerang
# tidak langsung dapat akses root container.
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

# Hanya tiga hal ini yang dibutuhkan saat runtime.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 5027

CMD ["node", "server.js"]
