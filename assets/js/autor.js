/* Página de autor (pages/autor.html?nome=...) e, sem ?nome, a lista da equipe e dos colunistas.
   Nomes comparados sem diferenciar maiúsculas. Quem assina e tem conta da equipe aparece com o
   cargo e o selo (e o link para o perfil), nunca como "Colaborador" a mais em "Outras assinaturas". */
JB.ready.then(function () {
    'use strict';
    const { News, Authors, Members, util } = JB;
    const { esc } = util;
    const box = document.getElementById('author-page');
    if (JB.loadError) { box.innerHTML = util.errorHTML(); return; }
    const name = new URLSearchParams(location.search).get('nome');
    const avatar = (a, cls) => util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, cls || 'avatar-lg');
    const count = nm => News.byAuthor(nm).length;
    const authorByName = nm => Authors.get(nm) || Authors.all().find(a => util.sameName(a.name, nm)) || null;
    const plural = (n, one, many) => n + (n === 1 ? one : many);

    if (name) {
        const a = authorByName(name);
        const list = News.byAuthor(name), edited = News.byCredit(name).filter(n => !list.includes(n));
        if (!a && !list.length && !edited.length) {
            // Pode ser alguém da equipe que ainda não assinou nada: procura a conta antes de desistir
            box.innerHTML = util.loadingHTML('Procurando…');
            Members.loadStaff().then(() => {
                const s = Members.staffByName(name);
                if (s) location.replace(util.profileUrl(s.id));
                else box.innerHTML = '<div class="alert alert-warning">Autor não encontrado. <a href="autor.html">Ver a equipe</a>.</div>';
            });
            return;
        }
        const p = a || { name: list.length ? (util.bylineNames(list[0]).find(x => util.sameName(x, name)) || name) : name, role: 'Colaborador', bio: '' };
        document.title = p.name + ' — Jornal Brasileiro (JB)';
        const cards = l => l.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('');
        box.innerHTML = '<nav class="small mb-3"><a href="autor.html">← Equipe e colunistas</a></nav>' +
            '<header class="author-header"><span id="author-avatar">' + avatar(p) + '</span><div><h1 class="page-title border-0 mb-1">' + esc(p.name) + '<span id="author-seal">' + (a && a.official ? ' ' + util.officialSealHTML(a) : '') + '</span></h1>' +
            '<p class="mb-1 fw-semibold" id="author-role">' + esc(p.role) + (a && a.columnist ? ' · <span class="kind-badge kind-opiniao">Colunista</span>' : '') + '</p>' +
            (p.bio ? '<p class="mb-1">' + esc(p.bio) + '</p>' : '') + '<p class="small text-muted mb-0">' + plural(list.length, ' publicação', ' publicações') +
            (edited.length ? ' · ' + plural(edited.length, ' edição', ' edições') : '') + '</p><p class="small mb-0" id="author-profile"></p></div></header>' +
            '<hr class="editorial-divider"><div class="row g-4">' + (cards(list) ||
                '<div class="col-12"><div class="alert alert-secondary">Nenhuma publicação assinada ainda.</div></div>') + '</div>' +
            (edited.length ? '<h2 class="section-title mt-4">Edição</h2><p class="small text-muted">Matérias em que ' + esc(p.name) + ' aparece no crédito de edição.</p><div class="row g-4">' + cards(edited) + '</div>' : '');
        // Assinatura de alguém da equipe com conta no portal: cargo, selo e link para o perfil
        Members.loadStaff().then(() => {
            const s = Members.staffByName(name);
            if (!s || !util.isStaffRole(s.role)) return;
            document.getElementById('author-seal').innerHTML = ' <a href="' + esc(util.profileUrl(s.id)) + '" class="text-decoration-none" title="Ver perfil">' + util.sealHTML(s.role) + '</a>';
            if (!a) {
                document.getElementById('author-role').textContent = util.roleLabel(s.role) + (s.role === 'professor' ? ' do JB Educa' : ' do JB');
                if (s.avatar) document.getElementById('author-avatar').innerHTML = util.avatarHTML(s, 'avatar-lg');
            }
            document.getElementById('author-profile').innerHTML = '<a href="' + esc(util.profileUrl(s.id)) + '">Ver o perfil de ' + esc(s.name) + '</a>';
        });
        return;
    }

    // Lista da equipe: colunistas, redação, contas da equipe e quem assina sem cadastro
    const all = Authors.all();
    const card = a => '<div class="col-sm-6 col-lg-4"><a class="team-card" href="' + esc(util.authorUrl(a.name)) + '">' + avatar(a, 'avatar-md') +
        '<span><strong>' + esc(a.name) + (a.official ? ' ' + util.officialSealHTML(a) : '') + '</strong><small>' + esc(a.role || 'Colaborador') + '</small><small class="opacity-75">' + plural(count(a.name), ' publicação', ' publicações') + '</small></span></a></div>';
    const group = (title, list) => list.length ? '<section class="mb-4"><h2 class="section-title">' + title + '</h2><div class="row g-3">' + list.map(card).join('') + '</div></section>' : '';
    box.innerHTML = '<h1 class="page-title">Equipe e colunistas</h1><p class="page-lead">Jornalistas, editores, professores e colunistas do Jornal Brasileiro. As assinaturas de exemplo são personagens fictícios do projeto acadêmico. Veja também o <a href="institucional.html#expediente">expediente</a>.</p>' +
        '<div id="staff-section"></div>' +
        group('Colunistas', all.filter(a => a.columnist)) + group('Redação', all.filter(a => !a.columnist)) +
        '<div id="others-section">' + util.loadingHTML('Carregando as assinaturas…') + '</div>' +
        (all.length ? '' : '<div class="alert alert-secondary" id="no-authors">Nenhum autor cadastrado ainda.</div>');

    // Contas do portal com o selo do JB, em seções separadas: coordenação (admin e coordenadores),
    // jornalistas, professores do JB Educa e quem tem selo de perfil (colaboradores, apoiadores…)
    Members.loadStaff().then(ok => {
        const people = ok ? Members.staff() : [];
        const pcard = (p, sub) => '<div class="col-sm-6 col-lg-4"><a class="team-card" href="' + esc(util.profileUrl(p.id)) + '">' + util.avatarHTML(p, 'avatar-md') +
            '<span><strong>' + esc(p.name) + ' ' + util.sealHTML(p.role) + '</strong><small>' + esc(sub(p)) + '</small>' +
            ((p.badges || []).length ? '<small class="team-card-badges">' + util.profileBadgesHTML(p.badges) + '</small>' : '') + '</span></a></div>';
        const pgroup = (title, lead, list, sub) => list.length ? '<section class="mb-4"><h2 class="section-title">' + title + '</h2>' + (lead ? '<p class="small text-muted">' + lead + '</p>' : '') +
            '<div class="row g-3">' + list.map(p => pcard(p, sub)).join('') + '</div></section>' : '';
        const roleSub = p => util.roleLabel(p.role) + (p.role === 'professor' ? ' do JB Educa' : ' do JB');
        document.getElementById('staff-section').innerHTML =
            pgroup('Coordenação da redação', 'Publicam as matérias, moderam o portal e coordenam a equipe.', people.filter(p => p.role === 'admin' || p.role === 'coordenador'), roleSub) +
            pgroup('Jornalistas', 'Apuram e escrevem as matérias; a publicação passa pela coordenação.', people.filter(p => p.role === 'jornalista'), roleSub) +
            pgroup('Professores do JB Educa', 'Preparam as aulas e os exercícios do JB Educa.', people.filter(p => p.role === 'professor'), roleSub) +
            pgroup('Colaboradores e apoiadores', '', people.filter(p => !util.isStaffRole(p.role) && (p.badges || []).length), p => p.badges.map(b => JB.BADGES[b] ? JB.BADGES[b].label : b).join(' · '));
        // Outras assinaturas: nomes que não são autores cadastrados nem contas da equipe (convidados, núcleos sem cadastro)
        const isKnown = nm => !!authorByName(nm) || people.some(p => util.isStaffRole(p.role) && util.sameName(p.name, nm));
        const others = [];
        News.published().forEach(n => util.bylineNames(n).forEach(nm => { if (!isKnown(nm) && !others.some(x => util.sameName(x, nm))) others.push(nm); }));
        others.sort((x, y) => x.localeCompare(y, 'pt-BR'));
        document.getElementById('others-section').innerHTML = group('Outras assinaturas', others.map(nm => ({ name: nm, role: 'Colaborador convidado' })));
        const none = document.getElementById('no-authors'); if (none && (people.length || others.length)) none.remove();
    });
});
