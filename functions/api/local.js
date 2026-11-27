// Cloudflare Pages Function: /api/local — cidade aproximada do leitor, pela localização que a
// própria Cloudflare já calcula para a conexão (request.cf). Sem GPS e sem serviço externo; nada é
// guardado. O site só chama com o consentimento "Localização aproximada" (ver assets/js/storage.js, Ext.locate).
export async function onRequestGet({ request }) {
    const cf = request.cf || {};
    const lat = Number(cf.latitude), lon = Number(cf.longitude);
    const ok = cf.city && isFinite(lat) && isFinite(lon);
    const body = ok ? { city: String(cf.city), region: String(cf.region || ''), country: String(cf.country || ''), lat, lon } : { city: null };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
