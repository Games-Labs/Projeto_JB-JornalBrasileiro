// Cloudflare Pages Function: /rss.xml — feed RSS 2.0 com as 40 matérias publicadas mais recentes
// (jornal e JB Educa). Consulta pública ao Supabase (RLS vale igual: só publicadas, sem agendadas).
// Cache de 15 minutos na Cloudflare e nos leitores de feed. Ver functions/_lib/seo.js.
import { esc, clip, supabaseGet, SITE } from './_lib/seo.js';

const CATEGORY = {
    politica: 'Política', economia: 'Economia', esportes: 'Esportes', investigacao: 'Investigação Especial', tecnologia: 'Tecnologia & Ciência',
    infraestrutura: 'Infraestrutura', brasil: 'Brasil', mundo: 'Mundo', educacao: 'Educação', saude: 'Saúde', meioambiente: 'Meio Ambiente', cultura: 'Cultura',
    matematica: 'Matemática', portugues: 'Português', redacao: 'Redação', ciencias: 'Ciências', historia: 'História', geografia: 'Geografia', ingles: 'Inglês'
};
const rfc822 = iso => new Date(iso).toUTCString();
// Mesmo critério de assets/js/storage.js (imgSrc): só https:// ou imagem da galeria do site
const imageUrl = (img, origin) => /^https:\/\//i.test(img || '') ? img : /^assets\/img\/[\w.-]+$/.test(img || '') ? origin + '/' + img : '';

export async function onRequestGet({ request, env }) {
    const origin = new URL(request.url).origin;
    const now = encodeURIComponent(new Date().toISOString());
    let rows = await supabaseGet(env, 'news?select=id,title,subtitle,author,coauthors,category,date,updated_at,image,division&status=eq.publicada&date=lte.' + now + '&order=date.desc&limit=40', 4000);
    if (!Array.isArray(rows)) rows = await supabaseGet(env, 'news?select=id,title,subtitle,author,category,date,updated_at,image&status=eq.publicada&date=lte.' + now + '&order=date.desc&limit=40', 4000);
    const news = Array.isArray(rows) ? rows : [];
    const items = news.map(n => {
        const link = origin + '/pages/noticia?id=' + encodeURIComponent(n.id);
        const img = imageUrl(n.image, origin);
        const by = [n.author].concat(Array.isArray(n.coauthors) ? n.coauthors : []).filter(Boolean).join(', ');
        return '<item><title>' + esc(n.title) + '</title><link>' + esc(link) + '</link><guid isPermaLink="true">' + esc(link) + '</guid>' +
            '<pubDate>' + rfc822(n.date) + '</pubDate>' + (by ? '<dc:creator>' + esc(by) + '</dc:creator>' : '') +
            '<category>' + esc((n.division === 'educa' ? 'JB Educa: ' : '') + (CATEGORY[n.category] || n.category)) + '</category>' +
            '<description>' + esc(clip(n.subtitle, 400)) + '</description>' +
            (img ? '<media:content url="' + esc(img) + '" medium="image"/>' : '') + '</item>';
    }).join('\n');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">\n<channel>\n' +
        '<title>' + esc(SITE) + '</title><link>' + esc(origin + '/') + '</link>' +
        '<atom:link href="' + esc(origin + '/rss.xml') + '" rel="self" type="application/rss+xml"/>' +
        '<description>Notícias, reportagens, análises, checagens e o JB Educa.</description><language>pt-br</language>' +
        '<lastBuildDate>' + rfc822(news[0] ? (news[0].updated_at || news[0].date) : Date.now()) + '</lastBuildDate><ttl>15</ttl>' +
        '<image><url>' + esc(origin + '/assets/favicon/android-chrome-192x192.png') + '</url><title>' + esc(SITE) + '</title><link>' + esc(origin + '/') + '</link></image>\n' +
        items + '\n</channel>\n</rss>\n';
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': rows ? 'public, max-age=900' : 'no-store' } });
}
