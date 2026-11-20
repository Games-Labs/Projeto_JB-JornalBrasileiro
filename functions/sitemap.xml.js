// Cloudflare Pages Function: /sitemap.xml para os buscadores. Capa, seções públicas e todas as
// matérias publicadas (consulta pública ao Supabase, RLS vale igual). Páginas de conta e do painel
// ficam de fora (elas também têm robots=noindex). Ver functions/_lib/seo.js.
import { esc, supabaseGet } from './_lib/seo.js';

const SECTIONS = ['pages/noticias', 'pages/politica', 'pages/economia', 'pages/esportes', 'pages/investigacao', 'pages/opiniao',
    'pages/entrevistas', 'pages/verificacao', 'pages/ao-vivo', 'pages/arquivo', 'pages/autor', 'pages/denuncias', 'pages/institucional'];

export async function onRequestGet({ request, env }) {
    const origin = new URL(request.url).origin;
    const rows = await supabaseGet(env, 'news?select=id,date,updated_at&status=eq.publicada&date=lte.' +
        encodeURIComponent(new Date().toISOString()) + '&order=date.desc&limit=5000', 4000);
    const news = Array.isArray(rows) ? rows : [];
    const newest = news[0] ? (news[0].updated_at || news[0].date) : '';
    const url = (loc, lastmod) => '<url><loc>' + esc(loc) + '</loc>' + (lastmod ? '<lastmod>' + esc(String(lastmod).slice(0, 10)) + '</lastmod>' : '') + '</url>';
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        url(origin + '/', newest) + '\n' +
        SECTIONS.map(p => url(origin + '/' + p)).join('\n') + '\n' +
        news.map(n => url(origin + '/pages/noticia?id=' + encodeURIComponent(n.id), n.updated_at || n.date)).join('\n') +
        '\n</urlset>\n';
    // Se o Supabase falhar, entrega só as seções e não guarda no cache
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': rows ? 'public, max-age=3600' : 'no-store' } });
}
