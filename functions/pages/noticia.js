/* =========================================================
   Cloudflare Pages Function — prévia da matéria ao compartilhar (WhatsApp, X, Facebook, LinkedIn,
   Telegram) e dados para buscadores.

   A matéria é montada no navegador (assets/js/article.js), mas quem gera a prévia de um link não
   roda JavaScript: sem isto, todo link de matéria mostrava o mesmo título genérico. Aqui, quando
   alguém pede /pages/noticia?id=<id>, o Cloudflare busca a matéria no Supabase (só matérias
   PUBLICADAS: a chave é a pública e o RLS do banco vale igual) e coloca no <head> do HTML estático
   título, resumo, imagem (Open Graph / Twitter) e um JSON-LD NewsArticle. O resto da página não
   muda. Se o Supabase demorar (> 2 s) ou falhar, a página sai como sempre, sem atraso para o leitor.

   Só roda no Cloudflare Pages (pasta functions/). Abrindo os arquivos direto (file://) ou num
   servidor estático comum, nada disto acontece e o site funciona igual.
   ========================================================= */

// Os mesmos valores PÚBLICOS de assets/js/config.js (podem ser trocados pelas variáveis de ambiente
// SUPABASE_URL / SUPABASE_ANON_KEY do projeto no Cloudflare). Nunca a chave service_role.
const DEFAULT_SUPABASE_URL = 'https://cjzinwnyzcsxtwmgbcpo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-FcYDCNnccpWU5FWIFiKkA_6Da70Hbn';

const SITE = 'Jornal Brasileiro (JB)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = { politica: 'Política', economia: 'Economia', esportes: 'Esportes', investigacao: 'Investigação Especial', tecnologia: 'Tecnologia & Ciência', infraestrutura: 'Infraestrutura', brasil: 'Brasil', mundo: 'Mundo', educacao: 'Educação', saude: 'Saúde', meioambiente: 'Meio Ambiente', cultura: 'Cultura' };
// Imagens locais em formato que as redes aceitam (SVG não serve para prévia)
const FALLBACK_IMG = { investigacao: 'assets/img/obras-publicas.jpg', tecnologia: 'assets/img/seguranca-digital.jpg', infraestrutura: 'assets/img/ferrovia.webp' };
const DEFAULT_IMG = 'assets/img/og-default.png';
const OPINION = ['opiniao', 'analise', 'editorial'];

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

async function fetchNews(id, env) {
    const base = String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
    const key = env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
    const q = base + '/rest/v1/news?select=id,title,subtitle,image,category,author,date,updated_at,kind' +
        '&id=eq.' + encodeURIComponent(id) + '&status=eq.publicada&date=lte.' + encodeURIComponent(new Date().toISOString()) + '&limit=1';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    try {
        const r = await fetch(q, { headers: { apikey: key, Accept: 'application/json' }, signal: ctrl.signal, cf: { cacheTtl: 60, cacheEverything: true } });
        if (!r.ok) return null;
        const rows = await r.json();
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } finally { clearTimeout(t); }
}

function imageOf(n, origin) {
    const img = String(n.image || '');
    if (/^https:\/\/[^\s"'<>\\]+$/i.test(img)) return img;
    if (/^assets\/img\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(img)) return origin + '/' + img;
    return origin + '/' + (FALLBACK_IMG[n.category] || DEFAULT_IMG);
}

function headHTML(n, url) {
    const origin = url.origin;
    const canonical = origin + '/pages/noticia?id=' + encodeURIComponent(n.id);
    const title = clip(n.title, 200), desc = clip(n.subtitle, 300), image = imageOf(n, origin);
    const section = CATEGORIES[n.category] || '';
    const meta = (attr, k, v) => v ? '<meta ' + attr + '="' + esc(k) + '" content="' + esc(v) + '">\n' : '';
    const ld = {
        '@context': 'https://schema.org', '@type': OPINION.includes(n.kind) ? 'OpinionNewsArticle' : 'NewsArticle',
        headline: clip(n.title, 110), description: desc, image: [image], datePublished: n.date, dateModified: n.updated_at || n.date,
        articleSection: section || undefined, mainEntityOfPage: canonical,
        author: [{ '@type': /^Reda|JB$/.test(n.author || '') ? 'Organization' : 'Person', name: n.author || 'Redação JB' }],
        publisher: { '@type': 'Organization', name: SITE, logo: { '@type': 'ImageObject', url: origin + '/assets/favicon/android-chrome-512x512.png' } }
    };
    // JSON dentro de <script>: "<" vira < para o texto nunca fechar a tag
    const json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '\n<link rel="canonical" href="' + esc(canonical) + '">\n' +
        meta('name', 'description', desc) +
        meta('property', 'og:type', 'article') + meta('property', 'og:site_name', SITE) + meta('property', 'og:locale', 'pt_BR') +
        meta('property', 'og:title', title) + meta('property', 'og:description', desc) + meta('property', 'og:url', canonical) +
        meta('property', 'og:image', image) + meta('property', 'og:image:alt', title) +
        meta('property', 'article:published_time', n.date) + meta('property', 'article:modified_time', n.updated_at || '') +
        meta('property', 'article:section', section) + meta('property', 'article:author', n.author) +
        meta('name', 'twitter:card', 'summary_large_image') + meta('name', 'twitter:title', title) + meta('name', 'twitter:description', desc) + meta('name', 'twitter:image', image) +
        '<script type="application/ld+json">' + json + '</script>\n';
}

export async function onRequestGet(context) {
    const { request, env, next } = context;
    const res = await next();
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    if (res.status !== 200 || !/text\/html/i.test(res.headers.get('content-type') || '') || !UUID.test(id)) return res;
    let n = null;
    try { n = await fetchNews(id, env || {}); } catch (e) { n = null; }
    if (!n) return res;
    const head = headHTML(n, url);
    const out = new HTMLRewriter()
        .on('title', { element(el) { el.setInnerContent(clip(n.title, 200) + ' — ' + SITE); } })
        .on('head', { element(el) { el.append(head, { html: true }); } })
        .transform(res);
    // A página muda conforme a matéria: cache curto no navegador e na borda
    const h = new Headers(out.headers);
    h.set('Cache-Control', 'public, max-age=60');
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers: h });
}
