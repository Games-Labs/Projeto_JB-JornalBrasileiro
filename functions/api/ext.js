/* =========================================================
   Cloudflare Pages Function: /api/ext — ponte com cache para os serviços externos.

   O navegador do leitor chama só o JB; esta Function consulta o serviço e guarda a resposta no
   cache da Cloudflare pelo tempo de TTL. Vantagens: o IP do leitor não chega ao serviço, milhares
   de leitores reaproveitam a mesma consulta (não estoura limite de uso) e a CSP do site continua
   com connect-src 'self'. Só os endereços abaixo são aceitos (nada de proxy aberto).

   ?src=weather&lat=&lon=     Open-Meteo, previsão (15 min)
   ?src=capitals              Open-Meteo, tempo agora nas 12 maiores capitais, numa consulta só (15 min)
   ?src=geocode&q=            Open-Meteo, busca de cidades (1 dia)
   ?src=cep&cep=              ViaCEP (7 dias)
   ?src=rates                 AwesomeAPI, câmbio e criptomoedas (5 min)
   ?src=football&league=&when=past|next   TheSportsDB, jogos (10 min)
   ?src=table&league=&season= TheSportsDB, classificação (1 h)
   ?src=league&league=        TheSportsDB, dados da competição (1 dia)
   ?src=history&day=MM-DD     Wikipédia, "Neste dia" (12 h)

   Variável opcional: THESPORTSDB_KEY (chave paga da TheSportsDB; sem ela usa a chave pública de
   teste "123", que devolve uma amostra reduzida). A mesma lista de fontes, no navegador, está em
   assets/js/storage.js (extDirect), usada quando o site é aberto sem as Functions.
   ========================================================= */
const TTL = { weather: 900, capitals: 900, geocode: 86400, cep: 604800, rates: 300, football: 600, table: 3600, league: 86400, history: 43200 };
const LEAGUES = ['4351', '4404', '4725', '4501', '4724'];
// Mesma ordem de Ext.CAPITALS em assets/js/storage.js
const CAPITALS = [[-23.55,-46.63],[-22.91,-43.17],[-15.78,-47.93],[-12.97,-38.5],[-3.72,-38.54],[-19.92,-43.94],[-3.12,-60.02],[-25.43,-49.27],[-8.05,-34.88],[-30.03,-51.23],[-1.46,-48.49],[-16.69,-49.25]];
const RATE_PAIRS = ['USD-BRL', 'EUR-BRL', 'GBP-BRL', 'ARS-BRL', 'JPY-BRL', 'CNY-BRL', 'CAD-BRL', 'CHF-BRL', 'BTC-BRL', 'ETH-BRL', 'LTC-BRL', 'XRP-BRL', 'DOGE-BRL'];
const UA = 'JornalBrasileiro/1.0 (projeto academico; site jornalbrasileiro.pages.dev)';

function target(src, p, env) {
    const num = (v, lo, hi) => { if (v === undefined || String(v).trim() === '') return null; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null; };
    if (src === 'weather') {
        const lat = num(p.lat, -90, 90), lon = num(p.lon, -180, 180);
        return lat === null || lon === null ? '' : 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=6';
    }
    if (src === 'capitals') return 'https://api.open-meteo.com/v1/forecast?latitude=' + CAPITALS.map(c => c[0]).join(',') + '&longitude=' + CAPITALS.map(c => c[1]).join(',') +
        '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto';
    if (src === 'geocode') { const q = String(p.q || '').trim().slice(0, 60); return q.length < 2 ? '' : 'https://geocoding-api.open-meteo.com/v1/search?count=8&language=pt&format=json&name=' + encodeURIComponent(q); }
    if (src === 'cep') { const c = String(p.cep || '').replace(/\D/g, ''); return c.length === 8 ? 'https://viacep.com.br/ws/' + c + '/json/' : ''; }
    if (src === 'rates') return 'https://economia.awesomeapi.com.br/json/last/' + RATE_PAIRS.join(',');
    if (src === 'football' || src === 'table' || src === 'league') {
        const id = String(p.league || '');
        if (!LEAGUES.includes(id)) return '';
        const key = /^[A-Za-z0-9]{1,40}$/.test((env && env.THESPORTSDB_KEY) || '') ? env.THESPORTSDB_KEY : '123';
        const base = 'https://www.thesportsdb.com/api/v1/json/' + key + '/';
        if (src === 'table') { const s = String(p.season || new Date().getFullYear()).replace(/[^0-9-]/g, '').slice(0, 9); return s ? base + 'lookuptable.php?l=' + id + '&s=' + s : ''; }
        if (src === 'league') return base + 'lookupleague.php?id=' + id;
        return base + (p.when === 'next' ? 'eventsnextleague.php' : 'eventspastleague.php') + '?id=' + id;
    }
    if (src === 'history') {
        const m = /^(\d{2})-(\d{2})$/.exec(String(p.day || ''));
        return m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? 'https://pt.wikipedia.org/api/rest_v1/feed/onthisday/events/' + m[1] + '/' + m[2] : '';
    }
    return '';
}

const json = (obj, status, cache) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache || 'no-store' } });

export async function onRequestGet({ request, env, waitUntil }) {
    const url = new URL(request.url);
    const p = Object.fromEntries(url.searchParams);
    const src = String(p.src || '');
    const up = target(src, p, env);
    if (!up) return json({ error: 'pedido inválido' }, 400);
    // Chave do cache: o endereço do serviço (pedidos iguais de leitores diferentes caem no mesmo item)
    const cacheKey = new Request(url.origin + '/__jb_ext_cache/' + encodeURIComponent(up.replace(/\/json\/[^/]+\//, '/json/k/')));
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let body;
    try {
        const r = await fetch(up, { headers: { Accept: 'application/json', 'User-Agent': UA, 'Api-User-Agent': UA }, signal: ctrl.signal });
        if (!r.ok) return json({ error: 'o serviço respondeu ' + r.status }, 502);
        body = await r.text();
        if (body.length > 1500000) return json({ error: 'resposta grande demais' }, 502);
        if (!body.trim()) body = '{}';   // TheSportsDB responde vazio quando não há dados (ex.: tabela de copa)
        JSON.parse(body);
    } catch (e) {
        return json({ error: 'serviço indisponível' }, 502);
    } finally { clearTimeout(timer); }
    const ttl = TTL[src] || 600;
    const res = new Response(body, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=' + ttl,
            'X-JB-Fetched': new Date().toUTCString(),
            'X-Content-Type-Options': 'nosniff'
        }
    });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
}
