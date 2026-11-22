/* Homepage, em ordem de hierarquia:
   manchete + últimas + mais lidas → em andamento (ao vivo) → resumo do dia + especial da semana →
   política e economia → investigação → esportes e tecnologia → editorial e opinião →
   verificação de fatos → mais notícias. Seções sem conteúdo ficam escondidas. */
JB.ready.then(function () {
    'use strict';
    const { News, Authors, CATEGORIES, util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);
    const leadEl = $('lead-story');
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('edition-date').textContent = 'Edição Nacional • ' + d.charAt(0).toUpperCase() + d.slice(1);
    if (JB.loadError) {
        leadEl.innerHTML = util.errorHTML();
        $('latest-news').innerHTML = $('feed-grid').innerHTML = $('daily-brief').innerHTML = '';
        return;
    }
    const all = News.all();
    const OPINION = JB.OPINION_KINDS;
    const isNews = n => !OPINION.includes(n.kind);           // notícias/reportagens (não opinião)
    const isReport = n => isNews(n) && n.kind !== 'checagem';   // blocos por editoria (checagens têm seção própria)
    const used = new Set();
    const take = list => { list.forEach(n => used.add(n.id)); return list; };
    const fresh = list => list.filter(n => !used.has(n.id));
    const cards = (list, col) => list.map(n => '<div class="' + (col || 'col-md-6 col-lg-4') + '">' + util.newsCard(n) + '</div>').join('');
    const catHead = c => '<div class="section-head cat-' + esc(c) + '"><h2 class="section-title">' + esc(CATEGORIES[c].label) + '</h2>' +
        '<a class="small fw-semibold" href="' + esc(util.catUrl(c)) + '">Ver mais →</a></div>';
    // Primeira matéria de cada editoria: com imagem e resumo
    const feature = n => '<article class="mini-card mini-feature"><a class="mini-feature-media" href="' + esc(util.articleUrl(n)) + '" tabindex="-1" aria-hidden="true">' +
        '<img src="' + esc(util.imgSrc(n)) + '" alt="" loading="lazy"></a><div>' + util.badgesHTML(n) + util.catTag(n.category) +
        '<h3><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h3>' + (n.subtitle ? '<p>' + esc(n.subtitle) + '</p>' : '') +
        '<span class="time">' + util.timeAgo(n.date) + '</span></div></article>';
    const mini = n => '<article class="mini-card">' + util.badgesHTML(n) + util.catTag(n.category) +
        '<h3><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h3><span class="time">' + util.timeAgo(n.date) + '</span></article>';

    /* 1. Manchete: a marcada pelo editor ou a notícia mais recente */
    const lead = all.find(n => n.featured) || all.find(n => isNews(n) && n.kind !== 'aovivo') || all[0];
    if (lead) {
        take([lead]);
        leadEl.innerHTML = util.badgesHTML(lead) + util.catTag(lead.category) +
            '<h1><a href="' + esc(util.articleUrl(lead)) + '">' + esc(lead.title) + '</a></h1><p class="subtitle">' + esc(lead.subtitle) + '</p>' +
            '<img class="lead-img" fetchpriority="high" src="' + esc(util.imgSrc(lead)) + '" alt="' + esc(lead.title) + '">' +
            '<div class="meta-info">Por <a href="' + esc(util.authorUrl(lead.author)) + '"><strong>' + esc(lead.author) + '</strong></a> • ' + util.timeAgo(lead.date) + '</div>' + excerptHTML(lead, 'Continuar lendo →');
        fitExcerpt(leadEl);
    } else {
        leadEl.innerHTML = '<p>Nenhuma notícia publicada no momento.</p>' + (JB.Auth.isStaff() ? '<p><a href="pages/admin.html">Cadastrar notícia no Painel Administrativo</a></p>' : '');
    }

    /* Prévia do texto (manchete e editorial): ocupa a altura que sobra no bloco, ao lado de uma coluna
       mais alta (no mínimo 2 linhas), e termina em "…" quando o texto não cabe. */
    function excerptHTML(n, more) {
        const sub = (n.subtitle || '').trim();
        const text = (n.body || []).map(util.plainText).map(t => t.replace(/^[PR]:\s*/, '').trim())
            .filter(t => t && t !== sub).join(' ').slice(0, 2000);
        return text ? '<div class="fit-excerpt"><p>' + esc(text) + '</p></div>' + (more ? '<a class="excerpt-more" href="' + esc(util.articleUrl(n)) + '">' + more + '</a>' : '') : '';
    }
    function fitExcerpt(root) {
        const box = root.querySelector('.fit-excerpt');
        if (!box) return;
        const p = box.firstElementChild;
        const fit = () => {
            const lh = parseFloat(getComputedStyle(p).lineHeight) || 24;
            p.style.webkitLineClamp = p.style.lineClamp = String(Math.max(2, Math.floor((box.clientHeight + 1) / lh)));
        };
        fit();
        if (window.ResizeObserver) new ResizeObserver(fit).observe(box);
    }

    /* 2. Últimas publicações (feed cronológico) */
    $('latest-news').innerHTML = all.filter(n => n !== lead).slice(0, 5).map(mini).join('') || '<p class="text-muted small">Sem outras publicações.</p>';

    /* 3. Em andamento: coberturas ao vivo abertas */
    const live = all.filter(n => n.kind === 'aovivo' && n.live).slice(0, 3);
    if (live.length) {
        const hhmm = d => esc(new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        const recent = n => (n.updates || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        $('home-live').hidden = false;
        if (live.length === 1) {   // uma só: cartão largo com as últimas atualizações (antes sobravam 2/3 da linha vazios)
            const n = live[0], ups = recent(n).slice(0, 3);
            $('home-live-list').innerHTML = '<div class="col-12"><a class="live-card live-card-wide" href="' + esc(util.articleUrl(n)) + '">' +
                '<div class="live-card-main">' + util.liveBadge() + '<strong class="live-title">' + esc(n.title) + '</strong>' +
                (n.subtitle ? '<span class="small">' + esc(n.subtitle) + '</span>' : '') + '<span class="live-cta">Acompanhar a cobertura →</span></div>' +
                (ups.length ? '<ol class="live-updates" aria-label="Últimas atualizações">' + ups.map(u => '<li><span class="live-time">' + hhmm(u.date) + '</span><span>' + esc(u.text) + '</span></li>').join('') + '</ol>' : '') +
                '</a></div>';
        } else {
            const col = live.length === 2 ? 'col-md-6' : 'col-md-6 col-lg-4';
            $('home-live-list').innerHTML = live.map(n => {
                const last = recent(n)[0];
                return '<div class="' + col + '"><a class="live-card" href="' + esc(util.articleUrl(n)) + '">' + util.liveBadge() +
                    '<strong>' + esc(n.title) + '</strong>' + (last ? '<span class="small">' + hhmm(last.date) + ' — ' + esc(last.text) + '</span>' : '') + '</a></div>';
            }).join('');
        }
        take(live);
    }

    /* 4. Resumo do dia: principais acontecimentos das últimas 24 h, em poucas linhas */
    const dayAgo = Date.now() - 864e5;
    let brief = all.filter(n => isNews(n) && new Date(n.date) >= dayAgo);
    if (brief.length < 3) brief = all.filter(isNews);
    $('daily-brief').innerHTML = brief.slice(0, 6).map(n => '<li><span class="brief-time">' + esc(new Date(n.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + '</span>' +
        '<div><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a><span class="brief-cat"> · ' + esc(util.catLabel(n.category)) + '</span></div></li>').join('') || '<li class="text-muted">Sem publicações hoje.</li>';

    /* 5. Especial da semana: reportagem mais recente (ou a investigação mais recente) */
    const weekAgo = Date.now() - 7 * 864e5;
    const special = fresh(all).find(n => n.kind === 'reportagem' && new Date(n.date) >= weekAgo) || fresh(all).find(n => n.kind === 'reportagem') || fresh(all).find(n => n.category === 'investigacao');
    if (special) {
        take([special]);
        $('home-special').hidden = false;
        $('home-special-body').innerHTML = '<article class="special-card"><img src="' + esc(util.imgSrc(special)) + '" alt="' + esc(special.title) + '" loading="lazy">' +
            '<div>' + util.badgesHTML(special) + util.catTag(special.category) +
            '<h3><a href="' + esc(util.articleUrl(special)) + '">' + esc(special.title) + '</a></h3><p>' + esc(special.subtitle) + '</p>' +
            '<span class="meta-info">' + util.readingTime(special) + ' min de leitura • Por ' + esc(special.author) + '</span></div></article>';
    }

    /* 6. Blocos por editoria */
    document.querySelectorAll('.home-section').forEach(sec => {
        const cats = sec.dataset.home.split(',');
        if (sec.querySelector('[data-grid]')) {   // uma editoria, em grade
            const list = take(fresh(News.byCategory(cats[0]).filter(isReport)).slice(0, 3));
            if (list.length) { sec.hidden = false; sec.querySelector('[data-grid]').innerHTML = cards(list); }
            return;
        }
        // Em dupla, as duas colunas mostram a mesma quantidade (o que sobra vai para "Mais notícias"),
        // para não deixar espaço vazio embaixo da mais curta
        const lists = cats.map(c => ({ c, list: fresh(News.byCategory(c).filter(isReport)) })).filter(x => x.list.length);
        const box = sec.querySelector('[data-cols]');
        sec.hidden = !lists.length;
        if (!lists.length) return;
        if (lists.length === 1) {   // só uma editoria com matérias: largura toda, em grade
            const { c, list } = lists[0];
            box.innerHTML = '<div class="col-12">' + catHead(c) + '<div class="row g-4">' + cards(take(list.slice(0, 3))) + '</div></div>';
            return;
        }
        const k = Math.min(3, ...lists.map(x => x.list.length));
        box.innerHTML = lists.map(({ c, list }) => {
            const shown = take(list.slice(0, k));
            return '<div class="col-lg-6">' + catHead(c) + feature(shown[0]) + shown.slice(1).map(mini).join('') + '</div>';
        }).join('');
    });

    /* 7. Editorial e opinião */
    const editorial = fresh(all).find(n => n.kind === 'editorial');
    const columns = fresh(all).filter(n => n.kind === 'opiniao' || n.kind === 'analise').slice(0, 4);
    if (editorial || columns.length) {
        $('home-opinion').hidden = false;
        if (editorial) {
            take([editorial]);
            $('home-editorial').innerHTML = '<article class="editorial-card"><span class="kind-badge kind-editorial">Editorial do JB</span>' +
                '<h3><a href="' + esc(util.articleUrl(editorial)) + '">' + esc(editorial.title) + '</a></h3><p class="editorial-sub">' + esc(editorial.subtitle) + '</p>' +
                excerptHTML(editorial) + '<span class="meta-info">Posição institucional do jornal • ' + util.timeAgo(editorial.date) + '</span></article>';
            fitExcerpt($('home-editorial'));
        }
        take(columns);
        // Sem editorial, as colunas ocupam a largura toda; com 1 ou 2, uma embaixo da outra, na altura do editorial
        $('home-editorial').hidden = !editorial;
        $('home-columns-wrap').className = editorial ? 'col-lg-7' : 'col-12';
        $('home-columns').className = 'opinion-grid' + (columns.length > 2 || !editorial ? ' is-grid' : '');
        $('home-columns').innerHTML = columns.map(n => {
            const a = Authors.get(n.author) || { name: n.author, role: '' };
            return '<article class="column-card">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
                '<div><span class="kind-badge kind-' + esc(n.kind) + '">' + esc(util.kindLabel(n.kind)) + '</span><h3><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h3>' +
                (n.subtitle ? '<p class="column-sub">' + esc(n.subtitle) + '</p>' : '') +
                '<a class="small fw-semibold" href="' + esc(util.authorUrl(a.name)) + '">' + esc(a.name) + '</a>' + (a.role ? '<span class="small d-block opacity-75">' + esc(a.role) + '</span>' : '') + '</div></article>';
        }).join('');
    }

    /* 8. Verificação de fatos */
    const checks = fresh(all).filter(n => n.kind === 'checagem').slice(0, 3);
    if (checks.length) { $('home-checks').hidden = false; $('home-checks-list').innerHTML = cards(take(checks)); }

    /* 9. Mais notícias: o que ainda não apareceu */
    const more = fresh(all).filter(isNews).slice(0, 6);
    $('feed-grid').innerHTML = cards(more);
    $('home-more').hidden = !more.length;

    /* Mais lidas */
    const top = JB.Views.top(5);
    const box = $('most-read');
    if (top.length) {
        box.hidden = false;
        $('most-read-list').innerHTML = top.map((n, i) =>
            '<li class="most-read-item"><span class="rank">' + (i + 1) + '</span><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></li>').join('');
    }
});
