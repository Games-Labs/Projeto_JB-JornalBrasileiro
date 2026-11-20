// Cloudflare Pages Function: /robots.txt com o endereço real do sitemap (precisa ser absoluto).
// As páginas de conta e do painel não são bloqueadas aqui de propósito: elas têm robots=noindex, e o
// buscador só enxerga esse aviso se puder abrir a página.
export function onRequestGet({ request }) {
    const origin = new URL(request.url).origin;
    const body = 'User-agent: *\nAllow: /\nDisallow: /supabase/\nDisallow: /functions/\nDisallow: /docs/\n\nSitemap: ' + origin + '/sitemap.xml\n';
    return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}
