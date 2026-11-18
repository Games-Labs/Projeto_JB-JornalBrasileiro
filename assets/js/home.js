/* Homepage: manchete, últimas publicações e destaques do dia */
(function () {
    'use strict';
    const { News, util } = JB;
    const { esc } = util;
    const all = News.all();
    const lead = all.find(n => n.featured) || all[0];
    const rest = all.filter(n => n !== lead);

    const leadEl = document.getElementById('lead-story');
    if (lead) {
        leadEl.innerHTML = '<a class="category-tag" href="' + esc(util.catUrl(lead.category)) + '">' + esc(util.catLabel(lead.category)) + '</a>' +
            '<h1><a href="' + esc(util.articleUrl(lead)) + '">' + esc(lead.title) + '</a></h1><p class="subtitle">' + esc(lead.subtitle) + '</p>' +
            '<img class="lead-img" src="' + esc(util.imgSrc(lead)) + '" alt="' + esc(lead.title) + '">' +
            '<div class="meta-info">Por <strong>' + esc(lead.author) + '</strong> • ' + util.timeAgo(lead.date) + '</div>';
    } else {
        leadEl.innerHTML = '<p>Nenhuma notícia publicada. Cadastre uma no Painel Administrativo.</p>';
    }

    document.getElementById('latest-news').innerHTML = rest.slice(0, 3).map(n =>
        '<article class="mini-card"><a class="category-tag" href="' + esc(util.catUrl(n.category)) + '">' + esc(util.catLabel(n.category)) + '</a>' +
        '<h3><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></h3><span class="time">' + util.timeAgo(n.date) + '</span></article>').join('');

    document.getElementById('feed-grid').innerHTML = rest.slice(3, 9).map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('');
    const top = JB.Views.top(5);
    const box = document.getElementById('most-read');
    if (top.length) {
        box.hidden = false;
        document.getElementById('most-read-list').innerHTML = top.map((n, i) =>
            '<li class="most-read-item"><span class="rank">' + (i + 1) + '</span><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a></li>').join('');
    }
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
    document.getElementById('edition-date').textContent = 'Edição Nacional • ' + d.charAt(0).toUpperCase() + d.slice(1);
})();
