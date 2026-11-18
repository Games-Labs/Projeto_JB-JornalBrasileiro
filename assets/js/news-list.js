/* Listagem de notícias.
   - pages/noticias.html: filtros por categoria (?cat=) e busca (?q=)
   - politica/economia/esportes: <body data-category="..."> fixa a categoria */
(function () {
    'use strict';
    const { News, CATEGORIES, util } = JB;
    const { esc } = util;
    const params = new URLSearchParams(location.search);
    const fixed = document.body.dataset.category || '';
    let cat = fixed || params.get('cat') || '';
    const q = (params.get('q') || '').trim();
    const grid = document.getElementById('news-grid');
    const bar = document.getElementById('filter-bar');
    const info = document.getElementById('result-info');

    function render() {
        let list = q ? News.search(q) : News.all();
        if (cat) list = list.filter(n => n.category === cat);
        if (info) info.textContent = (q ? 'Resultados para "' + q + '": ' : '') + list.length + (list.length === 1 ? ' matéria' : ' matérias');
        grid.innerHTML = list.length
            ? list.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('')
            : '<div class="col-12"><div class="alert alert-secondary">Nenhuma notícia encontrada nesta seleção.</div></div>';
        if (bar) bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    }

    if (bar) {
        bar.innerHTML = '<button class="btn btn-outline-dark" data-cat="">Todas</button>' +
            Object.keys(CATEGORIES).map(k => '<button class="btn btn-outline-dark" data-cat="' + k + '">' + esc(CATEGORIES[k].label) + '</button>').join('');
        bar.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            cat = b.dataset.cat;
            const u = new URL(location.href); cat ? u.searchParams.set('cat', cat) : u.searchParams.delete('cat');
            history.replaceState(null, '', u);
            render();
        });
    }
    render();
})();
