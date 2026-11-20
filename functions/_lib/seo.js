/* =========================================================
   Peças comuns de SEO das Cloudflare Pages Functions (não é uma rota: não exporta onRequest).

   Quem gera a prévia de um link (WhatsApp, Facebook, X, LinkedIn, Telegram) e os buscadores leem o
   HTML sem rodar JavaScript. As Functions completam o <head> de cada página com canonical, Open
   Graph, Twitter Card e JSON-LD, usando o endereço real do site (o HTML estático só tem caminhos
   relativos, que essas ferramentas não aceitam). Fora do Cloudflare (file://, servidor comum) nada
   disto roda e o site funciona igual.
   ========================================================= */

// Os mesmos valores PÚBLICOS de assets/js/config.js (podem ser trocados pelas variáveis de ambiente
// SUPABASE_URL / SUPABASE_ANON_KEY do projeto no Cloudflare). Nunca a chave service_role.
const DEFAULT_SUPABASE_URL = 'https://cjzinwnyzcsxtwmgbcpo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-FcYDCNnccpWU5FWIFiKkA_6Da70Hbn';

export const SITE = 'Jornal Brasileiro (JB)';
export const DEFAULT_IMG = { path: 'assets/img/og-default.png', width: 1200, height: 630, type: 'image/png' };
// Perfis oficiais (os mesmos do rodapé, em assets/js/layout.js)
export const SOCIAL = ['https://www.instagram.com/jornalbrasileiro_ofc', 'https://www.tiktok.com/@jornalbrasileiro_ofc', 'https://youtube.com/@JornalBrasileiro_OFC'];

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
export const meta = (attr, k, v) => v ? '<meta ' + attr + '="' + esc(k) + '" content="' + esc(v) + '">\n' : '';
// JSON dentro de <script>: "<" vira < para o texto nunca fechar a tag
export const jsonLD = obj => '<script type="application/ld+json">' +
    JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '</script>\n';

export const isHTML = res => res.status === 200 && /text\/html/i.test(res.headers.get('content-type') || '');

// Consulta a API pública do Supabase (RLS vale igual: só matérias publicadas). null se falhar ou demorar.
export async function supabaseGet(env, pathAndQuery, ms) {
    const base = String((env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
    const key = (env && env.SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_KEY;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 2000);
    try {
        const r = await fetch(base + '/rest/v1/' + pathAndQuery, { headers: { apikey: key, Accept: 'application/json' }, signal: ctrl.signal, cf: { cacheTtl: 60, cacheEverything: true } });
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; } finally { clearTimeout(t); }
}

export function organization(origin) {
    return {
        '@type': 'NewsMediaOrganization', '@id': origin + '/#organizacao', name: SITE, url: origin + '/',
        logo: { '@type': 'ImageObject', url: origin + '/assets/favicon/android-chrome-512x512.png', width: 512, height: 512 },
        sameAs: SOCIAL
    };
}

// Tags de prévia. o = { url, title, description, image: {url, width?, height?, type?, alt?}, type: 'website'|'article', extra }
export function previewTags(o) {
    const img = o.image || {};
    return '<link rel="canonical" href="' + esc(o.url) + '">\n' +
        meta('property', 'og:type', o.type || 'website') + meta('property', 'og:site_name', SITE) + meta('property', 'og:locale', 'pt_BR') +
        meta('property', 'og:title', o.title) + meta('property', 'og:description', o.description) + meta('property', 'og:url', o.url) +
        meta('property', 'og:image', img.url) + meta('property', 'og:image:type', img.type) +
        meta('property', 'og:image:width', img.width && String(img.width)) + meta('property', 'og:image:height', img.height && String(img.height)) +
        meta('property', 'og:image:alt', img.alt || o.title) +
        (o.extra || '') +
        meta('name', 'twitter:card', 'summary_large_image') + meta('name', 'twitter:title', o.title) +
        meta('name', 'twitter:description', o.description) + meta('name', 'twitter:image', img.url);
}

export const defaultImage = origin => Object.assign({ url: origin + '/' + DEFAULT_IMG.path }, DEFAULT_IMG);

// Endereço canônico: sem ".html" (o Cloudflare redireciona para a forma curta) e só com ?id=
export function canonicalUrl(url) {
    let p = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    const id = url.searchParams.get('id');
    return url.origin + p + (id ? '?id=' + encodeURIComponent(id) : '');
}

/* Páginas comuns: lê o <title> e a <meta name="description"> do próprio HTML e acrescenta, no fim do
   <head>, as tags de prévia com a imagem padrão. Páginas marcadas com robots=noindex (conta, painel)
   ganham só o canonical. Na capa entra também o JSON-LD do site e da organização. */
export function withSiteTags(res, request, opts) {
    if (!isHTML(res)) return res;
    const url = new URL(request.url);
    const st = { title: '', desc: '', noindex: false };
    const home = url.pathname === '/' || url.pathname === '/index.html';
    const out = new HTMLRewriter()
        .on('title', { text(t) { st.title += t.text; } })
        .on('meta[name="description"]', { element(el) { st.desc = el.getAttribute('content') || ''; } })
        .on('meta[name="robots"]', { element(el) { st.noindex = /noindex/i.test(el.getAttribute('content') || ''); } })
        .on('head', {
            element(el) {
                el.onEndTag(end => {
                    const canonical = canonicalUrl(url);
                    if (st.noindex) { end.before('<link rel="canonical" href="' + esc(canonical) + '">\n', { html: true }); return; }
                    const title = clip(st.title.replace(/\s+[—-]\s+Jornal Brasileiro \(JB\)\s*$/, ''), 200) || SITE;
                    let html = '\n' + previewTags({ url: canonical, title, description: clip(st.desc, 300), image: defaultImage(url.origin), type: 'website' });
                    if (home) html += jsonLD({
                        '@context': 'https://schema.org',
                        '@graph': [organization(url.origin), { '@type': 'WebSite', '@id': url.origin + '/#site', name: SITE, url: url.origin + '/', inLanguage: 'pt-BR', publisher: { '@id': url.origin + '/#organizacao' } }]
                    });
                    end.before(html, { html: true });
                });
            }
        })
        .transform(res);
    return out;
}
