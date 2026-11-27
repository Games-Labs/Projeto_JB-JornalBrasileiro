/* =========================================================
   Cloudflare Pages Function: /api/push — entrega as notificações push (Web Push).

   Quem chama é o banco (supabase: push_dispatch, via pg_net) quando cria uma notificação: manda os
   aparelhos de destino e o texto, com o segredo X-JB-Hook. Esta Function criptografa a mensagem
   para cada aparelho (RFC 8291, aes128gcm), assina com a chave VAPID (RFC 8292) e entrega ao
   serviço de push do navegador (Google, Mozilla, Apple, Microsoft). Aparelhos que não existem mais
   (404/410) são apagados no banco pela função push_gone.

   Segredos (Cloudflare Pages > Settings > Variables and Secrets), ver docs/DEPLOY.md:
     VAPID_PRIVATE_KEY  chave privada VAPID (base64url, 32 bytes)
     PUSH_HOOK_SECRET   o mesmo valor de jb_push_hook_secret no Vault do Supabase
   Opcional: VAPID_PUBLIC_KEY (padrão: a mesma de assets/js/config.js), SUPABASE_URL / SUPABASE_ANON_KEY.
   ========================================================= */
const DEFAULT_PUBLIC = 'BANyUTYZfVZaWyng-4WCwi0HSCOxxQXh3XvyAMakUTNZmd3uU-Ntk3dpFFeXLkqYBgWTTFtj0KwBc1vbmK62c00';
const DEFAULT_SUPABASE_URL = 'https://cjzinwnyzcsxtwmgbcpo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-FcYDCNnccpWU5FWIFiKkA_6Da70Hbn';
// Mesmos serviços aceitos pelo banco (push_subscriptions.endpoint)
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)\//;
const MAX_SUBS = 40;   // limite de sub-requisições por chamada no plano gratuito da Cloudflare

const enc = new TextEncoder();
const b64u = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = s => { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };
const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Comparação em tempo constante (o segredo não vaza pelo tempo de resposta)
function sameSecret(a, b) {
    const x = enc.encode(String(a || '')), y = enc.encode(String(b || ''));
    let diff = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
    return diff === 0 && x.length > 0;
}

async function hkdf(salt, ikm, info, bytes) {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// RFC 8291: mensagem criptografada para um aparelho (um único registro aes128gcm)
async function encrypt(payload, p256dh, authSecret) {
    const uaPublic = fromB64u(p256dh), auth = fromB64u(authSecret);
    if (uaPublic.length !== 65 || auth.length !== 16) throw new Error('chaves do aparelho inválidas');
    const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
    const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
    const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic), 32);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
    const nonce = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
    const rs = new Uint8Array([0, 0, 16, 0]);   // tamanho do registro: 4096
    return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// RFC 8292: token VAPID (JWT ES256) para o serviço de push do aparelho
async function vapidHeader(endpoint, publicKey, privateKey, subject) {
    const pub = fromB64u(publicKey);
    const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: privateKey, ext: true };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
    return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + publicKey;
}

export async function onRequestPost({ request, env }) {
    const secret = env && env.PUSH_HOOK_SECRET, priv = env && env.VAPID_PRIVATE_KEY;
    if (!secret || !priv) return json({ error: 'push não configurado' }, 503);
    if (!sameSecret(request.headers.get('X-JB-Hook'), secret)) return json({ error: 'não autorizado' }, 401);
    let msg;
    try { msg = await request.json(); } catch (e) { return json({ error: 'pedido inválido' }, 400); }
    const subs = (Array.isArray(msg.subs) ? msg.subs : []).filter(s => s && PUSH_HOSTS.test(String(s.endpoint || ''))).slice(0, MAX_SUBS);
    const url = /^pages\/[a-z0-9-]+\.html(\?[A-Za-z0-9=&%._-]{0,200})?$/.test(String(msg.url || '')) ? msg.url : '';
    const payload = JSON.stringify({ title: String(msg.title || 'Jornal Brasileiro').slice(0, 200), body: String(msg.body || '').slice(0, 300), url, tag: String(msg.tag || '').slice(0, 80) });
    const publicKey = (env && env.VAPID_PUBLIC_KEY) || DEFAULT_PUBLIC;
    const subject = new URL(request.url).origin;
    const gone = [];
    let sent = 0;
    await Promise.all(subs.map(async s => {
        try {
            const bodyBytes = await encrypt(payload, s.p256dh, s.auth);
            const r = await fetch(s.endpoint, {
                method: 'POST',
                headers: { Authorization: await vapidHeader(s.endpoint, publicKey, priv, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
                body: bodyBytes
            });
            if (r.status === 404 || r.status === 410) gone.push(s.endpoint);
            else if (r.ok) sent++;
        } catch (e) { /* aparelho com chave inválida ou serviço fora do ar: tenta na próxima */ }
    }));
    if (gone.length) {
        const base = String((env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
        const key = (env && env.SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_KEY;
        try {
            await fetch(base + '/rest/v1/rpc/push_gone', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_secret: secret, p_endpoints: gone }) });
        } catch (e) { }
    }
    return json({ sent, gone: gone.length });
}
