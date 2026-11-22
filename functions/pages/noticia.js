/* =========================================================
   Cloudflare Pages Function — prévia da matéria ao compartilhar (WhatsApp, X, Facebook, LinkedIn,
   Telegram) e dados para buscadores.

   A matéria é montada no navegador (assets/js/article.js), mas quem gera a prévia de um link não
   roda JavaScript: sem isto, todo link de matéria mostrava o mesmo título genérico. Aqui, quando
   alguém pede /pages/noticia?id=<id>, o Cloudflare busca a matéria no Supabase (só matérias
   PUBLICADAS: a chave é a pública e o RLS do banco vale igual) e coloca no <head> do HTML estático
   título, resumo, imagem (Open Graph / Twitter) e um JSON-LD NewsArticle. O resto da página não
   muda. Se o Supabase demorar (> 2 s) ou falhar, a página sai com as tags genéricas do site, sem
   atraso para o leitor. Peças comuns em functions/_lib/seo.js.

   Só roda no Cloudflare Pages (pasta functions/). Abrindo os arquivos direto (file://) ou num
   servidor estático comum, nada disto acontece e o site funciona igual.
   ========================================================= */
import { SITE, clip, meta, jsonLD, isHTML, supabaseGet, organization, previewTags, defaultImage, withSiteTags } from '../_lib/seo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = { politica: 'Política', economia: 'Economia', esportes: 'Esportes', investigacao: 'Investigação Especial', tecnologia: 'Tecnologia & Ciência', infraestrutura: 'Infraestrutura', brasil: 'Brasil', mundo: 'Mundo', educacao: 'Educação', saude: 'Saúde', meioambiente: 'Meio Ambiente', cultura: 'Cultura' };
// Imagens locais em formato que as redes aceitam (SVG não serve para prévia)
const FALLBACK_IMG = { investigacao: 'assets/img/obras-publicas.jpg', tecnologia: 'assets/img/seguranca-digital.jpg', infraestrutura: 'assets/img/ferrovia.webp' };
const OPINION = ['opiniao', 'analise', 'editorial'];
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

async function fetchNews(id, env) {
    const rows = await supabaseGet(env, 'news?select=id,title,subtitle,image,category,author,date,updated_at,kind' +
        '&id=eq.' + encodeURIComponent(id) + '&status=eq.publicada&date=lte.' + encodeURIComponent(new Date().toISOString()) + '&limit=1');
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function imageOf(n, origin) {
    const img = String(n.image || '');
    const type = s => MIME[(String(s).split('?')[0].match(/\.(\w+)$/) || [])[1]?.toLowerCase()];
    if (/^https:\/\/[^\s"'<>\\]+$/i.test(img)) return { url: img, type: type(img) };
    if (/^assets\/img\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(img)) return { url: origin + '/' + img, type: type(img) };
    if (FALLBACK_IMG[n.category]) return { url: origin + '/' + FALLBACK_IMG[n.category], type: type(FALLBACK_IMG[n.category]) };
    return defaultImage(origin);
}

function headHTML(n, url) {
    const origin = url.origin;
    const canonical = origin + '/pages/noticia?id=' + encodeURIComponent(n.id);
    const title = clip(n.title, 200), desc = clip(n.subtitle, 300), image = imageOf(n, origin);
    const section = CATEGORIES[n.category] || '';
    const ld = {
        '@context': 'https://schema.org', '@type': OPINION.includes(n.kind) ? 'OpinionNewsArticle' : 'NewsArticle',
        headline: clip(n.title, 110), description: desc, image: [image.url], datePublished: n.date, dateModified: n.updated_at || n.date,
        articleSection: section || undefined, inLanguage: 'pt-BR', mainEntityOfPage: canonical,
        author: [{ '@type': /^Reda|JB$/.test(n.author || '') ? 'Organization' : 'Person', name: n.author || 'Redação JB' }],
        publisher: organization(origin)
    };
    return '\n' + meta('name', 'description', desc) +
        previewTags({
            url: canonical, title, description: desc, image, type: 'article',
            extra: meta('property', 'article:published_time', n.date) + meta('property', 'article:modified_time', n.updated_at || '') +
                meta('property', 'article:section', section) + meta('property', 'article:author', n.author)
        }) + jsonLD(ld);
}

export async function onRequestGet(context) {
    const { request, env, next } = context;
    const res = await next();
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    if (!isHTML(res)) return res;
    const n = UUID.test(id) ? await fetchNews(id, env || {}) : null;
    // Sem matéria (id inválido, não publicada, Supabase fora): tags genéricas do site
    if (!n) return withSiteTags(res, request);
    const head = headHTML(n, url);
    const out = new HTMLRewriter()
        .on('title', { element(el) { el.setInnerContent(clip(n.title, 200) + ' — ' + SITE); } })
        .on('meta[name="description"]', { element(el) { el.remove(); } })   // a da matéria entra no lugar
        .on('head', { element(el) { el.append(head, { html: true }); } })
        .transform(res);
    // A página muda conforme a matéria (e a cada deploy): o navegador sempre confere com o servidor
    const h = new Headers(out.headers);
    h.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers: h });
}
