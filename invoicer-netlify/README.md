# Invoicer + akun

Struktur:
- `public/index.html`  : aplikasi (frontend)
- `netlify/functions/api.mjs` : pendaftaran, login, dan penyimpanan data per akun
- `netlify.toml`, `package.json`

## Cara deploy (harus lewat Git atau Netlify CLI, bukan drag-and-drop)
1. Push folder ini ke GitHub/GitLab, lalu "Add new site > Import from Git" di Netlify.
   (Atau: `npm i -g netlify-cli && npm install && netlify deploy --prod`)
2. Netlify: Site configuration > Environment variables > tambahkan `AUTH_SECRET`
   berisi teks acak minimal 32 karakter (contoh: `openssl rand -hex 32`).
3. Deploy ulang. Buka situs: akan muncul layar Masuk / Daftar.

Tanpa folder `netlify/functions` (mis. deploy statis biasa), aplikasi otomatis berjalan
dalam mode lokal: data hanya di browser tanpa login.
