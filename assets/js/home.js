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
    const mini = n => '<article class="mini-card">' + util.badgesHTML(n) + util.catTag(n.category) +
        '<h3><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h3><span class="time">' + util.timeAgo(n.date) + '</span></article>';

    /* 1. Manchete: a marcada pelo editor ou a notícia mais recente */
    const lead = all.find(n => n.featured) || all.find(n => isNews(n) && n.kind !== 'aovivo') || all[0];
    if (lead) {
        take([lead]);
        leadEl.innerHTML = util.badgesHTML(lead) + util.catTag(lead.category) +
            '<h1><a href="' + esc(util.articleUrl(lead)) + '">' + esc(lead.title) + '</a></h1><p class="subtitle">' + esc(lead.subtitle) + '</p>' +
            '<img class="lead-img" fetchpriority="high" src="' + esc(util.imgSrc(lead)) + '" alt="' + esc(lead.title) + '">' +
            '<div class="meta-info">Por <a href="' + esc(util.authorUrl(lead.author)) + '"><strong>' + esc(lead.author) + '</strong></a> • ' + util.timeAgo(lead.date) + '</div>';
    } else {
        leadEl.innerHTML = '<p>Nenhuma notícia publicada no momento.</p>' + (JB.Auth.isStaff() ? '<p><a href="pages/admin.html">Cadastrar notícia no Painel Administrativo</a></p>' : '');
    }

    /* 2. Últimas publicações (feed cronológico) */
    $('latest-news').innerHTML = all.filter(n => n !== lead).slice(0, 5).map(mini).join('') || '<p class="text-muted small">Sem outras publicações.</p>';

    /* 3. Em andamento: coberturas ao vivo abertas */
    const live = all.filter(n => n.kind === 'aovivo' && n.live);
    if (live.length) {
        $('home-live').hidden = false;
        $('home-live-list').innerHTML = live.slice(0, 3).map(n => {
            const last = (n.updates || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            return '<div class="col-md-6 col-lg-4"><a class="live-card" href="' + esc(util.articleUrl(n)) + '">' + util.liveBadge() +
                '<strong>' + esc(n.title) + '</strong>' + (last ? '<span class="small">' + esc(new Date(last.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + ' — ' + esc(last.text) + '</span>' : '') + '</a></div>';
        }).join('');
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
        let any = false;
        sec.querySelector('[data-cols]').innerHTML = cats.map(c => {
            const list = take(fresh(News.byCategory(c).filter(isReport)).slice(0, 3));
            if (!list.length) return '';
            any = true;
            return '<div class="col-lg-6"><div class="d-flex justify-content-between align-items-baseline"><h2 class="section-title flex-grow-1 me-3 cat-' + esc(c) + '">' + esc(CATEGORIES[c].label) + '</h2>' +
                '<a class="small fw-semibold" href="' + esc(util.catUrl(c)) + '">Ver mais →</a></div>' + list.map(mini).join('') + '</div>';
        }).join('');
        sec.hidden = !any;
    });

    /* 7. Editorial e opinião */
    const editorial = fresh(all).find(n => n.kind === 'editorial');
    const columns = fresh(all).filter(n => n.kind === 'opiniao' || n.kind === 'analise').slice(0, 4);
    if (editorial || columns.length) {
        $('home-opinion').hidden = false;
        if (editorial) {
            take([editorial]);
            $('home-editorial').innerHTML = '<article class="editorial-card"><span class="kind-badge kind-editorial">Editorial do JB</span>' +
                '<h3><a href="' + esc(util.articleUrl(editorial)) + '">' + esc(editorial.title) + '</a></h3><p>' + esc(editorial.subtitle) + '</p>' +
                '<span class="meta-info">Posição institucional do jornal • ' + util.timeAgo(editorial.date) + '</span></article>';
        }
        take(columns);
        $('home-columns').innerHTML = columns.map(n => {
            const a = Authors.get(n.author) || { name: n.author, role: '' };
            return '<div class="col-sm-6"><article class="column-card">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
                '<div><span class="kind-badge kind-' + esc(n.kind) + '">' + esc(util.kindLabel(n.kind)) + '</span><h3><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h3>' +
                '<a class="small fw-semibold" href="' + esc(util.authorUrl(a.name)) + '">' + esc(a.name) + '</a>' + (a.role ? '<span class="small d-block opacity-75">' + esc(a.role) + '</span>' : '') + '</div></article></div>';
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
