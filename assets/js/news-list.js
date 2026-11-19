/* Listagem de notícias (editorias e seções).
   Atributos do <body>:
     data-category="politica"        fixa a editoria (politica/economia/esportes/investigacao)
     data-kind="checagem"            fixa o tipo de conteúdo (lista separada por vírgula)
     data-hero="1"                   a matéria mais recente aparece em destaque no topo
     data-filter="verdict" | "kind"  barra de filtros por veredito (checagem) ou por tipo (opinião)
   pages/noticias.html: filtros por editoria (?cat=), busca (?q=) e busca avançada
   (?author=&kind=&from=&to=). Com ?cat= a página assume o nome e a descrição da editoria. */
JB.ready.then(function () {
    'use strict';
    const { News, CATEGORIES, KINDS, VERDICTS, util } = JB;
    const { esc } = util;
    const body = document.body.dataset;
    const params = new URLSearchParams(location.search);
    const fixedCat = body.category || '';
    const fixedKinds = body.kind ? body.kind.split(',') : null;
    let cat = fixedCat || params.get('cat') || '';
    let sub = params.get('f') || '';   // filtro da barra (veredito ou tipo)
    const q = (params.get('q') || '').trim();
    const author = params.get('author') || '';
    const kindParam = params.get('kind') || '';
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    const grid = document.getElementById('news-grid');
    const bar = document.getElementById('filter-bar');
    const info = document.getElementById('result-info');
    const hero = document.getElementById('list-hero');

    // noticias.html?cat=saude: a página vira a página da editoria
    if (!fixedCat && cat && CATEGORIES[cat] && document.body.dataset.page === 'noticias' && !q) {
        const h1 = document.querySelector('.page-title'), lead = document.querySelector('.page-lead');
        if (h1) h1.textContent = CATEGORIES[cat].label;
        if (lead) lead.textContent = CATEGORIES[cat].desc;
        document.title = CATEGORIES[cat].label + ' — Jornal Brasileiro (JB)';
    }

    function heroHTML(n) {
        return '<article class="list-hero">' +
            '<a href="' + esc(util.articleUrl(n)) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(util.imgSrc(n)) + '" alt="" fetchpriority="high"></a>' +
            '<div>' + util.badgesHTML(n) + '<a class="category-tag" href="' + esc(util.catUrl(n.category)) + '">' + esc(util.catLabel(n.category)) + '</a>' +
            '<h2><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h2><p>' + esc(n.subtitle) + '</p>' +
            '<span class="meta-info">Por ' + esc(n.author) + ' • ' + util.timeAgo(n.date) + '</span></div></article>';
    }

    function render() {
        if (JB.loadError) { if (info) info.textContent = ''; if (hero) hero.innerHTML = ''; grid.innerHTML = '<div class="col-12">' + util.errorHTML() + '</div>'; return; }
        let list = q ? News.search(q) : News.all();
        if (fixedKinds) list = list.filter(n => fixedKinds.includes(n.kind || 'noticia'));
        if (cat) list = list.filter(n => n.category === cat);
        if (author) list = list.filter(n => n.author === author);
        if (kindParam) list = list.filter(n => (n.kind || 'noticia') === kindParam);
        if (from) list = list.filter(n => new Date(n.date) >= new Date(from + 'T00:00:00'));
        if (to) list = list.filter(n => new Date(n.date) <= new Date(to + 'T23:59:59'));
        if (sub && body.filter === 'verdict') list = list.filter(n => n.verdict === sub);
        if (sub && body.filter === 'kind') list = list.filter(n => n.kind === sub);
        if (fixedKinds && fixedKinds.includes('aovivo')) list.sort((a, b) => (b.live - a.live) || new Date(b.date) - new Date(a.date));   // em andamento primeiro

        if (info) info.textContent = (q ? 'Resultados para "' + q + '": ' : '') + list.length + (list.length === 1 ? ' matéria' : ' matérias');
        let rest = list;
        if (hero) {
            hero.innerHTML = list.length && !sub ? heroHTML(list[0]) : '';
            if (list.length && !sub) rest = list.slice(1);
        }
        grid.innerHTML = rest.length
            ? rest.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('')
            : (list.length ? '' : '<div class="col-12"><div class="alert alert-secondary">Nenhuma matéria encontrada nesta seleção.</div></div>');
        if (bar) bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.f === (body.filter ? sub : cat)));
    }

    /* Busca avançada (somente em noticias.html) */
    const adv = document.getElementById('adv-form');
    if (adv) {
        const authors = [...new Set(News.all().map(n => n.author))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        adv.elements.author.innerHTML += authors.map(a => '<option>' + esc(a) + '</option>').join('');
        adv.elements.cat.innerHTML += Object.keys(CATEGORIES).map(k => '<option value="' + k + '">' + esc(CATEGORIES[k].label) + '</option>').join('');
        adv.elements.kind.innerHTML += Object.keys(KINDS).map(k => '<option value="' + k + '">' + esc(KINDS[k]) + '</option>').join('');
        adv.elements.q.value = q; adv.elements.author.value = author; adv.elements.cat.value = cat; adv.elements.kind.value = kindParam;
        adv.elements.from.value = from; adv.elements.to.value = to;
        if (author || from || to || kindParam) document.getElementById('adv-box').open = true;
    }

    /* Barra de filtros: editorias (noticias.html), vereditos (verificação) ou tipos (opinião) */
    if (bar) {
        const opts = body.filter === 'verdict' ? Object.keys(VERDICTS).map(k => [k, VERDICTS[k].label])
            : body.filter === 'kind' ? fixedKinds.map(k => [k, KINDS[k]])
                : Object.keys(CATEGORIES).map(k => [k, CATEGORIES[k].label]);
        bar.innerHTML = '<button class="btn btn-outline-dark" data-f="">Todas</button>' + opts.map(o => '<button class="btn btn-outline-dark" data-f="' + esc(o[0]) + '">' + esc(o[1]) + '</button>').join('');
        bar.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            const key = body.filter ? 'f' : 'cat';
            if (body.filter) sub = b.dataset.f; else cat = b.dataset.f;
            const u = new URL(location.href); b.dataset.f ? u.searchParams.set(key, b.dataset.f) : u.searchParams.delete(key);
            history.replaceState(null, '', u);
            if (adv) adv.elements.cat.value = cat;
            render();
        });
    }

    /* Colunistas (página de opinião) */
    const cols = document.getElementById('columnists');
    if (cols) {
        const list = JB.Authors.columnists();
        cols.innerHTML = list.map(a => '<a class="columnist" href="' + esc(util.authorUrl(a.name)) + '">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
            '<span><strong>' + esc(a.name) + '</strong><small>' + esc(a.role) + '</small></span></a>').join('');
        document.getElementById('columnists-wrap').hidden = !list.length;
    }
    render();
});
