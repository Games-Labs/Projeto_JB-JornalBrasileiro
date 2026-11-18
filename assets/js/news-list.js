/* Listagem de notícias.
   - pages/noticias.html: filtros por categoria (?cat=), busca (?q=) e busca avançada (?author=&from=&to=)
   - politica/economia/esportes: <body data-category="..."> fixa a categoria */
(function () {
    'use strict';
    const { News, CATEGORIES, util } = JB;
    const { esc } = util;
    const params = new URLSearchParams(location.search);
    const fixed = document.body.dataset.category || '';
    let cat = fixed || params.get('cat') || '';
    const q = (params.get('q') || '').trim();
    const author = params.get('author') || '';
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    const grid = document.getElementById('news-grid');
    const bar = document.getElementById('filter-bar');
    const info = document.getElementById('result-info');

    function render() {
        let list = q ? News.search(q) : News.all();
        if (cat) list = list.filter(n => n.category === cat);
        if (author) list = list.filter(n => n.author === author);
        if (from) list = list.filter(n => new Date(n.date) >= new Date(from + 'T00:00:00'));
        if (to) list = list.filter(n => new Date(n.date) <= new Date(to + 'T23:59:59'));
        if (info) info.textContent = (q ? 'Resultados para "' + q + '": ' : '') + list.length + (list.length === 1 ? ' matéria' : ' matérias');
        grid.innerHTML = list.length
            ? list.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('')
            : '<div class="col-12"><div class="alert alert-secondary">Nenhuma notícia encontrada nesta seleção.</div></div>';
        if (bar) bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    }

    /* Busca avançada (somente em noticias.html) */
    const adv = document.getElementById('adv-form');
    if (adv) {
        const authors = [...new Set(News.all().map(n => n.author))].sort();
        adv.elements.author.innerHTML += authors.map(a => '<option>' + esc(a) + '</option>').join('');
        adv.elements.cat.innerHTML += Object.keys(CATEGORIES).map(k => '<option value="' + k + '">' + esc(CATEGORIES[k].label) + '</option>').join('');
        adv.elements.q.value = q; adv.elements.author.value = author; adv.elements.cat.value = cat;
        adv.elements.from.value = from; adv.elements.to.value = to;
        if (author || from || to) document.getElementById('adv-box').open = true;
    }

    if (bar) {
        bar.innerHTML = '<button class="btn btn-outline-dark" data-cat="">Todas</button>' +
            Object.keys(CATEGORIES).map(k => '<button class="btn btn-outline-dark" data-cat="' + k + '">' + esc(CATEGORIES[k].label) + '</button>').join('');
        bar.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            cat = b.dataset.cat;
            const u = new URL(location.href); cat ? u.searchParams.set('cat', cat) : u.searchParams.delete('cat');
            history.replaceState(null, '', u);
            if (adv) adv.elements.cat.value = cat;
            render();
        });
    }
    render();
})();
