/* Página de uma tag (pages/tag.html?t=slug): matérias do jornal e do JB Educa com a tag e,
   sem ?t=, a lista de todas as tags com o número de matérias. */
JB.ready.then(function () {
    'use strict';
    const { News, Tags, util } = JB;
    const { esc } = util;
    const box = document.getElementById('tag-page');
    if (JB.loadError) { box.innerHTML = util.errorHTML(); return; }
    const slug = new URLSearchParams(location.search).get('t') || '';
    const cards = l => l.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('');

    if (slug) {
        const t = Tags.get(slug);
        const list = News.byTag(slug);
        if (!t && !list.length) { box.innerHTML = '<div class="alert alert-warning">Tag não encontrada. <a href="tag.html">Ver todas as tags</a>.</div>'; return; }
        const name = t ? t.name : slug;
        document.title = '#' + name + ' — Jornal Brasileiro (JB)';
        // Tags que aparecem junto com esta nas mesmas matérias
        const near = {};
        list.forEach(n => (n.tags || []).forEach(s => { if (s !== slug) near[s] = (near[s] || 0) + 1; }));
        const related = Object.keys(near).map(s => Tags.get(s)).filter(Boolean).sort((a, b) => near[b.slug] - near[a.slug]).slice(0, 12);
        box.innerHTML = '<nav class="small mb-3"><a href="tag.html">← Todas as tags</a></nav>' +
            '<h1 class="page-title">#' + esc(name) + '</h1>' + (t && t.description ? '<p class="page-lead">' + esc(t.description) + '</p>' : '') +
            '<p class="text-muted small">' + list.length + (list.length === 1 ? ' matéria' : ' matérias') + ' com esta tag</p>' +
            '<div class="row g-4">' + (cards(list) || '<div class="col-12"><div class="alert alert-secondary">Nenhuma matéria publicada com esta tag ainda.</div></div>') + '</div>' +
            (related.length ? '<h2 class="section-title mt-5">Assuntos relacionados</h2><ul class="tag-list">' + related.map(r => '<li><a class="tag-chip" href="' + esc(util.tagUrl(r.slug)) + '">#' + esc(r.name) + '</a></li>').join('') + '</ul>' : '');
        return;
    }
    const tags = Tags.all().map(t => ({ t, n: News.byTag(t.slug).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.t.name.localeCompare(b.t.name, 'pt-BR'));
    box.innerHTML = '<h1 class="page-title">Assuntos</h1><p class="page-lead">Todas as tags usadas nas matérias do Jornal Brasileiro e do JB Educa. Clique em uma para ver as matérias relacionadas.</p>' +
        (tags.length ? '<ul class="tag-list tag-cloud">' + tags.map(x => '<li><a class="tag-chip" href="' + esc(util.tagUrl(x.t.slug)) + '">#' + esc(x.t.name) + ' <small>' + x.n + '</small></a></li>').join('') + '</ul>'
            : '<div class="alert alert-secondary">Nenhuma matéria com tags ainda.</div>');
});
