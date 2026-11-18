/* Leitura de uma matéria: pages/noticia.html?id=... */
(function () {
    'use strict';
    const { News, util } = JB;
    const { esc } = util;
    const box = document.getElementById('article');
    const n = News.get(new URLSearchParams(location.search).get('id') || '');
    if (!n) {
        box.innerHTML = '<div class="alert alert-warning">Matéria não encontrada. <a href="noticias.html">Ver todas as notícias</a>.</div>';
        return;
    }
    document.title = n.title + ' — Jornal Brasileiro (JB)';
    box.innerHTML = '<a class="category-tag" href="' + esc(util.catUrl(n.category)) + '">' + esc(util.catLabel(n.category)) + '</a>' +
        '<h1 class="article-title">' + esc(n.title) + '</h1><p class="lead">' + esc(n.subtitle) + '</p>' +
        '<p class="meta-info">Por <strong>' + esc(n.author) + '</strong> • ' + esc(util.fmtDate(n.date)) + '</p>' +
        '<img class="lead-img" src="' + esc(util.imgSrc(n)) + '" alt="' + esc(n.title) + '">' +
        '<div class="article-body">' + n.body.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>';

    const more = News.byCategory(n.category).filter(x => x.id !== n.id).slice(0, 3);
    document.getElementById('related').innerHTML = more.map(x => '<div class="col-md-4">' + util.newsCard(x) + '</div>').join('');
    document.getElementById('related-wrap').hidden = !more.length;
})();
