/* Leitura de uma matéria: pages/noticia.html?id=...
   Favoritar, compartilhar, imprimir, histórico e comentários simulados. */
(function () {
    'use strict';
    const { News, Favs, History, Comments, Auth, util } = JB;
    const { esc } = util;
    const box = document.getElementById('article');
    const n = News.get(new URLSearchParams(location.search).get('id') || '');
    const preview = n && !util.isPublished(n);

    // Matéria inexistente, ou ainda não publicada e o visitante não é editor
    if (!n || (preview && !Auth.isAdmin())) {
        box.innerHTML = '<div class="alert alert-warning">Matéria não encontrada. <a href="noticias.html">Ver todas as notícias</a>.</div>';
        return;
    }
    if (!preview) { JB.Views.hit(n.id); History.add(n.id); }
    document.title = n.title + ' — Jornal Brasileiro (JB)';

    box.innerHTML =
        (preview ? '<div class="alert alert-info no-print">Pré-visualização do editor — status: <strong>' + esc(JB.STATUS[n.status] || n.status) + '</strong>. Esta matéria ainda não está pública.</div>' : '') +
        '<a class="category-tag" href="' + esc(util.catUrl(n.category)) + '">' + esc(util.catLabel(n.category)) + '</a>' +
        '<h1 class="article-title">' + esc(n.title) + '</h1><p class="lead">' + esc(n.subtitle) + '</p>' +
        '<p class="meta-info">Por <strong>' + esc(n.author) + '</strong> • ' + esc(util.fmtDate(n.date)) + ' • ' + util.readingTime(n) + ' min de leitura • ' + JB.Views.count(n.id) + ' leituras</p>' +
        '<div class="d-flex flex-wrap gap-2 mb-3 no-print">' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-fav"></button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-share">Compartilhar</button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-print">Imprimir</button>' +
        '<span class="small align-self-center" id="share-msg" role="status"></span></div>' +
        '<img class="lead-img" src="' + esc(util.imgSrc(n)) + '" alt="' + esc(n.title) + '">' +
        '<div class="article-body">' + n.body.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<p class="small text-muted">Conteúdo fictício, produzido para fins acadêmicos.</p>';

    /* Favoritar */
    const favBtn = document.getElementById('btn-fav');
    const paintFav = () => { const on = Favs.has(n.id); favBtn.textContent = on ? '★ Salvo nos favoritos' : '☆ Salvar para ler depois'; favBtn.classList.toggle('fav-active', on); };
    favBtn.addEventListener('click', () => { Favs.toggle(n.id); paintFav(); });
    paintFav();

    /* Compartilhar (API nativa quando existir; senão copia o link) */
    document.getElementById('btn-share').addEventListener('click', async () => {
        const msg = document.getElementById('share-msg');
        try {
            if (navigator.share) await navigator.share({ title: n.title, url: location.href });
            else { await navigator.clipboard.writeText(location.href); msg.textContent = 'Link copiado!'; }
        } catch (e) {
            window.prompt('Copie o link da matéria:', location.href);
        }
    });
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    /* Comentários simulados */
    const list = document.getElementById('comment-list');
    const renderComments = () => {
        const cs = Comments.forNews(n.id);
        document.getElementById('comment-count').textContent = cs.length;
        list.innerHTML = cs.map(c => '<div class="comment"><strong>' + esc(c.name) + '</strong> <small>• ' + esc(util.fmtDate(c.date)) + '</small><p class="mb-0 mt-1" style="white-space:pre-wrap">' + esc(c.text) + '</p></div>').join('') ||
            '<p class="text-muted">Seja o primeiro a comentar.</p>';
    };
    const form = document.getElementById('comment-form');
    const me = Auth.current();
    if (me) form.elements.name.value = me.name;
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        Comments.add(n.id, { name: form.elements.name.value.trim(), text: form.elements.text.value.trim() });
        form.elements.text.value = ''; form.classList.remove('was-validated');
        renderComments();
    });
    document.getElementById('comments-wrap').hidden = false;
    renderComments();

    /* Leia também */
    const more = News.byCategory(n.category).filter(x => x.id !== n.id).slice(0, 3);
    document.getElementById('related').innerHTML = more.map(x => '<div class="col-md-4">' + util.newsCard(x) + '</div>').join('');
    document.getElementById('related-wrap').hidden = !more.length;
})();
