/* =========================================================
   Serviços com dados de fontes externas, sempre com cache (JB.Ext em storage.js + /api/ext na Cloudflare):
     Previsão do tempo  Open-Meteo (open-meteo.com), cidade pelo CEP (ViaCEP), pela busca ou pela
                        localização aproximada da conexão (só com o consentimento "Localização aproximada")
     Cotações           AwesomeAPI (economia.awesomeapi.com.br): moedas e criptomoedas contra o real
     Futebol            TheSportsDB: jogos, resultados, classificação e competições
     Hoje na História   Wikipédia em português ("Neste dia")
   Usado pela capa (widgets) e pelas páginas tempo.html, cotacoes.html, futebol.html e
   hoje-na-historia.html, escolhidas por <body data-page>. Tudo que vem de fora é escapado; imagens
   de terceiros (escudos, fotos da Wikipédia) só com o consentimento "Conteúdo de terceiros".
   ========================================================= */
(function () {
    'use strict';
    const { Ext, Cookies, util } = JB;
    const { esc } = util;
    const page = document.body.dataset.page || '';
    const R = util.root();
    const $ = id => document.getElementById(id);
    const TZ = 'America/Sao_Paulo';
    const fmtTime = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
    const fmtDay = ms => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
    const updated = (res, source) => '<p class="svc-updated">' + (res.stale ? '<strong>Sem conexão agora:</strong> mostrando a última cópia, de ' : 'Atualizado às ') +
        esc(fmtTime(res.at)) + (res.stale || fmtDay(res.at) !== fmtDay(Date.now()) ? ' de ' + esc(fmtDay(res.at)) : '') + ' · Fonte: ' + source + '</p>';
    const failBox = what => '<div class="alert alert-warning small mb-0" role="alert">Não foi possível carregar ' + esc(what) + ' agora. <button type="button" class="btn btn-sm btn-outline-dark ms-1" data-jb-reload>Tentar de novo</button></div>';
    const thirdParty = () => Cookies.allows('external');
    const num = (v, d) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

    /* =====================================================================
       Previsão do tempo
       ===================================================================== */
    // Códigos WMO do Open-Meteo
    const WMO = {
        0: ['Céu limpo', 'sol'], 1: ['Poucas nuvens', 'solnuvem'], 2: ['Parcialmente nublado', 'solnuvem'], 3: ['Nublado', 'nuvem'],
        45: ['Nevoeiro', 'neblina'], 48: ['Nevoeiro com geada', 'neblina'], 51: ['Garoa fraca', 'garoa'], 53: ['Garoa', 'garoa'], 55: ['Garoa forte', 'garoa'],
        56: ['Garoa congelante', 'garoa'], 57: ['Garoa congelante forte', 'garoa'], 61: ['Chuva fraca', 'chuva'], 63: ['Chuva', 'chuva'], 65: ['Chuva forte', 'chuva'],
        66: ['Chuva congelante', 'chuva'], 67: ['Chuva congelante forte', 'chuva'], 71: ['Neve fraca', 'neve'], 73: ['Neve', 'neve'], 75: ['Neve forte', 'neve'], 77: ['Grãos de neve', 'neve'],
        80: ['Pancadas de chuva', 'chuva'], 81: ['Pancadas de chuva', 'chuva'], 82: ['Pancadas fortes de chuva', 'chuva'], 85: ['Pancadas de neve', 'neve'], 86: ['Pancadas fortes de neve', 'neve'],
        95: ['Trovoadas', 'raio'], 96: ['Trovoadas com granizo', 'raio'], 99: ['Trovoadas com granizo forte', 'raio']
    };
    const W_ICONS = {
        sol: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
        lua: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
        solnuvem: '<circle cx="8.5" cy="8.5" r="3.5"/><path d="M8.5 2v1.3M2 8.5h1.3M3.9 3.9l.9.9M13.1 3.9l-.9.9"/><path d="M8 20h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1A3 3 0 0 0 8 20z"/>',
        nuvem: '<path d="M7 19h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 19z"/>',
        neblina: '<path d="M4 9h16M3 13h18M5 17h14"/>',
        garoa: '<path d="M7 15h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M9 18.5v1M13 18.5v1M17 18.5v1"/>',
        chuva: '<path d="M7 14h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14z"/><path d="m9 17-1 3M13 17l-1 3M17 17l-1 3"/>',
        neve: '<path d="M7 14h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M9 18h.01M13 19h.01M17 18h.01M11 21h.01M15 21h.01"/>',
        raio: '<path d="M7 13h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 13z"/><path d="m12.5 13-2 4h3l-2 4"/>'
    };
    const wmo = (code, isDay) => { const w = WMO[code] || ['Tempo indefinido', 'nuvem']; return { label: w[0], icon: isDay === 0 && w[1] === 'sol' ? 'lua' : w[1] }; };
    const wIcon = (k, cls) => '<svg class="w-ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (W_ICONS[k] || W_ICONS.nuvem) + '</svg>';
    const deg = v => Math.round(Number(v)) + '°';
    const weekday = iso => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const placeLabel = p => p.name + (p.uf || p.region ? ' (' + (p.uf || p.region) + ')' : '');

    // Cidade da previsão: a escolhida, senão a estimada pela conexão (com consentimento), senão Brasília
    async function currentPlace() {
        const chosen = Ext.place();
        if (chosen) return chosen;
        const auto = await Ext.locate();
        return auto || JB.DEFAULT_PLACE;
    }
    const placeNote = p => p.auto ? 'Cidade estimada pela sua conexão (aproximada).' : p.fallback ? (Cookies.allows('location') ? 'Não conseguimos estimar sua cidade; mostrando Brasília.' : 'Mostrando Brasília. Escolha sua cidade ou permita a localização aproximada.') : 'Cidade escolhida por você.';

    // Busca de cidade: nome (Open-Meteo) ou CEP (ViaCEP + Open-Meteo). Prefere resultados do Brasil.
    async function findPlaces(q) {
        const cep = q.replace(/\D/g, '');
        if (/^\d{5}-?\d{3}$/.test(q.trim()) && cep.length === 8) {
            const r = await Ext.get('cep', { cep });
            if (!r || !r.data || r.data.erro || !r.data.localidade) return { error: r ? 'CEP não encontrado.' : 'Não foi possível consultar o CEP agora.' };
            const g = await Ext.get('geocode', { q: r.data.localidade });
            const list = ((g && g.data && g.data.results) || []).filter(x => x.country_code === 'BR');
            const best = list.find(x => util.sameName(x.admin1, r.data.estado)) || list[0];
            return best ? { places: [{ name: best.name, region: best.admin1 || r.data.estado || '', uf: r.data.uf, lat: best.latitude, lon: best.longitude }] } : { error: 'Não achamos a cidade desse CEP na previsão.' };
        }
        if (q.trim().length < 2) return { error: 'Digite o nome da cidade ou o CEP.' };
        const g = await Ext.get('geocode', { q: q.trim() });
        if (!g) return { error: 'Não foi possível buscar agora.' };
        const all = (g.data && g.data.results) || [];
        const sorted = all.filter(x => x.country_code === 'BR').concat(all.filter(x => x.country_code !== 'BR'));
        return sorted.length ? { places: sorted.slice(0, 6).map(x => ({ name: x.name, region: [x.admin1, x.country_code !== 'BR' ? x.country : ''].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude })) } : { error: 'Nenhuma cidade encontrada.' };
    }

    function weatherHTML(res, place, full) {
        const d = res.data || {}, c = d.current || {}, daily = d.daily || {};
        const w = wmo(c.weather_code, c.is_day);
        const days = (daily.time || []).map((t, i) => ({ t, code: daily.weather_code[i], max: daily.temperature_2m_max[i], min: daily.temperature_2m_min[i], rain: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null }));
        const today = days[0];
        const forecast = days.slice(full ? 0 : 1, full ? 6 : 4).map((x, i) => {
            const f = wmo(x.code, 1);
            return '<li><span class="w-day">' + esc(full && i === 0 ? 'Hoje' : weekday(x.t)) + '</span>' + wIcon(f.icon) + '<span class="visually-hidden">' + esc(f.label) + '</span><span class="w-range"><strong>' + deg(x.max) + '</strong> ' + deg(x.min) + '</span>' +
                (x.rain !== null && x.rain !== undefined ? '<span class="w-rain" title="Chance de chuva">' + Math.round(x.rain) + '%</span>' : '') + '</li>';
        }).join('');
        return '<div class="w-now">' + wIcon(w.icon, 'w-ico-lg') + '<div><p class="w-place">' + esc(placeLabel(place)) + '</p><p class="w-temp">' + deg(c.temperature_2m) + '<span>' + esc(w.label) + '</span></p>' +
            (today ? '<p class="w-meta">Máx. ' + deg(today.max) + ' · Mín. ' + deg(today.min) + (today.rain !== null && today.rain !== undefined ? ' · Chuva ' + Math.round(today.rain) + '%' : '') + '</p>' : '') +
            (full ? '<p class="w-meta">Sensação ' + deg(c.apparent_temperature) + ' · Umidade ' + Math.round(c.relative_humidity_2m) + '% · Vento ' + Math.round(c.wind_speed_10m) + ' km/h</p>' : '') + '</div></div>' +
            '<ul class="w-forecast" aria-label="Próximos dias">' + forecast + '</ul>';
    }

    // Widget da capa: previsão + link para a página completa
    async function weatherWidget(box) {
        if (!box) return;
        box.innerHTML = util.loadingHTML('Carregando a previsão…');
        const place = await currentPlace();
        const res = await Ext.get('weather', { lat: place.lat, lon: place.lon });
        if (!res) { box.innerHTML = failBox('a previsão do tempo'); return; }
        box.innerHTML = weatherHTML(res, place, false) + '<div class="svc-foot"><a href="' + R + 'pages/tempo.html">Previsão completa e outras cidades</a>' + updated(res, '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>') + '</div>';
    }

    // Ao lado da saudação da capa: "Brasília 24° · Nublado"
    async function greetWeather(link) {
        if (!link) return;
        const place = await currentPlace();
        const res = await Ext.get('weather', { lat: place.lat, lon: place.lon });
        const c = res && res.data && res.data.current;
        if (!c || !isFinite(c.temperature_2m)) return;
        const w = wmo(c.weather_code, c.is_day);
        link.innerHTML = wIcon(w.icon) + '<span><strong>' + deg(c.temperature_2m) + '</strong> ' + esc(place.name) + '<span class="visually-hidden">, ' + esc(w.label) + '. Ver a previsão.</span></span>';
        link.title = w.label + ' em ' + placeLabel(place) + '. Ver a previsão completa.';
        link.hidden = false;
    }

    function initTempo() {
        const main = $('tempo-main'), form = $('city-form'), results = $('city-results'), msg = $('city-msg');
        async function render() {
            main.innerHTML = util.loadingHTML('Carregando a previsão…');
            const place = await currentPlace();
            const res = await Ext.get('weather', { lat: place.lat, lon: place.lon });
            if (!res) { main.innerHTML = failBox('a previsão do tempo'); return; }
            main.innerHTML = weatherHTML(res, place, true) + '<p class="small text-muted mt-2 mb-0">' + esc(placeNote(place)) + '</p>' +
                updated(res, '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (CC BY 4.0)');
            $('city-reset').hidden = !Ext.place();
        }
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const q = form.elements.q.value;
            msg.textContent = 'Procurando…'; results.innerHTML = '';
            const r = await findPlaces(q);
            if (r.error) { msg.textContent = r.error; return; }
            msg.textContent = r.places.length === 1 ? '' : 'Escolha a cidade:';
            if (r.places.length === 1) { choose(r.places[0]); return; }
            results.innerHTML = r.places.map((p, i) => '<li><button type="button" class="btn btn-sm btn-outline-dark" data-place="' + i + '">' + esc(p.name) + (p.region ? ' <small>' + esc(p.region) + '</small>' : '') + '</button></li>').join('');
            results.onclick = ev => { const b = ev.target.closest('[data-place]'); if (b) choose(r.places[Number(b.dataset.place)]); };
        });
        function choose(p) {
            Ext.setPlace(p);
            results.innerHTML = ''; form.reset();
            msg.textContent = Cookies.allows('preferences') ? 'Pronto: ' + p.name + ' fica guardada neste navegador.' : 'Mostrando ' + p.name + ' nesta visita. Para lembrar a cidade, permita “Preferências” nos cookies.';
            render();
        }
        $('city-reset').addEventListener('click', () => { Ext.clearPlace(); msg.textContent = 'Escolha apagada.'; render(); });
        $('city-locate').addEventListener('click', async () => {
            if (!Cookies.allows('location')) {
                msg.innerHTML = 'Para estimar sua cidade, permita “Localização aproximada” nas <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-open-cookies>preferências de cookies</button>. Nada é guardado no servidor.';
                return;
            }
            msg.textContent = 'Estimando sua cidade…';
            const p = await Ext.locate();
            if (!p) { msg.textContent = 'Não foi possível estimar sua cidade agora. Busque pelo nome ou pelo CEP.'; return; }
            Ext.clearPlace(); msg.textContent = 'Cidade estimada: ' + p.name + '.'; render();
        });
        document.addEventListener('jb:consent', render);
        // Capitais: uma consulta só para as 12
        const caps = $('capitals');
        Ext.get('capitals').then(res => {
            if (!res || !Array.isArray(res.data)) { caps.innerHTML = failBox('o tempo nas capitais'); return; }
            caps.innerHTML = '<ul class="capitals-grid">' + Ext.CAPITALS.map((c, i) => {
                const d = res.data[i] || {}, cur = d.current || {}, day = d.daily || {}, w = wmo(cur.weather_code, cur.is_day);
                return '<li><button type="button" class="capital" data-cap="' + i + '"><span class="capital-name">' + esc(c.name) + ' <small>' + esc(c.uf) + '</small></span>' + wIcon(w.icon) +
                    '<span class="capital-temp">' + (cur.temperature_2m !== undefined ? deg(cur.temperature_2m) : '–') + '</span><span class="capital-range">' + (day.temperature_2m_max ? deg(day.temperature_2m_max[0]) + ' / ' + deg(day.temperature_2m_min[0]) : '') + '</span>' +
                    '<span class="visually-hidden">' + esc(w.label) + '. Ver a previsão de ' + esc(c.name) + '</span></button></li>';
            }).join('') + '</ul>' + updated(res, 'Open-Meteo');
            caps.onclick = ev => { const b = ev.target.closest('[data-cap]'); if (b) { const c = Ext.CAPITALS[Number(b.dataset.cap)]; choose({ name: c.name, region: c.uf, uf: c.uf, lat: c.lat, lon: c.lon }); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
        });
        render();
    }

    /* =====================================================================
       Cotações
       ===================================================================== */
    const CURRENCY = {
        USD: ['Dólar americano', 'US$'], EUR: ['Euro', '€'], GBP: ['Libra esterlina', '£'], ARS: ['Peso argentino', 'ARS'], JPY: ['Iene japonês', '¥'], CNY: ['Yuan chinês', 'CN¥'],
        CAD: ['Dólar canadense', 'C$'], CHF: ['Franco suíço', 'CHF'], BTC: ['Bitcoin', '₿'], ETH: ['Ethereum', 'ETH'], LTC: ['Litecoin', 'LTC'], XRP: ['XRP', 'XRP'], DOGE: ['Dogecoin', 'DOGE']
    };
    const CRYPTO = ['BTC', 'ETH', 'LTC', 'XRP', 'DOGE'];
    const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number(v) < 1 ? 4 : 2, maximumFractionDigits: Number(v) < 1 ? 4 : 2 });
    const rateRows = data => Object.keys(data || {}).map(k => data[k]).filter(r => r && CURRENCY[r.code] && r.codein === 'BRL' && isFinite(Number(r.bid)));
    const change = r => { const p = Number(r.pctChange) || 0; return '<span class="rate-chg ' + (p > 0 ? 'is-up' : p < 0 ? 'is-down' : '') + '">' + (p > 0 ? '▲' : p < 0 ? '▼' : '•') + ' ' + num(Math.abs(p), 2) + '%<span class="visually-hidden">' + (p > 0 ? ' de alta' : p < 0 ? ' de queda' : '') + ' no dia</span></span>'; };
    const rateAt = rows => { const t = Math.max.apply(null, rows.map(r => Number(r.timestamp) * 1000).filter(isFinite)); return isFinite(t) && t > 0 ? t : null; };

    async function ratesWidget(box) {
        if (!box) return;
        box.innerHTML = util.loadingHTML('Carregando cotações…');
        const res = await Ext.get('rates');
        const rows = res ? rateRows(res.data) : [];
        if (!rows.length) { box.innerHTML = failBox('as cotações'); return; }
        const pick = ['USD', 'EUR', 'BTC'].map(c => rows.find(r => r.code === c)).filter(Boolean);
        const at = rateAt(rows);
        box.innerHTML = '<ul class="rates-mini">' + pick.map(r => '<li><span class="rate-name">' + esc(CURRENCY[r.code][0]) + '</span><strong>' + esc(brl(r.bid)) + '</strong>' + change(r) + '</li>').join('') + '</ul>' +
            '<div class="svc-foot"><a href="' + R + 'pages/cotacoes.html">Todas as moedas e criptomoedas</a>' + updated({ at: at || res.at, stale: res.stale }, 'AwesomeAPI') + '</div>';
    }

    function initCotacoes() {
        const box = $('rates-main'), cbox = $('crypto-main');
        let rows = [];
        function convert() {
            const f = $('conv-form'); if (!f || !rows.length) return;
            const amount = Number(String(f.elements.amount.value).replace(/\./g, '').replace(',', '.')) || 0;
            const r = rows.find(x => x.code === f.elements.cur.value); if (!r) return;
            const toBrl = f.elements.dir.value === 'to-brl';
            const v = toBrl ? amount * Number(r.bid) : amount / Number(r.bid);
            $('conv-out').textContent = toBrl ? num(amount, 2) + ' ' + CURRENCY[r.code][1] + ' = ' + brl(v)
                : brl(amount) + ' = ' + (CRYPTO.includes(r.code) ? num(v, 8) : num(v, 2)) + ' ' + CURRENCY[r.code][1];
        }
        async function render(force) {
            box.innerHTML = util.loadingHTML('Carregando cotações…'); cbox.innerHTML = '';
            const res = await Ext.get('rates', {}, { force });
            rows = res ? rateRows(res.data) : [];
            if (!rows.length) { box.innerHTML = failBox('as cotações'); return; }
            const table = list => '<div class="table-responsive"><table class="table rates-table align-middle mb-0"><thead><tr><th scope="col">Moeda</th><th scope="col" class="text-end">Compra</th><th scope="col" class="text-end">Venda</th><th scope="col" class="text-end">Variação</th><th scope="col" class="text-end d-none d-md-table-cell">Máx. / mín. do dia</th><th scope="col" class="text-end d-none d-lg-table-cell">R$ 1 compra</th></tr></thead><tbody>' +
                list.map(r => '<tr><th scope="row"><span class="rate-code">' + esc(r.code) + '</span> ' + esc(CURRENCY[r.code][0]) + '</th><td class="text-end fw-bold">' + esc(brl(r.bid)) + '</td><td class="text-end">' + esc(brl(r.ask)) + '</td><td class="text-end">' + change(r) + '</td>' +
                    '<td class="text-end d-none d-md-table-cell small">' + esc(brl(r.high)) + ' / ' + esc(brl(r.low)) + '</td><td class="text-end d-none d-lg-table-cell small">' + esc((CRYPTO.includes(r.code) ? num(1 / Number(r.bid), 8) : num(1 / Number(r.bid), 4)) + ' ' + CURRENCY[r.code][1]) + '</td></tr>').join('') + '</tbody></table></div>';
            const at = rateAt(rows);
            const fiat = rows.filter(r => !CRYPTO.includes(r.code)), crypto = rows.filter(r => CRYPTO.includes(r.code));
            box.innerHTML = table(fiat) + updated({ at: at || res.at, stale: res.stale }, '<a href="https://docs.awesomeapi.com.br/" target="_blank" rel="noopener noreferrer">AwesomeAPI</a>');
            cbox.innerHTML = crypto.length ? table(crypto) + '<p class="svc-updated">Criptomoedas oscilam muito: os valores são indicativos, não ofertas de compra ou venda.</p>' : '';
            const sel = $('conv-form').elements.cur, prev = sel.value;
            sel.innerHTML = rows.map(r => '<option value="' + esc(r.code) + '">' + esc(r.code + ' — ' + CURRENCY[r.code][0]) + '</option>').join('');
            sel.value = rows.some(r => r.code === prev) ? prev : 'USD';
            convert();
        }
        $('conv-form').addEventListener('input', convert);
        $('conv-form').addEventListener('submit', e => { e.preventDefault(); convert(); });
        $('rates-refresh').addEventListener('click', () => render(true));
        render(false);
    }

    /* =====================================================================
       Futebol (TheSportsDB)
       ===================================================================== */
    const LEAGUES = Ext.LEAGUES;
    const STATUS_PT = { FT: 'Encerrado', AET: 'Encerrado na prorrogação', PEN: 'Decidido nos pênaltis', NS: 'Não começou', HT: 'Intervalo', '1H': '1º tempo', '2H': '2º tempo', ET: 'Prorrogação', P: 'Pênaltis', PST: 'Adiado', CANC: 'Cancelado', ABD: 'Interrompido', SUSP: 'Suspenso', 'Match Finished': 'Encerrado', 'Not Started': 'Não começou' };
    const initials = name => String(name || '?').split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    const badgeImg = (src, name) => thirdParty() && /^https:\/\/(r2|www)\.thesportsdb\.com\//.test(src || '')
        ? '<img class="team-badge" src="' + esc(String(src).replace(/\/tiny$|\/small$/, '') + '/tiny') + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
        : '<span class="team-badge team-initials" aria-hidden="true">' + esc(initials(name)) + '</span>';
    // strTimestamp vem em UTC sem fuso
    const kickoff = e => { const s = e.strTimestamp || (e.dateEvent && e.strTime ? e.dateEvent + 'T' + e.strTime : e.dateEvent); if (!s) return null; const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); return isFinite(t) ? t : null; };
    const when = e => { const t = kickoff(e); return t ? new Date(t).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ }).replace('.', '') : esc(e.dateEvent || ''); };
    // Fases de mata-mata vêm como códigos (125, 150, 200); rodadas normais, como o número
    const ROUNDS = { 125: 'Quartas de final', 150: 'Semifinal', 200: 'Final' };
    const roundLabel = r => { const n = Number(r); return !n ? '' : ROUNDS[n] || (n < 100 ? 'Rodada ' + n : ''); };
    function matchHTML(e) {
        const played = e.intHomeScore !== null && e.intHomeScore !== undefined && e.intHomeScore !== '';
        const st = STATUS_PT[e.strStatus] || (played ? 'Encerrado' : '');
        return '<li class="match"><div class="match-meta"><span>' + when(e) + '</span>' + (roundLabel(e.intRound) ? '<span>' + esc(roundLabel(e.intRound)) + '</span>' : '') + (st ? '<span class="match-status">' + esc(st) + '</span>' : '') + '</div>' +
            '<div class="match-teams"><span class="match-team">' + badgeImg(e.strHomeTeamBadge, e.strHomeTeam) + '<span>' + esc(e.strHomeTeam) + '</span></span>' +
            '<span class="match-score" aria-label="' + (played ? 'Placar: ' + esc(e.intHomeScore) + ' a ' + esc(e.intAwayScore) : 'Ainda não jogado') + '">' + (played ? '<strong>' + esc(e.intHomeScore) + '</strong><span aria-hidden="true">×</span><strong>' + esc(e.intAwayScore) + '</strong>' : '<span aria-hidden="true">×</span>') + '</span>' +
            '<span class="match-team is-away"><span>' + esc(e.strAwayTeam) + '</span>' + badgeImg(e.strAwayTeamBadge, e.strAwayTeam) + '</span></div>' +
            (e.strVenue ? '<div class="match-venue">' + esc(e.strVenue) + '</div>' : '') + '</li>';
    }
    async function footballWidget(box) {
        if (!box) return;
        box.innerHTML = util.loadingHTML('Carregando jogos…');
        const [past, next] = await Promise.all([Ext.get('football', { league: '4351', when: 'past' }), Ext.get('football', { league: '4351', when: 'next' })]);
        const ev = r => (r && r.data && Array.isArray(r.data.events) ? r.data.events : []);
        const list = ev(next).slice(0, 2).concat(ev(past).slice(0, 2));
        if (!past && !next) { box.innerHTML = failBox('os jogos'); return; }
        box.innerHTML = (list.length ? '<ul class="match-list match-list-mini">' + list.map(matchHTML).join('') + '</ul>' : '<p class="small text-muted">Sem jogos da Série A no momento.</p>') +
            '<div class="svc-foot"><a href="' + R + 'pages/futebol.html">Tabela, resultados e outras competições</a>' + updated(past || next, 'TheSportsDB') + '</div>';
    }

    function initFutebol() {
        const params = new URLSearchParams(location.search);
        let league = LEAGUES[params.get('liga')] ? params.get('liga') : '4351';
        const tabs = $('league-tabs');
        tabs.innerHTML = Object.keys(LEAGUES).map(id => '<li><button type="button" class="league-tab" data-league="' + id + '" aria-pressed="' + (id === league) + '">' + esc(LEAGUES[id].short) + '</button></li>').join('');
        tabs.addEventListener('click', e => {
            const b = e.target.closest('[data-league]'); if (!b || b.dataset.league === league) return;
            league = b.dataset.league;
            tabs.querySelectorAll('[data-league]').forEach(x => x.setAttribute('aria-pressed', x.dataset.league === league));
            history.replaceState(null, '', 'futebol.html?liga=' + league);
            render();
        });
        const ev = r => (r && r.data && Array.isArray(r.data.events) ? r.data.events : []);
        async function render() {
            const L = LEAGUES[league];
            $('league-name').textContent = L.name;
            document.title = L.name + ' — Futebol — Jornal Brasileiro (JB)';
            ['fut-next', 'fut-past', 'fut-table'].forEach(id => { $(id).innerHTML = util.loadingHTML(); });
            $('fut-info').innerHTML = '';
            const info = await Ext.get('league', { league });
            const lg = info && info.data && Array.isArray(info.data.leagues) ? info.data.leagues[0] : null;
            const season = lg && /^\d{4}(-\d{4})?$/.test(lg.strCurrentSeason || '') ? lg.strCurrentSeason : String(new Date().getFullYear());
            if (lg) {
                const desc = String(lg.strDescriptionPT || '').split(/\n+/)[0].slice(0, 420);   // só em português
                $('fut-info').innerHTML = '<div class="league-info">' + (thirdParty() && /^https:\/\/r2\.thesportsdb\.com\//.test(lg.strBadge || '') ? '<img src="' + esc(lg.strBadge + '/small') + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
                    '<div><p class="mb-1"><strong>Temporada ' + esc(season) + '</strong>' + (lg.intFormedYear ? ' · disputada desde ' + esc(lg.intFormedYear) : '') + (lg.strCountry ? ' · ' + esc(lg.strCountry === 'Brazil' ? 'Brasil' : lg.strCountry === 'South America' || lg.strCountry === 'Worldwide' ? 'América do Sul' : lg.strCountry) : '') + '</p>' +
                    (desc ? '<p class="small mb-0">' + esc(desc) + (desc.length >= 420 ? '…' : '') + '</p>' : '') + '</div></div>';
            }
            const [past, next, table] = await Promise.all([Ext.get('football', { league, when: 'past' }), Ext.get('football', { league, when: 'next' }), Ext.get('table', { league, season })]);
            const list = (r, none) => !r ? failBox('os jogos') : ev(r).length ? '<ul class="match-list">' + ev(r).map(matchHTML).join('') + '</ul>' : '<p class="text-muted small">' + none + '</p>';
            $('fut-next').innerHTML = list(next, 'Nenhum jogo marcado para os próximos dias.');
            $('fut-past').innerHTML = list(past, 'Nenhum resultado recente.');
            const rows = table && table.data && Array.isArray(table.data.table) ? table.data.table : [];
            $('fut-table').innerHTML = !table ? failBox('a classificação') : !rows.length ? '<p class="text-muted small">Classificação indisponível para esta competição (copas em mata-mata não têm tabela única).</p>' :
                '<div class="table-responsive"><table class="table league-table align-middle mb-0"><caption class="visually-hidden">Classificação — ' + esc(L.name) + '</caption><thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col" class="text-end" title="Pontos">P</th><th scope="col" class="text-end" title="Jogos">J</th><th scope="col" class="text-end" title="Vitórias">V</th><th scope="col" class="text-end" title="Empates">E</th><th scope="col" class="text-end" title="Derrotas">D</th><th scope="col" class="text-end d-none d-sm-table-cell" title="Saldo de gols">SG</th><th scope="col" class="d-none d-md-table-cell">Últimos jogos</th></tr></thead><tbody>' +
                rows.map(t => '<tr><td>' + esc(t.intRank) + '</td><th scope="row"><span class="match-team">' + badgeImg(t.strBadge, t.strTeam) + '<span>' + esc(t.strTeam) + '</span></span></th><td class="text-end fw-bold">' + esc(t.intPoints) + '</td><td class="text-end">' + esc(t.intPlayed) + '</td><td class="text-end">' + esc(t.intWin) + '</td><td class="text-end">' + esc(t.intDraw) + '</td><td class="text-end">' + esc(t.intLoss) + '</td><td class="text-end d-none d-sm-table-cell">' + esc(t.intGoalDifference) + '</td>' +
                    '<td class="d-none d-md-table-cell"><span class="form-guide" aria-label="Últimos jogos: ' + esc(String(t.strForm || '').split('').map(c => c === 'W' ? 'vitória' : c === 'D' ? 'empate' : c === 'L' ? 'derrota' : c).join(', ')) + '">' +
                    String(t.strForm || '').slice(-5).split('').map(c => '<span class="fg-' + (c === 'W' ? 'v' : c === 'D' ? 'e' : 'd') + '" aria-hidden="true">' + (c === 'W' ? 'V' : c === 'D' ? 'E' : 'D') + '</span>').join('') + '</span></td></tr>').join('') + '</tbody></table></div>' +
                (rows.length <= 5 ? '<p class="svc-updated">A chave pública da TheSportsDB mostra só os primeiros colocados.</p>' : '');
            $('fut-updated').innerHTML = updated(past || next || table || { at: Date.now() }, '<a href="https://www.thesportsdb.com/" target="_blank" rel="noopener noreferrer">TheSportsDB</a>');
            // Matérias do JB sobre futebol
            JB.ready.then(() => {
                const news = JB.News.byCategory('esportes').slice(0, 3);
                $('fut-news').innerHTML = news.length ? news.map(n => '<div class="col-md-4">' + util.newsCard(n) + '</div>').join('') : '';
                $('fut-news-wrap').hidden = !news.length;
            });
        }
        document.addEventListener('jb:consent', render);
        render();
    }

    /* =====================================================================
       Hoje na História (Wikipédia)
       ===================================================================== */
    const BR_RE = /\b(Brasil|brasileir[ao]s?|Rio de Janeiro|São Paulo|Bahia|Minas Gerais|Pernambuco|Amazonas|Brasília|Império do Brasil|Dom Pedro|D\. Pedro|Getúlio|Tiradentes)\b/i;
    const todayKey = () => { const d = new Date().toLocaleDateString('en-CA', { timeZone: TZ }); return d.slice(5, 7) + '-' + d.slice(8, 10); };
    const wikiPage = e => (e.pages || []).find(p => p && p.content_urls && p.content_urls.desktop && /^https:\/\/pt\.wikipedia\.org\//.test(p.content_urls.desktop.page)) || null;
    const wikiThumb = p => p && p.thumbnail && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(p.thumbnail.source || '') ? p.thumbnail.source : '';
    function eventsOf(res) { return (res && res.data && Array.isArray(res.data.events) ? res.data.events : []).filter(e => e && e.text).sort((a, b) => b.year - a.year); }
    function eventHTML(e, withImg) {
        const p = wikiPage(e), img = withImg && thirdParty() ? wikiThumb(p) : '';
        return '<li class="hist-item"><span class="hist-year">' + esc(e.year) + '</span><div class="hist-body"><p>' + esc(e.text) + '</p>' +
            (p ? '<a class="small" href="' + esc(p.content_urls.desktop.page) + '" target="_blank" rel="noopener noreferrer">' + esc((p.titles && p.titles.normalized) || p.normalizedtitle || 'Ler na Wikipédia') + ' — Wikipédia</a>' : '') + '</div>' +
            (img ? '<img class="hist-img" src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '</li>';
    }
    const wikiCredit = res => updated(res, '<a href="https://pt.wikipedia.org/" target="_blank" rel="noopener noreferrer">Wikipédia</a>, texto sob <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>');
    async function historyWidget(box) {
        if (!box) return;
        box.innerHTML = util.loadingHTML('Carregando…');
        const res = await Ext.get('history', { day: todayKey() });
        const list = eventsOf(res);
        if (!res || !list.length) { box.innerHTML = failBox('os fatos do dia'); return; }
        const br = list.filter(e => BR_RE.test(e.text)), pick = br.slice(0, 2).concat(list.filter(e => !br.includes(e))).slice(0, 3).sort((a, b) => b.year - a.year);
        box.innerHTML = '<ol class="hist-list hist-mini">' + pick.map(e => eventHTML(e, false)).join('') + '</ol><div class="svc-foot"><a href="' + R + 'pages/hoje-na-historia.html">Mais fatos deste dia</a>' + wikiCredit(res) + '</div>';
    }
    function initHistoria() {
        const params = new URLSearchParams(location.search);
        const input = $('hist-date'), onlyBr = $('hist-br'), box = $('hist-main');
        const valid = k => /^(\d{2})-(\d{2})$/.test(k) && !isNaN(Date.parse('2024-' + k + 'T12:00:00'));
        let day = valid(params.get('dia') || '') ? params.get('dia') : todayKey();
        input.value = '2024-' + day;   // ano bissexto: aceita 29/02
        let current = null;
        function paint() {
            const list = eventsOf(current).filter(e => !onlyBr.checked || BR_RE.test(e.text));
            const label = new Date('2024-' + day + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
            $('hist-title').textContent = (day === todayKey() ? 'Hoje, ' : '') + label + ', na História';
            box.innerHTML = list.length ? '<ol class="hist-list">' + list.map(e => eventHTML(e, true)).join('') + '</ol>' : '<p class="text-muted">Nenhum fato ' + (onlyBr.checked ? 'ligado ao Brasil ' : '') + 'registrado para este dia.</p>';
            $('hist-updated').innerHTML = wikiCredit(current);
        }
        async function render() {
            box.innerHTML = util.loadingHTML('Carregando…');
            current = await Ext.get('history', { day });
            if (!current) { box.innerHTML = failBox('os fatos deste dia'); $('hist-updated').innerHTML = ''; return; }
            paint();
        }
        input.addEventListener('change', () => {
            const v = input.value.slice(5);
            if (!valid(v)) return;
            day = v; history.replaceState(null, '', 'hoje-na-historia.html' + (day === todayKey() ? '' : '?dia=' + day)); render();
        });
        $('hist-today').addEventListener('click', () => { day = todayKey(); input.value = '2024-' + day; history.replaceState(null, '', 'hoje-na-historia.html'); render(); });
        onlyBr.addEventListener('change', () => { if (current) paint(); });
        document.addEventListener('jb:consent', () => { if (current) paint(); });
        render();
    }

    JB.Services = { weatherWidget, ratesWidget, footballWidget, historyWidget, greetWeather };
    const INIT = { tempo: initTempo, cotacoes: initCotacoes, futebol: initFutebol, 'hoje-na-historia': initHistoria };
    if (INIT[page]) INIT[page]();
})();
