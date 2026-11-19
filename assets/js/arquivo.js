/* Arquivo histórico: publicações agrupadas por mês, com filtro por tipo e editoria. */
JB.ready.then(function () {
    'use strict';
    const { News, CATEGORIES, KINDS, util } = JB;
    const { esc } = util;
    const box = document.getElementById('archive');
    const kindSel = document.getElementById('arch-kind'), catSel = document.getElementById('arch-cat');
    if (JB.loadError) { box.innerHTML = util.errorHTML(); return; }
    kindSel.innerHTML += Object.keys(KINDS).map(k => '<option value="' + k + '">' + esc(KINDS[k]) + '</option>').join('');
    catSel.innerHTML += Object.keys(CATEGORIES).map(k => '<option value="' + k + '">' + esc(CATEGORIES[k].label) + '</option>').join('');
    const params = new URLSearchParams(location.search);
    kindSel.value = params.get('kind') || ''; catSel.value = params.get('cat') || '';

    function render() {
        const list = News.all().filter(n => (!kindSel.value || (n.kind || 'noticia') === kindSel.value) && (!catSel.value || n.category === catSel.value));
        const months = new Map();
        list.forEach(n => {
            const d = new Date(n.date), key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            if (!months.has(key)) months.set(key, { label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), items: [] });
            months.get(key).items.push(n);
        });
        if (!list.length) { box.innerHTML = '<div class="alert alert-secondary">Nenhuma publicação nesta seleção.</div>'; return; }
        const nav = '<nav class="archive-nav mb-4" aria-label="Meses">' + [...months].map(([k, m]) => '<a href="#m-' + k + '">' + esc(m.label) + ' <span>(' + m.items.length + ')</span></a>').join('') + '</nav>';
        box.innerHTML = '<p class="small text-muted">' + list.length + (list.length === 1 ? ' publicação' : ' publicações') + '</p>' + nav + [...months].map(([k, m]) =>
            '<section class="mb-4" id="m-' + k + '"><h2 class="section-title text-capitalize">' + esc(m.label) + '</h2><ul class="archive-list">' +
            m.items.map(n => '<li><time datetime="' + esc(n.date) + '">' + esc(new Date(n.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })) + '</time>' +
                '<div>' + util.badgesHTML(n) + '<a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a><span class="small opacity-75"> · ' + esc(util.catLabel(n.category)) + ' · ' + esc(n.author) + '</span></div></li>').join('') +
            '</ul></section>').join('');
    }
    [kindSel, catSel].forEach(s => s.addEventListener('change', () => {
        const u = new URL(location.href);
        kindSel.value ? u.searchParams.set('kind', kindSel.value) : u.searchParams.delete('kind');
        catSel.value ? u.searchParams.set('cat', catSel.value) : u.searchParams.delete('cat');
        history.replaceState(null, '', u);
        render();
    }));
    render();
});
