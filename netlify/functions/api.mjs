// Akun & penyimpanan data Invoicer (Netlify Functions + Netlify Blobs).
// Wajib: environment variable AUTH_SECRET (acak, min. 32 karakter).
import { getStore } from "@netlify/blobs";
import { scrypt, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

const sc = promisify(scrypt);
const SECRET = () => process.env.AUTH_SECRET || "";
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const mac = (body) => createHmac("sha256", SECRET()).update(body).digest("base64url");
const sign = (p) => {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return body + "." + mac(body);
};
function verify(t) {
  try {
    const [body, sig] = String(t).split(".");
    const a = Buffer.from(sig || ""), b = Buffer.from(mac(body));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "");
  if (path === "ping") return json({ ok: true });
  if (SECRET().length < 32)
    return json({ error: "AUTH_SECRET terbaca " + SECRET().length + " karakter (butuh minimal 32)." }, 500);

  const store = getStore({ name: "invoicer", consistency: "strong" });
  try {
    if (req.method === "POST" && (path === "register" || path === "login")) {
      const { username = "", password = "" } = await req.json().catch(() => ({}));
      const u = String(username).trim().toLowerCase();
      const pw = String(password);
      if (!/^[a-z0-9_.-]{3,32}$/.test(u))
        return json({ error: "Nama pengguna 3–32 karakter: huruf kecil, angka, titik, strip, garis bawah." }, 400);
      if (pw.length < 8 || pw.length > 200) return json({ error: "Kata sandi minimal 8 karakter." }, 400);

      const key = "user/" + u;
      const rec = await store.get(key, { type: "json" });
      if (path === "register") {
        if (rec) return json({ error: "Nama pengguna sudah dipakai." }, 409);
        const salt = randomBytes(16);
        const hash = await sc(pw, salt, 64);
        await store.setJSON(key, { salt: salt.toString("hex"), hash: hash.toString("hex"), at: Date.now() });
      } else {
        const salt = rec ? Buffer.from(rec.salt, "hex") : randomBytes(16);
        const hash = await sc(pw, salt, 64);
        if (!rec || !timingSafeEqual(hash, Buffer.from(rec.hash, "hex")))
          return json({ error: "Nama pengguna atau kata sandi salah." }, 401);
      }
      return json({ token: sign({ u, exp: Date.now() + 30 * 864e5 }), username: u });
    }

    const me = verify((req.headers.get("authorization") || "").replace(/^Bearer /, ""));
    if (!me) return json({ error: "Sesi berakhir. Silakan masuk lagi." }, 401);
    const dkey = "data/" + me.u;

    if (path === "data" && req.method === "GET")
      return json((await store.get(dkey, { type: "json" })) || { rev: 0, data: {} });

    if (path === "data" && req.method === "PUT") {
      const raw = await req.text();
      if (raw.length > 5_000_000)
        return json({ error: "Data terlalu besar (maks. ±5 MB). Kurangi ukuran gambar tanda tangan." }, 413);
      const { baseRev, data } = JSON.parse(raw);
      if (!data || typeof data !== "object") return json({ error: "Data tidak valid." }, 400);
      const cur = (await store.get(dkey, { type: "json" })) || { rev: 0, data: {} };
      if (baseRev !== cur.rev) return json(cur, 409); // klien menggabungkan lalu mencoba lagi
      const rev = cur.rev + 1;
      await store.setJSON(dkey, { rev, data });
      return json({ rev });
    }
    return json({ error: "Tidak ditemukan." }, 404);
  } catch {
    return json({ error: "Kesalahan server." }, 500);
  }
};

export const config = { path: "/api/*" };
