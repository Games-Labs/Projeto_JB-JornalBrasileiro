/* Perfil público: pages/perfil-publico.html?id=<conta>
   Mostra só o que é público: nome, foto, minibiografia, cargo e data de entrada (nunca e-mail,
   cidade ou interesses — a função public_profile do banco nem devolve esses campos).
   Equipe da redação (admin, coordenador, jornalista) ganha o selo do JB e a lista de matérias. */
JB.ready.then(async function () {
    'use strict';
    const { News, Comments, Members, Auth, util } = JB;
    const { esc } = util;
    const box = document.getElementById('public-profile');
    if (JB.loadError) { box.innerHTML = util.errorHTML(); return; }

    const id = new URLSearchParams(location.search).get('id') || '';
    const p = id ? await Members.profile(id) : null;
    if (p === undefined) { box.innerHTML = util.errorHTML('Não foi possível carregar este perfil agora.'); return; }
    if (!p) { box.innerHTML = '<div class="alert alert-warning">Perfil não encontrado. <a href="autor.html">Ver a equipe do JB</a>.</div>'; return; }

    document.title = p.name + ' — Jornal Brasileiro (JB)';
    const staff = util.isStaffRole(p.role);
    const me = Auth.current();
    const own = !!me && me.id === p.id;
    const since = p.created ? new Date(p.created).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '';
    // Matérias publicadas criadas por esta conta ou assinadas com o nome dela
    const news = staff ? News.all().filter(n => n.created_by === p.id || n.author === p.name) : [];

    box.innerHTML =
        '<header class="profile-hero' + (staff ? ' is-staff' : '') + '">' + util.avatarHTML(p, 'avatar-lg') +
        '<div class="min-w-0"><h1 class="page-title border-0 mb-1">' + esc(p.name) + (staff ? ' ' + util.sealHTML(p.role) : '') + '</h1>' +
        '<p class="mb-2 fw-semibold profile-role">' + (staff ? esc(util.roleLabel(p.role)) + ' do Jornal Brasileiro' : 'Leitor do Jornal Brasileiro') + '</p>' +
        (p.bio ? '<p class="mb-2 profile-bio">' + esc(p.bio) + '</p>' : (own ? '<p class="mb-2 small text-muted">Você ainda não escreveu uma minibiografia.</p>' : '')) +
        '<p class="small text-muted mb-0">' + (since ? 'Membro desde ' + esc(since) : '') + (own ? ' · <a href="perfil.html">Editar meu perfil</a>' : '') + '</p></div></header>' +
        (staff ? '<p class="seal-note small">' + util.sealHTML(p.role) + ' O selo identifica contas da equipe da redação do Jornal Brasileiro. Ele é dado pelo próprio jornal e não pode ser solicitado.</p>' : '') +
        (staff ? '<section class="mb-4"><h2 class="section-title">Matérias publicadas</h2><div class="row g-4">' +
            (news.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('') || '<div class="col-12"><p class="text-muted mb-0">Nenhuma matéria publicada ainda.</p></div>') +
            '</div></section>' : '') +
        '<section><h2 class="section-title">Comentários recentes</h2><div id="profile-comments">' + util.loadingHTML('Carregando comentários…') + '</div></section>';

    const cs = await Comments.byUser(p.id);
    const out = document.getElementById('profile-comments');
    if (!cs) { out.innerHTML = util.errorHTML('Não foi possível carregar os comentários agora.'); return; }
    const items = cs.map(c => ({ c, n: News.get(c.newsId) })).filter(x => x.n && util.isPublished(x.n));
    out.innerHTML = items.length
        ? '<ul class="profile-comments">' + items.map(x => '<li><p class="mb-1" style="white-space:pre-wrap">' + esc(x.c.text) + '</p>' +
            '<small class="text-muted">' + esc(util.fmtDate(x.c.date)) + ' · em <a href="' + esc(util.articleUrl(x.n)) + '">' + esc(x.n.title) + '</a></small></li>').join('') + '</ul>'
        : '<p class="text-muted mb-0">' + (own ? 'Você ainda não comentou nenhuma matéria.' : 'Nenhum comentário ainda.') + '</p>';
});
