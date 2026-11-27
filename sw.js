/* =========================================================
   Service worker do JB (PWA): instalar o site como app e ler offline o que já foi aberto.

   Estratégia "rede primeiro": com internet, TUDO vem da rede como sempre (nunca serve JavaScript
   ou página velha depois de um deploy); a cópia guardada só é usada quando a rede falha.
   - Páginas e arquivos do próprio site: guardados a cada visita (limite de PAGES_MAX).
   - Dados: só a lista PÚBLICA de matérias e de autores do Supabase, e só em pedidos sem login
     (a chave pública no lugar do token da conta). Nada de conta, perfil, rascunho ou painel fica
     guardado no aparelho. Comentários, favoritos e o resto exigem conexão.
   - Sem rede e sem cópia: pages/offline.html.
   Registrado por assets/js/layout.js (não roda em file://). Para desativar: apagar este arquivo e
   o registro no layout.js; o navegador remove o worker antigo na próxima visita.
   ========================================================= */
const VERSION = 'v1';
const PAGES = 'jb-pages-' + VERSION, DATA = 'jb-data-' + VERSION;
const PAGES_MAX = 150, DATA_MAX = 20;
const OFFLINE = 'pages/offline.html';
const PRECACHE = ['./', OFFLINE,
    'assets/vendor/bootstrap/bootstrap.min.css', 'assets/css/style.css', 'assets/css/motion.css',
    'assets/vendor/bootstrap/bootstrap.bundle.min.js', 'assets/vendor/supabase/supabase.js',
    'assets/js/config.js', 'assets/js/storage.js', 'assets/js/supabase-backend.js', 'assets/js/layout.js', 'assets/js/motion.js',
    'assets/js/home.js', 'assets/js/services.js', 'assets/js/news-list.js', 'assets/js/article.js',
    'assets/fonts/source-serif-4-latin.woff2', 'assets/fonts/source-serif-4-italic-latin.woff2', 'assets/fonts/inter-latin.woff2',
    'assets/favicon/favicon-32x32.png'];

// Resposta que passou por redirecionamento (ex.: .html -> endereço curto no Cloudflare) não pode
// ser entregue a uma navegação: guarda uma cópia "limpa".
const clean = res => res.redirected ? res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers })) : Promise.resolve(res);
const storable = res => res && res.ok && (res.type === 'basic' || res.type === 'cors') && !/no-store/i.test(res.headers.get('Cache-Control') || '');
// Endereços com dados de login (retorno do Google, link de recuperação, erros do Auth) nunca vão para o cache
const SENSITIVE = /[?&](code|token|token_hash|access_token|refresh_token|type|error|error_code|error_description)=/i;

// Guarda `path` (e o endereço final, se redirecionou). Páginas .html também são tentadas sem a
// extensão: no Cloudflare o .html redireciona para o endereço curto.
function precache(cache, path) {
    const url = new URL(path, self.registration.scope).href;
    const tries = [url].concat(/\.html$/.test(url) ? [url.replace(/\.html$/, '')] : []);
    const attempt = i => i >= tries.length ? Promise.resolve() : fetch(tries[i], { cache: 'no-cache' }).then(res => {
        if (!storable(res)) return attempt(i + 1);
        const final = res.url;
        return clean(res).then(r => Promise.all([cache.put(url, r.clone()), final && final !== url ? cache.put(final, r.clone()) : null]));
    }, () => attempt(i + 1));
    return attempt(0).catch(() => { });   // um arquivo que falhar não impede a instalação
}

self.addEventListener('install', event => {
    event.waitUntil(caches.open(PAGES).then(cache => Promise.all(PRECACHE.map(path => precache(cache, path)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('jb-') && k !== PAGES && k !== DATA).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

async function trim(cache, max) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Pedido de dados públicos? (Supabase REST, tabelas news/authors, sem token de conta)
function publicData(req, url) {
    if (!/\.supabase\.co$/i.test(url.hostname) || !/^\/rest\/v1\/(news|authors)$/.test(url.pathname)) return false;
    const auth = req.headers.get('Authorization'), key = req.headers.get('apikey');
    return !auth || (!!key && auth === 'Bearer ' + key);
}

// Endereços equivalentes para procurar a cópia: com e sem ".html", e a capa como "/"
function alternatives(url) {
    const u = new URL(url), out = [];
    if (/\/index\.html$/.test(u.pathname)) { u.pathname = u.pathname.replace(/index\.html$/, ''); out.push(u.href); }
    else if (/\.html$/.test(u.pathname)) { u.pathname = u.pathname.replace(/\.html$/, ''); out.push(u.href); }
    return out;
}

// Scripts, estilos e manifest do site: sempre conferidos com o servidor, mesmo que o navegador
// tenha uma cópia "ainda válida" no cache HTTP (senão o HTML novo chegava com o JS/CSS velho)
const REVALIDATE = ['script', 'style', 'manifest'];

async function networkFirst(event, cacheName, max, isNav) {
    const req = event.request;
    const cache = await caches.open(cacheName);
    try {
        const own = new URL(req.url).origin === self.location.origin;
        const res = await fetch(own && REVALIDATE.includes(req.destination) ? new Request(req, { cache: 'no-cache' }) : req);
        if (storable(res) && !SENSITIVE.test(req.url)) event.waitUntil(clean(res.clone()).then(r => cache.put(req, r)).then(() => trim(cache, max)).catch(() => { }));
        return res;
    } catch (err) {
        const opts = { ignoreVary: true };
        let hit = await cache.match(req, opts);
        if (!hit && isNav) {
            for (const alt of alternatives(req.url)) { hit = await cache.match(alt, opts); if (hit) break; }
            // Matéria ainda não aberta: a página é a mesma para todas (os dados vêm do cache de dados)
            if (!hit) hit = await cache.match(req, { ignoreVary: true, ignoreSearch: true });
            if (!hit) for (const alt of alternatives(req.url)) { hit = await cache.match(alt, { ignoreVary: true, ignoreSearch: true }); if (hit) break; }
            if (!hit) hit = await cache.match(new URL(OFFLINE, self.registration.scope).href, opts);
        }
        if (hit) return hit;
        throw err;
    }
}

/* ---------- Notificações push (site fechado) ----------
   Enviadas pela Function /api/push quando uma matéria seguida é atualizada, a cobertura ao vivo
   ganha uma atualização ou (administradores) há um alerta de segurança. O endereço é sempre uma
   página do próprio site. */
self.addEventListener('push', event => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
    const url = /^pages\/[a-z0-9-]+\.html(\?[A-Za-z0-9=&%._-]*)?$/.test(String(d.url || '')) ? d.url : '';
    event.waitUntil(self.registration.showNotification(String(d.title || 'Jornal Brasileiro').slice(0, 200), {
        body: String(d.body || '').slice(0, 300),
        icon: new URL('assets/favicon/android-chrome-192x192.png', self.registration.scope).href,
        badge: new URL('assets/favicon/favicon-32x32.png', self.registration.scope).href,
        tag: String(d.tag || 'jb').slice(0, 80),
        renotify: !!d.tag,
        lang: 'pt-BR',
        data: { url: new URL(url || './', self.registration.scope).href }
    }));
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const c of list) if (c.url === target && 'focus' in c) return c.focus();
        return self.clients.openWindow ? self.clients.openWindow(target) : null;
    }));
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET' || req.headers.has('Range')) return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        if (url.pathname.endsWith('/sw.js')) return;
        // Functions de dados (tempo, cotações, push): o próprio site guarda a última cópia (JB.Ext)
        if (/\/api\//.test(url.pathname)) return;
        event.respondWith(networkFirst(event, PAGES, PAGES_MAX, req.mode === 'navigate'));
    } else if (publicData(req, url)) {
        event.respondWith(networkFirst(event, DATA, DATA_MAX, false));
    }
});
