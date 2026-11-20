/* Leitura de uma matéria: pages/noticia.html?id=...
   Selos de tipo (opinião, análise, checagem…), cobertura ao vivo com atualização automática,
   entrevista em perguntas e respostas, gráfico, cronologia, personagens, fontes, correções,
   perfil do autor, modo leitura, favoritar, compartilhar, imprimir, histórico e comentários. */
JB.ready.then(function () {
    'use strict';
    const { News, Favs, History, Comments, Auth, Authors, Members, util } = JB;
    const { esc } = util;
    const box = document.getElementById('article');
    if (JB.loadError) { box.innerHTML = util.errorHTML(); return; }
    const id = new URLSearchParams(location.search).get('id') || '';
    let n = News.get(id);
    const preview = n && !util.isPublished(n);

    // Matéria inexistente, ou ainda não publicada e o visitante não é da redação
    if (!n || (preview && !Auth.isStaff())) {
        box.innerHTML = '<div class="alert alert-warning">Matéria não encontrada. <a href="noticias.html">Ver todas as notícias</a>.</div>';
        return;
    }
    if (!preview) { JB.Views.hit(n.id); History.add(n.id); }
    document.title = n.title + ' — Jornal Brasileiro (JB)';
    const kind = n.kind || 'noticia';
    const hm = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dm = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    /* ---------- Blocos ---------- */
    function previewNote() {
        if (!preview) return '';
        const why = util.isScheduled(n) ? 'agendada para <strong>' + esc(util.fmtDate(n.date)) + '</strong>' : 'status: <strong>' + esc(JB.STATUS[n.status] || n.status) + '</strong>';
        return '<div class="alert alert-info no-print">Pré-visualização do editor — ' + why + '. Esta matéria ainda não está pública.</div>';
    }
    function kindNote() {
        if (kind === 'opiniao') return '<div class="kind-note">Artigo de <strong>opinião</strong>: reflete a visão do autor, não necessariamente a do jornal.</div>';
        if (kind === 'analise') return '<div class="kind-note"><strong>Análise</strong>: interpretação dos fatos a partir de dados e contexto, assinada por especialista da redação.</div>';
        if (kind === 'editorial') return '<div class="kind-note"><strong>Editorial</strong>: expressa a posição institucional do Jornal Brasileiro.</div>';
        return '';
    }
    function verdictBox() {
        const v = JB.VERDICTS[n.verdict];
        if (kind !== 'checagem' || !v) return '';
        return '<div class="verdict-box verdict-' + esc(n.verdict) + '"><span class="small text-uppercase fw-bold">Classificação</span>' +
            '<strong>' + esc(v.label) + '</strong><span>' + esc(v.desc) + ' <a href="verificacao.html#metodo">Como checamos</a></span></div>';
    }
    // Texto com intertítulos, listas, citações, negrito/itálico e links (util.bodyHTML escapa tudo).
    // Entrevista: parágrafos que começam com "P:" / "R:" viram pergunta e resposta.
    const bodyHTML = () => util.bodyHTML(n.body, { interview: kind === 'entrevista' });
    // Com vídeo do YouTube, o player toma o lugar da foto no topo (a foto segue nos cards e no compartilhamento)
    const mediaHTML = () => util.videoHTML(n) || '<img class="lead-img" fetchpriority="high" src="' + esc(util.imgSrc(n)) + '" alt="' + esc(n.title) + '">';
    function liveHTML() {
        if (kind !== 'aovivo') return '';
        const ups = (n.updates || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        const head = n.live
            ? '<div class="live-head">' + util.liveBadge() + '<span class="small" id="live-status" role="status">Atualizado automaticamente a cada 30 segundos.</span></div>'
            : '<div class="live-head"><span class="kind-badge">Cobertura encerrada</span></div>';
        return '<section class="live-feed" aria-labelledby="live-title"><h2 class="section-title" id="live-title">Atualizações (' + ups.length + ')</h2>' + head +
            '<ol class="live-list">' + ups.map(u => '<li><time datetime="' + esc(u.date) + '"><strong>' + esc(hm(u.date)) + '</strong><small>' + esc(dm(u.date)) + '</small></time>' +
                '<div><p class="mb-1" style="white-space:pre-wrap">' + esc(u.text) + '</p>' + (u.author ? '<small class="opacity-75">' + esc(u.author) + '</small>' : '') + '</div></li>').join('') +
            '</ol>' + (ups.length ? '' : '<p class="text-muted">A cobertura vai começar em instantes.</p>') + '</section>';
    }
    function timelineHTML() {
        const t = (n.timeline || []).filter(x => x && x.text);
        const p = (n.people || []).filter(x => x && x.name);
        if (!t.length && !p.length) return '';
        return '<div class="row g-4 my-2">' +
            (t.length ? '<section class="col-lg-7"><h2 class="section-title">Cronologia</h2><ol class="timeline">' + t.map(x => '<li><strong>' + esc(x.when) + '</strong><span>' + esc(x.text) + '</span></li>').join('') + '</ol></section>' : '') +
            (p.length ? '<section class="col-lg-5"><h2 class="section-title">Personagens envolvidos</h2><ul class="people-list">' + p.map(x => '<li><strong>' + esc(x.name) + '</strong>' + (x.role ? '<span>' + esc(x.role) + '</span>' : '') + '</li>').join('') + '</ul></section>' : '') +
            '</div>';
    }
    function sourcesHTML() {
        const s = (n.sources || []).filter(x => x && (x.label || x.url));
        if (!s.length) return '';
        return '<section class="article-extra"><h2 class="section-title">Fontes e referências</h2><ul class="sources-list">' + s.map(x => {
            const url = util.safeUrl(x.url), label = esc(x.label || x.url);
            return '<li>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow">' + label + '</a>' : label) + '</li>';
        }).join('') + '</ul></section>';
    }
    function correctionsHTML() {
        const c = (n.corrections || []).filter(x => x && x.text).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!c.length) return '';
        return '<section class="corrections-box"><h2 class="h6 text-uppercase fw-bold mb-2">Correções</h2><ul class="mb-1">' +
            c.map(x => '<li><strong>' + esc(util.fmtDate(x.date)) + ':</strong> ' + esc(x.text) + '</li>').join('') + '</ul>' +
            '<a class="small" href="institucional.html#correcoes">Conheça nossa política de correções</a></section>';
    }
    function authorBox() {
        const a = Authors.get(n.author);
        if (!a) return '';
        return '<aside class="author-box">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
            '<div><a class="fw-bold" href="' + esc(util.authorUrl(a.name)) + '">' + esc(a.name) + '</a>' + (a.role ? '<span class="d-block small opacity-75">' + esc(a.role) + '</span>' : '') +
            (a.bio ? '<p class="small mb-0 mt-1">' + esc(a.bio) + '</p>' : '') + '</div></aside>';
    }
    function meta() {
        // Assinatura de alguém da redação com conta no portal: selo do JB + link para o perfil
        const staff = Members.staffByName(n.author);
        const seal = staff ? ' <a href="' + esc(util.profileUrl(staff.id)) + '" class="text-decoration-none">' + util.sealHTML(staff.role) + '</a>' : '';
        return '<p class="meta-info">Por <a href="' + esc(util.authorUrl(n.author)) + '"><strong>' + esc(n.author) + '</strong></a>' + seal + ' • Publicado em ' + esc(util.fmtDate(n.date)) +
            (util.wasUpdated(n) ? ' • <span class="updated-at">Atualizado em ' + esc(util.fmtDate(n.updated_at)) + '</span>' : '') +
            ' • ' + util.readingTime(n) + ' min de leitura • ' + JB.Views.count(n.id) + ' leituras</p>';
    }

    box.innerHTML = previewNote() + util.badgesHTML(n) +
        util.catTag(n.category) +
        '<h1 class="article-title">' + esc(n.title) + '</h1><p class="lead">' + esc(n.subtitle) + '</p><div id="article-meta">' + meta() + '</div>' +
        '<div class="article-tools d-flex flex-wrap gap-2 mb-3 no-print">' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-fav"></button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-share">Compartilhar</button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-print">Imprimir</button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm" id="btn-read" aria-pressed="false">Modo leitura</button>' +
        '<span class="btn-group btn-group-sm" role="group" aria-label="Tamanho do texto"><button type="button" class="btn btn-outline-dark" data-a11y="font-" aria-label="Diminuir o texto">A−</button><button type="button" class="btn btn-outline-dark" data-a11y="font+" aria-label="Aumentar o texto">A+</button></span>' +
        '<span class="small align-self-center" id="share-msg" role="status"></span></div>' +
        kindNote() + verdictBox() +
        mediaHTML() +
        '<div class="article-body">' + bodyHTML() + '</div>' +
        '<div id="live-wrap">' + liveHTML() + '</div>' +
        util.chartHTML(n.chart) + timelineHTML() + sourcesHTML() + correctionsHTML() + authorBox() +
        '<p class="small text-muted mt-3">Conteúdo fictício, produzido para fins acadêmicos.</p>' +
        '<button type="button" class="btn btn-dark reading-exit" id="btn-read-exit">Sair do modo leitura</button>';
    if (JB.ui) JB.ui.paintA11y();

    /* Favoritar */
    const favBtn = document.getElementById('btn-fav');
    const paintFav = () => { const on = Favs.has(n.id); favBtn.textContent = on ? '★ Salvo nos favoritos' : '☆ Salvar para ler depois'; favBtn.classList.toggle('fav-active', on); favBtn.setAttribute('aria-pressed', on); };
    favBtn.addEventListener('click', () => { Favs.toggle(n.id); paintFav(); });
    paintFav();

    /* Compartilhar (API nativa quando existir; senão copia o link) */
    document.getElementById('btn-share').addEventListener('click', async () => {
        const msg = document.getElementById('share-msg');
        try {
            if (navigator.share) await navigator.share({ title: n.title, url: location.href });
            else { await navigator.clipboard.writeText(location.href); msg.textContent = 'Link copiado!'; }
        } catch (e) {
            if (e && e.name === 'AbortError') return;   // o leitor fechou a janela de compartilhar
            window.prompt('Copie o link da matéria:', location.href);
        }
    });
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    /* Modo leitura: esconde cabeçalho, rodapé e comentários; texto centralizado e maior */
    const readBtn = document.getElementById('btn-read');
    const setReading = on => {
        document.documentElement.classList.toggle('reading-mode', on);
        readBtn.setAttribute('aria-pressed', on);
        if (on) window.scrollTo({ top: box.offsetTop - 10 }); else readBtn.focus();
    };
    readBtn.addEventListener('click', () => setReading(!document.documentElement.classList.contains('reading-mode')));
    document.getElementById('btn-read-exit').addEventListener('click', () => setReading(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.documentElement.classList.contains('reading-mode')) setReading(false); });

    /* Cobertura ao vivo: relê a matéria a cada 30 s enquanto a aba estiver visível */
    if (kind === 'aovivo' && n.live && !preview) {
        let busy = false;
        setInterval(async () => {
            if (document.hidden || busy) return;
            busy = true;
            const before = (n.updates || []).length;
            const ok = await News.refresh(n.id);
            busy = false;
            const st = document.getElementById('live-status');
            if (!ok) { if (st) st.textContent = 'Sem conexão no momento; tentaremos de novo em 30 segundos.'; return; }
            const fresh = News.get(n.id);
            if (!fresh) return;
            n = fresh;
            const added = (n.updates || []).length - before;
            document.getElementById('live-wrap').innerHTML = liveHTML();
            document.getElementById('article-meta').innerHTML = meta();
            const st2 = document.getElementById('live-status');
            if (st2) st2.textContent = added > 0 ? added + (added === 1 ? ' nova atualização' : ' novas atualizações') + ' às ' + hm(new Date().toISOString()) + '.' : 'Atualizado às ' + hm(new Date().toISOString()) + '.';
        }, 30000);
    }

    /* Comentários (moderados pelo editor). Quem escreveu, logado, edita ou apaga o próprio comentário;
       coordenador/admin apaga qualquer um (também no painel). Quem confere é o banco (RLS). */
    const list = document.getElementById('comment-list');
    const me = Auth.current();
    let editing = null;   // id do comentário em edição
    const mine = c => !!me && !!c.userId && c.userId === me.id && Auth.accountOk();
    const renderComments = () => {
        const cs = Comments.forNews(n.id);
        document.getElementById('comment-count').textContent = cs.length;
        // Comentário de conta: nome leva ao perfil público; equipe da redação ganha o selo do JB
        const who = c => {
            if (!c.userId) return '<strong>' + esc(c.name) + '</strong>';
            const s = Members.staffById(c.userId);
            return '<a class="comment-author" href="' + esc(util.profileUrl(c.userId)) + '"><strong>' + esc(c.name) + '</strong></a>' + (s ? ' ' + util.sealHTML(s.role) : '');
        };
        const actions = c => {
            const b = [];
            if (mine(c) && Comments.canEdit()) b.push('<button type="button" class="btn btn-link btn-sm" data-cedit="' + esc(c.id) + '">Editar</button>');
            if (mine(c) || Auth.isEditor()) b.push('<button type="button" class="btn btn-link btn-sm text-danger" data-cdel="' + esc(c.id) + '"' + (mine(c) ? '' : ' title="Moderação"') + '>Excluir</button>');
            return b.length ? '<span class="comment-actions">' + b.join('') + '</span>' : '';
        };
        const body = c => editing === c.id
            ? '<form class="comment-edit" data-cform="' + esc(c.id) + '" method="post"><label class="visually-hidden" for="ce-' + esc(c.id) + '">Editar comentário</label>' +
              '<textarea class="form-control" id="ce-' + esc(c.id) + '" rows="3" maxlength="500" required>' + esc(c.text) + '</textarea>' +
              '<div class="d-flex gap-2 mt-2"><button class="btn btn-primary btn-sm" type="submit">Salvar</button><button class="btn btn-outline-dark btn-sm" type="button" data-ccancel>Cancelar</button></div></form>'
            : '<p class="comment-text">' + esc(c.text) + '</p>';
        list.innerHTML = cs.map(c => '<div class="comment" id="c-' + esc(c.id) + '"><div class="comment-head">' + who(c) + ' <small>• ' + esc(util.fmtDate(c.date)) +
            (c.editedAt ? ' <span class="comment-edited" title="Editado em ' + esc(util.fmtDate(c.editedAt)) + '">(editado)</span>' : '') + '</small>' + actions(c) + '</div>' + body(c) + '</div>').join('') ||
            '<p class="text-muted">Seja o primeiro a comentar.</p>';
        if (editing) { const ta = list.querySelector('[data-cform] textarea'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
    };
    list.addEventListener('click', async e => {
        const ed = e.target.closest('[data-cedit]'), del = e.target.closest('[data-cdel]'), cancel = e.target.closest('[data-ccancel]');
        if (ed) { editing = ed.dataset.cedit; renderComments(); }
        if (cancel) { editing = null; renderComments(); }
        if (del && confirm('Excluir este comentário? Não dá para desfazer.')) {
            Comments.remove(n.id, del.dataset.cdel); editing = null; renderComments();
            if (await JB.flush()) { const m = document.getElementById('comment-msg'); m.textContent = 'Comentário excluído.'; }
        }
    });
    list.addEventListener('submit', async e => {
        const f = e.target.closest('[data-cform]'); if (!f) return;
        e.preventDefault();
        const text = f.querySelector('textarea').value.trim();
        if (!text) { f.querySelector('textarea').focus(); return; }
        const cid = f.dataset.cform;
        if (!Comments.update(n.id, cid, text)) return;
        editing = null; renderComments();
        if (await JB.flush()) { document.getElementById('comment-msg').textContent = 'Comentário atualizado.'; const el = document.getElementById('c-' + cid); if (el) el.querySelector('[data-cedit]')?.focus(); }
    });
    const form = document.getElementById('comment-form');
    if (me) {   // logado: o comentário sai sempre com o nome da conta
        form.elements.name.value = me.name; form.elements.name.readOnly = true;
        document.getElementById('c-name-help').hidden = false;
        // Conta ainda não liberada (idade ou verificação em duas etapas): o banco recusaria o comentário
        if (!Auth.accountOk()) {
            form.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
            form.insertAdjacentHTML('afterbegin', '<p class="alert alert-warning small">Para comentar, conclua a <a href="seguranca.html?next=noticia.html">verificação da sua conta</a>.</p>');
        }
    }
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        Comments.add(n.id, { name: form.elements.name.value.trim(), text: form.elements.text.value.trim() });
        form.elements.text.value = ''; form.classList.remove('was-validated');
        renderComments();
    });
    document.getElementById('comments-wrap').hidden = false;
    list.innerHTML = util.loadingHTML('Carregando comentários…');
    let commentsOk = false;
    Comments.load(n.id).then(ok => { commentsOk = ok; if (ok) renderComments(); else list.innerHTML = util.errorHTML('Não foi possível carregar os comentários agora.'); });
    // Selos da equipe (assinatura e comentários): chegam depois, sem atrasar a leitura
    Members.loadStaff().then(ok => {
        if (!ok) return;
        const m = document.getElementById('article-meta'); if (m) m.innerHTML = meta();
        if (commentsOk) renderComments();
    });

    // Se o servidor recusar uma gravação, o cache é desfeito: redesenha o que pode ter mudado.
    document.addEventListener('jb:sync-error', () => { paintFav(); renderComments(); });

    /* Leia também: mesma editoria; em opinião/checagem, também o mesmo tipo de conteúdo */
    const sameKind = kind !== 'noticia' && kind !== 'reportagem' ? News.byKind(kind) : [];
    const seen = new Set([n.id]);
    const pool = sameKind.concat(News.byCategory(n.category)).filter(x => !seen.has(x.id) && seen.add(x.id));
    const more = pool.slice(0, 3);
    document.getElementById('related').innerHTML = more.map(x => '<div class="col-md-4">' + util.newsCard(x) + '</div>').join('');
    document.getElementById('related-wrap').hidden = !more.length;
});
