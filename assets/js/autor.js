/* Página de autor (pages/autor.html?nome=...) e, sem ?nome, a lista da equipe e dos colunistas. */
JB.ready.then(function () {
    'use strict';
    const { News, Authors, util } = JB;
    const { esc } = util;
    const box = document.getElementById('author-page');
    if (JB.loadError) { box.innerHTML = util.errorHTML(); return; }
    const name = new URLSearchParams(location.search).get('nome');
    const avatar = a => util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-lg');
    const count = nm => News.byAuthor(nm).length;

    if (name) {
        const a = Authors.get(name);
        const list = News.byAuthor(name);
        if (!a && !list.length) { box.innerHTML = '<div class="alert alert-warning">Autor não encontrado. <a href="autor.html">Ver a equipe</a>.</div>'; return; }
        const p = a || { name, role: 'Colaborador', bio: '' };
        document.title = p.name + ' — Jornal Brasileiro (JB)';
        box.innerHTML = '<nav class="small mb-3"><a href="autor.html">← Equipe e colunistas</a></nav>' +
            '<header class="author-header">' + avatar(p) + '<div><h1 class="page-title border-0 mb-1">' + esc(p.name) + '</h1>' +
            '<p class="mb-1 fw-semibold">' + esc(p.role) + (a && a.columnist ? ' · <span class="kind-badge kind-opiniao">Colunista</span>' : '') + '</p>' +
            (p.bio ? '<p class="mb-1">' + esc(p.bio) + '</p>' : '') + '<p class="small text-muted mb-0">' + list.length + (list.length === 1 ? ' publicação' : ' publicações') + '</p></div></header>' +
            '<hr class="editorial-divider"><div class="row g-4">' + (list.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('') ||
                '<div class="col-12"><div class="alert alert-secondary">Nenhuma publicação deste autor ainda.</div></div>') + '</div>';
        return;
    }

    // Lista da equipe: colunistas, redação e quem assina matérias sem cadastro
    const all = Authors.all();
    const known = new Set(all.map(a => a.name));
    const others = [...new Set(News.all().map(n => n.author))].filter(nm => !known.has(nm)).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const card = a => '<div class="col-sm-6 col-lg-4"><a class="team-card" href="' + esc(util.authorUrl(a.name)) + '">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
        '<span><strong>' + esc(a.name) + '</strong><small>' + esc(a.role || 'Colaborador') + '</small><small class="opacity-75">' + count(a.name) + (count(a.name) === 1 ? ' publicação' : ' publicações') + '</small></span></a></div>';
    const group = (title, list) => list.length ? '<section class="mb-4"><h2 class="section-title">' + title + '</h2><div class="row g-3">' + list.map(card).join('') + '</div></section>' : '';
    box.innerHTML = '<h1 class="page-title">Equipe e colunistas</h1><p class="page-lead">Jornalistas, editores e colunistas do Jornal Brasileiro. Todos são personagens fictícios do projeto acadêmico. Veja também o <a href="institucional.html#expediente">expediente</a>.</p>' +
        group('Colunistas', all.filter(a => a.columnist)) + group('Redação', all.filter(a => !a.columnist)) +
        group('Outras assinaturas', others.map(nm => ({ name: nm, role: 'Colaborador' }))) +
        (all.length || others.length ? '' : '<div class="alert alert-secondary">Nenhum autor cadastrado ainda.</div>');
});
