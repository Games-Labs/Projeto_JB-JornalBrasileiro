/* Painel Administrativo: uma página por função, com o mesmo menu lateral.
     admin.html              Visão geral (números, visitantes do site, pendências)
     admin-materias.html     Matérias (fluxo editorial, agendamento, versões; escrever = editor.html)
     admin-autores.html      Autores (coordenação)
     admin-audiencia.html    Audiência e visitas
     admin-comentarios.html  Moderação de comentários (coordenação)
     admin-denuncias.html    Denúncias (coordenação)
     admin-equipe.html       Equipe, cargos e selos de perfil (coordenação)
     admin-selos-tags.html   Catálogo de selos e tags (coordenação)
     admin-seguranca.html    Lockdown, proteções, MFA da equipe, push e auditoria (coordenação)
   Cada página diz qual é em <body data-admin="...">. O que cada cargo vê depende de JB.Auth (admin,
   coordenador, jornalista, professor). Esconder partes aqui é só interface: quem impede um jornalista
   de publicar, ou um leitor de ler denúncias, são as políticas RLS e as funções do Supabase. */
JB.authReady.then(function () {
    'use strict';
    const { News, Reports, Authors, Versions, Auth, Members, Tags, Badges, STATUS, STATUS_FLOW, DIVISIONS, util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);
    const section = document.body.dataset.admin || 'geral';
    const here = (location.pathname.split('/').pop() || 'admin.html').replace(/^([\w-]+)$/, '$1.html');

    // Endereço antigo do aviso de lockdown (admin.html#seguranca)
    if (section === 'geral' && location.hash === '#seguranca') { location.replace('admin-seguranca.html'); return; }

    if (!Auth.isStaff()) {
        $('admin-loading').hidden = true; $('gate').hidden = false;
        $('gate').querySelector('a').href = 'login.html?next=' + encodeURIComponent(here);
        // Da equipe, mas a conta ainda não está liberada nesta sessão (idade ou verificação em duas etapas)
        if (util.isStaffRole(Auth.realRole())) {
            const st = Auth.mfaState();
            $('gate').innerHTML = '<h1 class="h3">Falta um passo</h1><p>' + esc(!Auth.ageOk() ? 'Confirme sua idade para liberar a conta.'
                : st === 'challenge' ? 'Digite o código do app autenticador para usar o painel.'
                : 'A equipe só usa o painel com a verificação em duas etapas ativada. Ative agora com um app autenticador (leva um minuto).') +
                '</p><a class="btn btn-primary" href="seguranca.html?next=' + encodeURIComponent(here) + '">Continuar</a>';
        }
        return;
    }
    const me = Auth.current();
    const editor = Auth.isEditor();                     // coordenador ou admin
    const allowedStatuses = Auth.allowedStatuses();     // jornalista/professor: rascunho, revisão, aprovada
    const msg = $('admin-msg');
    const note = (t, type) => { msg.className = 'alert alert-' + (type || 'success'); msg.textContent = t; msg.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => { msg.hidden = true; }, 4500); };
    const opts = (obj, label) => Object.keys(obj).map(k => '<option value="' + k + '">' + esc(label ? label(obj[k]) : obj[k]) + '</option>').join('');
    const nowIso = () => new Date().toISOString();
    const hm = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const editUrl = n => 'editor.html?id=' + encodeURIComponent(n.id);
    const failed = t => util.errorHTML('Não foi possível carregar ' + t + ' agora.');
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    /* ---------- Menu lateral ---------- */
    const ICO = {
        geral: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
        materias: '<path d="M5 3.5h10l4 4v13H5z"/><path d="M14.5 3.5v4.5H19M8.5 12h7M8.5 16h7"/>',
        escrever: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 7 3 3"/>',
        autores: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
        selos: '<path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6z"/><path d="M9.5 10.5h5M9.5 14h5"/>',
        audiencia: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
        comentarios: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
        denuncias: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
        equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
        seguranca: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
    };
    // [id, endereço, nome, só coordenação]
    const NAV = [
        ['Redação', [['geral', 'admin.html', 'Visão geral'], ['materias', 'admin-materias.html', 'Matérias'], ['escrever', 'editor.html' + (Auth.role() === 'professor' ? '?divisao=educa' : ''), Auth.role() === 'professor' ? 'Novo material' : 'Escrever matéria']]],
        ['Conteúdo', [['autores', 'admin-autores.html', 'Autores', true], ['selos', 'admin-selos-tags.html', 'Selos e tags', true]]],
        ['Público', [['audiencia', 'admin-audiencia.html', 'Audiência e visitas'], ['comentarios', 'admin-comentarios.html', 'Comentários', true], ['denuncias', 'admin-denuncias.html', 'Denúncias', true]]],
        ['Administração', [['equipe', 'admin-equipe.html', 'Equipe e cargos', true], ['seguranca', 'admin-seguranca.html', 'Segurança', true]]]
    ];
    const ico = k => '<svg class="admin-nav-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICO[k] + '</svg>';
    $('admin-nav').innerHTML = '<div class="admin-nav-who">' + util.avatarHTML(me, 'avatar-sm') + '<span><strong>' + esc(me.name) + '</strong><small>' + esc(util.roleLabel(me.role)) + ' ' + util.sealHTML(me.role) + '</small></span></div>' +
        NAV.map(g => {
            const items = g[1].filter(i => !i[3] || editor);
            return items.length ? '<p class="admin-nav-group">' + g[0] + '</p><ul>' + items.map(i => '<li><a href="' + i[1] + '"' + (i[0] === section ? ' aria-current="page" class="active"' : '') + '>' + ico(i[0]) + '<span>' + i[2] + '</span>' +
                (i[0] === 'materias' || i[0] === 'denuncias' || i[0] === 'comentarios' ? '<span class="admin-nav-count" data-count="' + i[0] + '"></span>' : '') + '</a></li>').join('') + '</ul>' : '';
        }).join('');
    const navCount = (k, n) => { const el = document.querySelector('[data-count="' + k + '"]'); if (el) el.textContent = n ? String(n) : ''; };

    const ROLE_NOTES = {
        admin: 'Acesso total à redação. Coordenadores, jornalistas e professores são definidos em “Equipe e cargos”.',
        coordenador: 'Você publica, arquiva e corrige matérias e materiais do JB Educa, modera comentários, lê denúncias, gerencia selos e tags e coloca ou tira jornalistas e professores.',
        jornalista: 'Você cria e edita as suas matérias até “Aprovada”; quem publica é um coordenador. As matérias dos colegas aparecem só para leitura.',
        professor: 'Você cria e edita os seus materiais do JB Educa (aulas e exercícios) até “Aprovada”; quem publica é um coordenador.'
    };
    const roleNote = $('role-note');
    if (roleNote) roleNote.innerHTML = util.sealHTML(me.role) + ' Você entrou como <strong>' + esc(util.roleLabel(me.role)) + '</strong>. ' + esc(ROLE_NOTES[me.role] || '');

    // Página só da coordenação aberta por jornalista/professor
    const EDITOR_ONLY = ['autores', 'selos', 'comentarios', 'denuncias', 'equipe', 'seguranca'];
    const blocked = EDITOR_ONLY.includes(section) && !editor;

    // Cargo trocado (ou conta removida da equipe) por outra pessoa enquanto o painel está aberto:
    // confere de novo ao voltar para a aba e a cada minuto, e recarrega se o acesso mudou.
    const recheck = async () => {
        if (document.hidden) return;
        await Auth.refresh();
        if (!Auth.isStaff() || Auth.isEditor() !== editor) location.reload();
    };
    window.addEventListener('focus', recheck);
    setInterval(recheck, 60000);

    // Reduz a foto (autor) no navegador antes de enviar: WebP, ou JPEG se o navegador não gerar WebP
    function resize(file, max) {
        return new Promise((resolve, reject) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                const fail = () => reject(new Error('Não foi possível processar a imagem.'));
                c.toBlob(b => { if (b && b.type === 'image/webp') resolve(b); else c.toBlob(j => j ? resolve(j) : fail(), 'image/jpeg', 0.82); }, 'image/webp', 0.82);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esse arquivo como imagem.')); };
            img.src = url;
        });
    }

    /* =====================================================================
       Números gerais (Visão geral) e visitantes (Visão geral e Audiência)
       ===================================================================== */
    const statusOf = n => util.isScheduled(n) ? 'agendada' : (n.status || 'publicada');
    const producing = n => ['rascunho', 'revisao', 'aprovada'].includes(n.status);
    const loaded = { comments: false, reports: false, newsletter: false };
    function renderStats() {
        const box = $('stats'); if (!box) return;
        const list = News.everything();
        const v = (key, n) => loaded[key] ? n : '…';
        const card = (label, value, href) => '<div class="col-6 col-md-4 col-xl"><' + (href ? 'a href="' + href + '"' : 'div') + ' class="stat-card"><strong>' + value + '</strong><span>' + label + '</span></' + (href ? 'a' : 'div') + '></div>';
        const cards = [
            card('Publicadas', list.filter(util.isPublished).length, 'admin-materias.html?status=publicada'),
            card('Em produção', list.filter(producing).length, 'admin-materias.html?status=producao'),
            card('Agendadas', list.filter(util.isScheduled).length, 'admin-materias.html?status=agendada'),
            card('Ao vivo', list.filter(n => n.kind === 'aovivo' && n.live && util.isPublished(n)).length, 'admin-materias.html?kind=aovivo')
        ].concat(editor
            ? [card('Denúncias', v('reports', Reports.all().length), 'admin-denuncias.html'), card('Comentários', v('comments', JB.Comments.flat().length), 'admin-comentarios.html'),
                card('Leituras', JB.Views.total(), 'admin-audiencia.html'), card('Newsletter', v('newsletter', JB.Newsletter.count()))]
            : [card('Minhas em produção', list.filter(n => producing(n) && Auth.isOwnNews(n)).length, 'admin-materias.html?mine=1&status=producao'),
                card('Aguardando publicação', list.filter(n => n.status === 'aprovada' && Auth.isOwnNews(n)).length, 'admin-materias.html?mine=1&status=aprovada'), card('Leituras', JB.Views.total(), 'admin-audiencia.html')]);
        box.innerHTML = cards.join('');
    }
    function renderTodo() {
        const box = $('todo-list'); if (!box) return;
        const list = News.everything(), items = [];
        const item = (n, text, href) => { if (n) items.push('<li><a href="' + href + '"><strong>' + n + '</strong> ' + esc(text) + '</a></li>'); };
        if (editor) {
            item(list.filter(n => n.status === 'aprovada').length, 'aprovada(s) esperando publicação', 'admin-materias.html?status=aprovada');
            item(list.filter(n => n.status === 'revisao').length, 'em revisão', 'admin-materias.html?status=revisao');
            if (loaded.reports) item(Reports.all().length, 'denúncia(s) recebida(s)', 'admin-denuncias.html');
        } else {
            item(list.filter(n => Auth.isOwnNews(n) && n.status === 'rascunho').length, 'rascunho(s) seus', 'admin-materias.html?mine=1&status=rascunho');
            item(list.filter(n => Auth.isOwnNews(n) && n.status === 'revisao').length, 'sua(s) em revisão', 'admin-materias.html?mine=1&status=revisao');
            item(list.filter(n => Auth.isOwnNews(n) && n.status === 'aprovada').length, 'sua(s) aguardando a coordenação', 'admin-materias.html?mine=1&status=aprovada');
        }
        item(list.filter(util.isScheduled).length, 'agendada(s)', 'admin-materias.html?status=agendada');
        box.innerHTML = items.join('') || '<li class="text-muted">Nada pendente agora.</li>';
    }
    // Visitantes: páginas vistas (sempre) e visitantes diferentes por dia (só de quem aceitou "Estatísticas")
    async function renderVisits() {
        const box = $('visits-chart'); if (!box) return;
        const days = Number(($('visits-range') || {}).value) || 30;
        box.innerHTML = util.loadingHTML('Carregando visitas…');
        const ok = await JB.Visits.load(days);
        if (!ok) { box.innerHTML = failed('as visitas'); $('visits-summary').innerHTML = ''; return; }
        const rows = JB.Visits.list(days);
        const sum = k => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
        const today = rows[rows.length - 1] || { views: 0, visitors: 0 };
        const fmt = n => Number(n).toLocaleString('pt-BR');
        $('visits-summary').innerHTML = [['Visitantes hoje', today.visitors], ['Páginas vistas hoje', today.views], ['Visitantes em ' + days + ' dias', sum('visitors')], ['Páginas vistas em ' + days + ' dias', sum('views')]]
            .map(c => '<div class="visits-num"><strong>' + fmt(c[1]) + '</strong><span>' + esc(c[0]) + '</span></div>').join('');
        const label = d => d.slice(8, 10) + '/' + d.slice(5, 7);
        if (!sum('views')) { box.innerHTML = '<p class="text-muted small mb-0">Ainda sem visitas registradas neste período.</p>'; return; }
        box.innerHTML = util.chartHTML({ type: days <= 14 ? 'column' : 'area', title: 'Visitantes por dia', unit: 'visitantes', items: rows.map(r => ({ label: label(r.day), value: r.visitors })) }) +
            util.chartHTML({ type: days <= 14 ? 'column' : 'line', title: 'Páginas vistas por dia', unit: 'páginas', items: rows.map(r => ({ label: label(r.day), value: r.views })) });
    }
    if ($('visits-range')) $('visits-range').addEventListener('change', renderVisits);

    /* =====================================================================
       Matérias
       ===================================================================== */
    function initNews() {
        const tbody = $('news-rows');
        const params = new URLSearchParams(location.search);
        const isNav = (p, v) => params.get(p) === v;
        $('news-status').innerHTML += opts(STATUS) + '<option value="agendada">Agendada</option><option value="producao">Em produção (rascunho, revisão, aprovada)</option>';
        $('news-kind').innerHTML += Object.keys(DIVISIONS).map(d => '<optgroup label="' + esc(DIVISIONS[d].name) + '">' + opts(DIVISIONS[d].kinds) + '</optgroup>').join('');
        $('news-division').innerHTML += opts(DIVISIONS, d => d.name);
        $('news-mine').checked = !editor || isNav('mine', '1');
        if (params.get('status')) $('news-status').value = params.get('status');
        if (params.get('kind')) $('news-kind').value = params.get('kind');
        if (params.get('divisao')) $('news-division').value = params.get('divisao');
        if (Auth.role() === 'professor') { $('new-news-btn').href = 'editor.html?divisao=educa'; $('new-news-btn').textContent = '+ Novo material'; }

        const nextOf = n => { const i = STATUS_FLOW.indexOf(n.status || 'publicada'); return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : ''; };
        // Próximo passo do fluxo permitido para quem está logado (jornalista/professor para em "Aprovada")
        const canAdvance = n => { const nx = nextOf(n); return !!nx && Auth.canEditNews(n) && allowedStatuses.includes(nx); };
        const canSeeVersions = n => editor || Auth.isOwnNews(n);
        function statusBadge(n) {
            if (util.isScheduled(n)) return '<span class="badge status-badge bg-info text-dark" title="Publica em ' + esc(util.fmtDate(n.date)) + '">Agendada · ' + esc(hm(n.date)) + '</span>';
            return '<span class="badge status-badge ' + (util.isPublished(n) ? 'bg-success' : 'bg-secondary') + '">' + esc(STATUS[n.status || 'publicada']) + '</span>';
        }
        function renderNews() {
            const all = News.everything();
            const q = $('news-q').value.trim().toLowerCase(), st = $('news-status').value, kd = $('news-kind').value, dv = $('news-division').value, mine = $('news-mine').checked;
            const list = all.filter(n => (!q || (n.title + ' ' + util.bylineNames(n).join(' ') + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(q)) &&
                (!st || (st === 'producao' ? producing(n) : statusOf(n) === st)) && (!kd || (n.kind || 'noticia') === kd) && (!dv || util.divisionOf(n) === dv) && (!mine || Auth.isOwnNews(n)));
            tbody.innerHTML = list.map(n =>
                '<tr><td><img class="admin-thumb" src="' + esc(util.imgSrc(n)) + '" alt="" loading="lazy"></td>' +
                '<td><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a>' + (n.featured ? ' <span class="badge bg-primary">Manchete</span>' : '') + (util.divisionOf(n) === 'educa' ? ' <span class="badge division-badge-educa">JB Educa</span>' : '') +
                (n.video ? ' <span class="badge text-bg-dark">Vídeo</span>' : '') + (Auth.isOwnNews(n) ? ' <span class="badge mine-badge">Sua</span>' : '') + (util.newsBadgesHTML(n) ? ' ' + util.newsBadgesHTML(n) : '') +
                '<div class="small opacity-75">' + esc(util.kindLabel(n.kind || 'noticia')) + (n.kind === 'aovivo' && n.live ? ' · ao vivo' : '') + ' · ' + esc(util.bylineNames(n).join(', ')) + (util.wasUpdated(n) ? ' · atualizada ' + esc(hm(n.updated_at)) : '') + '</div></td>' +
                '<td>' + esc(util.catLabel(n.category)) + '</td>' +
                '<td>' + statusBadge(n) + '</td>' +
                '<td class="text-nowrap">' + new Date(n.date).toLocaleDateString('pt-BR') + '</td>' +
                '<td><div class="d-flex flex-wrap gap-1">' + (canAdvance(n) ? '<button class="btn btn-sm btn-primary" data-adv="' + esc(n.id) + '" title="Mover para: ' + esc(STATUS[nextOf(n)]) + '">→ ' + esc(STATUS[nextOf(n)]) + '</button>' : '') +
                (Auth.canEditNews(n) ? '<a class="btn btn-sm btn-outline-dark" href="' + esc(editUrl(n)) + '">Editar</a>'
                    : '<a class="btn btn-sm btn-outline-dark" href="' + esc(util.articleUrl(n)) + '" title="Somente leitura">Ver</a>') +
                (canSeeVersions(n) ? '<button class="btn btn-sm btn-outline-dark" data-hist="' + esc(n.id) + '">Versões</button>' : '') +
                (editor ? '<button class="btn btn-sm btn-outline-primary" data-del="' + esc(n.id) + '">Excluir</button>' : '') + '</div></td></tr>').join('') ||
                '<tr><td colspan="6" class="text-center text-muted">' + (all.length ? 'Nenhuma matéria neste filtro.' : 'Nenhuma notícia cadastrada.') + '</td></tr>';
            $('news-count').textContent = list.length === all.length ? plural(all.length, 'matéria', 'matérias') : list.length + ' de ' + all.length + ' matérias';
            navCount('materias', all.length);
        }
        ['news-q', 'news-status', 'news-kind', 'news-division', 'news-mine'].forEach(id => $(id).addEventListener('input', renderNews));

        tbody.addEventListener('click', async e => {
            const del = e.target.closest('[data-del]'), adv = e.target.closest('[data-adv]'), hist = e.target.closest('[data-hist]');
            if (adv) {
                const n = News.get(adv.dataset.adv);
                if (!n || !canAdvance(n)) return;
                const next = STATUS_FLOW[STATUS_FLOW.indexOf(n.status || 'publicada') + 1];
                const patch = { id: n.id, status: next };
                // Ao publicar: vale a data agendada (se for futura); senão, publica agora.
                if (next === 'publicada' && !(new Date(n.date) > Date.now())) patch.date = nowIso();
                News.save(patch); renderNews();
                if (await JB.flush()) { const s = News.get(n.id); note('“' + n.title + '” movida para: ' + (s && util.isScheduled(s) ? 'Publicada (agendada para ' + util.fmtDate(s.date) + ')' : STATUS[next]) + '.'); }
            }
            if (hist) openVersions(hist.dataset.hist);
            if (del && editor && confirm('Excluir esta notícia? As versões anteriores também serão apagadas.')) { News.remove(del.dataset.del); renderNews(); if (await JB.flush()) note('Notícia excluída.', 'warning'); }
        });

        /* Versões */
        const versionsModal = bootstrap.Modal.getOrCreateInstance($('versionsModal'));
        const vbody = $('versions-body');
        let versionsOf = null;
        async function openVersions(id) {
            versionsOf = id;
            const n = News.get(id);
            $('versionsTitle').textContent = 'Versões — ' + (n ? n.title : '');
            vbody.innerHTML = util.loadingHTML('Carregando versões…');
            versionsModal.show();
            const ok = await Versions.load(id);
            if (versionsOf !== id) return;
            if (!ok) { vbody.innerHTML = util.errorHTML('Não foi possível carregar as versões agora.'); return; }
            const list = Versions.forNews(id);
            vbody.innerHTML = '<p class="small text-muted">A cada edição do conteúdo, a versão anterior é guardada (até 20). Restaurar uma versão cria uma nova edição, e a atual também fica guardada.</p>' +
                (list.map(v => {
                    const s = v.snapshot || {};
                    const credits = util.creditNames(s);
                    return '<div class="panel-box mb-3"><div class="d-flex flex-wrap justify-content-between gap-2"><span class="small">Substituída em <strong>' + esc(util.fmtDate(v.replacedAt)) + '</strong>' + (v.replacedBy ? ' por ' + esc(v.replacedBy) : '') + '</span>' +
                        (Auth.canEditNews(n) ? '<button class="btn btn-sm btn-outline-dark" data-restore="' + esc(v.id) + '">Restaurar esta versão</button>' : '') + '</div>' +
                        '<h3 class="h6 mt-2 mb-1">' + esc(s.title) + '</h3><p class="small mb-1">' + esc(s.subtitle) + '</p>' +
                        '<p class="small opacity-75 mb-0">' + esc(util.kindLabel(s.kind)) + ' · ' + esc(util.catLabel(s.category)) + ' · ' + util.bylineHTML(s) + (credits.length ? ' · Edição: ' + esc(credits.join(', ')) : '') + ' · ' + (s.body || []).length + ' blocos de texto' + (s.video ? ' · com vídeo' : '') + '</p>' +
                        '<details class="small mt-1"><summary>Ver texto</summary><div class="article-body version-body">' + util.bodyHTML(s.body || []) + '</div></details></div>';
                }).join('') || '<p class="text-muted">Nenhuma versão anterior: esta matéria ainda não foi editada depois de criada.</p>');
        }
        vbody.addEventListener('click', async e => {
            const b = e.target.closest('[data-restore]'); if (!b || !versionsOf) return;
            const v = Versions.forNews(versionsOf).find(x => String(x.id) === b.dataset.restore);
            if (!v || !confirm('Restaurar esta versão? O conteúdo atual será guardado como versão anterior.')) return;
            const patch = Object.assign({ id: versionsOf }, v.snapshot);
            // Campo que não existia na versão antiga volta vazio (inclui video = '')
            const LISTS = ['body', 'sources', 'timeline', 'people', 'coauthors', 'edit_credits'];
            JB.VERSIONED.forEach(k => { if (!(k in patch)) patch[k] = k === 'chart' || k === 'verdict' ? null : (LISTS.includes(k) ? [] : ''); });
            if (!Array.isArray(patch.coauthors)) patch.coauthors = [];
            News.save(patch);
            const ok = await JB.flush();
            versionsModal.hide(); renderNews();
            if (ok) note('Versão restaurada.');
        });
        document.addEventListener('jb:sync-error', renderNews);
        renderNews();
    }

    /* =====================================================================
       Autores
       ===================================================================== */
    function initAuthors() {
        const aform = $('author-form');
        const af = n => aform.elements[n];
        let uploading = false;
        const usedBy = name => News.everything().filter(n => util.sameName(n.author, name) || (n.coauthors || []).some(c => util.sameName(c, name)));
        const avatarPrev = () => { $('au-avatar-preview').innerHTML = util.avatarHTML({ name: af('name').value || '?', avatar: af('avatar').value ? util.imgSrc({ image: af('avatar').value }) : '' }, 'avatar-md'); };
        function renderAuthors() {
            const list = Authors.all();
            $('authors-count').textContent = plural(list.length, 'autor', 'autores');
            $('author-rows').innerHTML = list.map(a => '<div class="panel-box mb-3 d-flex gap-3 align-items-start">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
                '<div class="flex-grow-1"><div class="d-flex flex-wrap justify-content-between gap-2"><a class="fw-bold" href="' + esc(util.authorUrl(a.name)) + '">' + esc(a.name) + '</a>' +
                '<div class="d-flex gap-1"><button class="btn btn-sm btn-outline-dark" data-aedit="' + esc(a.id) + '">Editar</button><button class="btn btn-sm btn-outline-primary" data-adel="' + esc(a.id) + '">Excluir</button></div></div>' +
                '<small class="d-block">' + esc(a.role) + (a.columnist ? ' · Colunista' : '') + (a.official ? ' · Perfil oficial ' + util.officialSealHTML(a) : '') + ' · ' + plural(usedBy(a.name).length, 'matéria', 'matérias') + '</small>' +
                (a.bio ? '<p class="small mb-0 mt-1">' + esc(a.bio) + '</p>' : '') + '</div></div>').join('') || '<p class="text-muted">Nenhum autor cadastrado.</p>';
        }
        function resetAuthor() { aform.reset(); af('authorId').value = ''; af('avatar').value = ''; $('author-form-title').textContent = 'Novo autor'; $('au-avatar-msg').textContent = ''; aform.classList.remove('was-validated'); avatarPrev(); }
        af('name').addEventListener('input', avatarPrev);
        $('au-file').addEventListener('change', async e => {
            const file = e.target.files[0]; if (!file) return;
            const m = $('au-avatar-msg');
            if (!/^image\//.test(file.type)) { m.textContent = 'Escolha um arquivo de imagem.'; return; }
            m.textContent = 'Enviando foto…'; uploading = true;
            try { af('avatar').value = await JB.Media.upload(await resize(file, 256)); m.textContent = 'Foto pronta. Salve o autor para confirmar.'; }
            catch (err) { m.textContent = err.message || 'Falha ao enviar a foto.'; }
            finally { uploading = false; e.target.value = ''; avatarPrev(); }
        });
        $('au-avatar-clear').addEventListener('click', () => { af('avatar').value = ''; avatarPrev(); });
        aform.addEventListener('submit', async e => {
            e.preventDefault();
            if (uploading) return;
            if (!aform.checkValidity()) { aform.classList.add('was-validated'); return; }
            const id = af('authorId').value;
            const before = id ? (Authors.all().find(a => a.id === id) || {}).name : null;
            const r = Authors.save({ id: id || undefined, name: af('name').value.trim(), role: af('role').value.trim(), bio: af('bio').value.trim(), avatar: af('avatar').value, columnist: af('columnist').checked, official: af('official').checked });
            if (!r.ok) { note(r.error, 'danger'); return; }
            // Renomeou: as matérias assinadas, coassinadas ou com crédito de edição com o nome antigo passam para o novo
            if (before && before !== r.author.name) News.everything().filter(n => n.author === before || (n.coauthors || []).includes(before) || (n.edit_credits || []).includes(before)).forEach(n => {
                const patch = { id: n.id };
                if (n.author === before) patch.author = r.author.name;
                if ((n.coauthors || []).includes(before)) patch.coauthors = n.coauthors.map(c => c === before ? r.author.name : c);
                if ((n.edit_credits || []).includes(before)) patch.edit_credits = n.edit_credits.map(c => c === before ? r.author.name : c);
                News.save(patch);
            });
            const ok = await JB.flush();
            if (ok) { note(id ? 'Autor atualizado.' : 'Autor cadastrado.'); resetAuthor(); }
            renderAuthors();
        });
        $('author-cancel').addEventListener('click', resetAuthor);
        $('author-rows').addEventListener('click', async e => {
            const ed = e.target.closest('[data-aedit]'), del = e.target.closest('[data-adel]');
            if (ed) {
                const a = Authors.all().find(x => x.id === ed.dataset.aedit); if (!a) return;
                af('authorId').value = a.id; af('name').value = a.name; af('role').value = a.role || ''; af('bio').value = a.bio || ''; af('avatar').value = a.avatar || ''; af('columnist').checked = !!a.columnist; af('official').checked = !!a.official;
                $('author-form-title').textContent = 'Editar autor'; avatarPrev(); aform.scrollIntoView({ behavior: 'smooth' });
            }
            if (del && confirm('Excluir este autor? As matérias continuam assinadas com o nome dele.')) { Authors.remove(del.dataset.adel); renderAuthors(); if (await JB.flush()) note('Autor excluído.', 'warning'); }
        });
        document.addEventListener('jb:sync-error', renderAuthors);
        resetAuthor(); renderAuthors();
    }

    /* =====================================================================
       Audiência e visitas
       ===================================================================== */
    function initAudience() {
        const pub = News.published(), views = id => JB.Views.count(id);
        const sum = (keyOf, labelOf) => {
            const acc = {};
            pub.forEach(n => { const k = keyOf(n); acc[k] = (acc[k] || 0) + views(n.id); });
            return Object.keys(acc).filter(k => acc[k] > 0).map(k => ({ label: labelOf(k), value: acc[k] })).sort((a, b) => b.value - a.value);
        };
        const empty = t => '<h2 class="h6 fw-bold">' + t + '</h2><p class="text-muted small mb-0">Ainda sem leituras registradas.</p>';
        const cat = sum(n => n.category, util.catLabel), kind = sum(n => n.kind || 'noticia', util.kindLabel), div = sum(n => util.divisionOf(n), d => DIVISIONS[d].name);
        $('aud-cat').innerHTML = cat.length ? util.barChartHTML({ title: 'Leituras por editoria e disciplina', unit: 'leituras', items: cat }) : empty('Leituras por editoria e disciplina');
        $('aud-kind').innerHTML = kind.length ? util.barChartHTML({ title: 'Leituras por tipo de conteúdo', unit: 'leituras', items: kind }) : empty('Leituras por tipo de conteúdo');
        $('aud-division').innerHTML = div.length ? util.chartHTML({ type: 'donut', title: 'Leituras por divisão', unit: 'leituras', items: div }) : empty('Leituras por divisão');
        // Publicações por mês (últimos 6 meses, em ordem cronológica)
        const months = [];
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) }); }
        const perMonth = months.map(mm => ({ label: mm.label, value: pub.filter(n => { const d = new Date(n.date); return d.getFullYear() === mm.y && d.getMonth() === mm.m; }).length }));
        $('aud-month').innerHTML = util.chartHTML({ type: 'column', title: 'Publicações por mês', unit: 'matérias', items: perMonth }) || empty('Publicações por mês');
        const top = JB.Views.top(10);
        $('aud-top').innerHTML = top.map((n, i) => '<li class="most-read-item"><span class="rank">' + (i + 1) + '</span><span><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a><small class="d-block opacity-75">' + views(n.id) + ' leituras · ' + esc(util.catLabel(n.category)) + '</small></span></li>').join('') ||
            '<li class="text-muted small">Ainda sem leituras registradas.</li>';
        renderVisits();
    }

    /* =====================================================================
       Comentários e denúncias
       ===================================================================== */
    function initComments() {
        const rows = $('comment-rows');
        function renderComments() {
            const all = JB.Comments.flat();
            const q = ($('comment-q').value || '').trim().toLowerCase();
            const list = all.filter(c => !q || (c.name + ' ' + c.text).toLowerCase().includes(q));
            $('comments-count').textContent = plural(all.length, 'comentário', 'comentários');
            navCount('comentarios', all.length);
            rows.innerHTML = list.map(c => {
                const n = News.get(c.newsId);
                return '<div class="panel-box mb-3"><div class="d-flex justify-content-between gap-2"><strong>' + esc(c.name) + '</strong>' +
                    '<button class="btn btn-sm btn-outline-primary" data-cdel="' + esc(c.newsId + '|' + c.id) + '">Excluir</button></div>' +
                    '<small class="text-muted">' + esc(util.fmtDate(c.date)) + ' • em ' + (n ? '<a href="' + esc(util.articleUrl(n)) + '#c-' + esc(c.id) + '">' + esc(n.title) + '</a>' : 'matéria removida') + '</small>' +
                    '<p class="mb-0 mt-2" style="white-space:pre-wrap">' + esc(c.text) + '</p>' + (c.editedAt ? '<small class="text-muted fst-italic">editado pelo autor em ' + esc(util.fmtDate(c.editedAt)) + '</small>' : '') + '</div>';
            }).join('') || '<p class="text-muted">' + (all.length ? 'Nenhum comentário neste filtro.' : 'Nenhum comentário.') + '</p>';
        }
        rows.addEventListener('click', e => {
            const b = e.target.closest('[data-cdel]');
            if (b && confirm('Excluir este comentário?')) { const p = b.dataset.cdel.split('|'); JB.Comments.remove(p[0], p[1]); renderComments(); }
        });
        $('comment-q').addEventListener('input', () => { if (loaded.comments) renderComments(); });
        document.addEventListener('jb:sync-error', () => { if (loaded.comments) renderComments(); });
        rows.innerHTML = util.loadingHTML('Carregando comentários…');
        JB.Comments.load().then(ok => { loaded.comments = ok; if (ok) renderComments(); else rows.innerHTML = failed('os comentários'); });
    }

    // Anexos: imagens em miniatura e PDFs como link. Os arquivos ficam num bucket privado; os links
    // são temporários (1 h) e só saem para coordenador/admin.
    const kb = n => Math.max(1, Math.round((Number(n) || 0) / 1024)) + ' KB';
    function attachmentsHTML(r) {
        const files = r.attachments || [];
        const legacy = r.attachment && r.attachment.name && !files.length
            ? '<small class="d-block mt-1 text-muted">📎 ' + esc(r.attachment.name) + ' (' + kb(r.attachment.size) + ') — enviado antes dos anexos reais: só o nome do arquivo foi guardado.</small>' : '';
        if (!files.length) return legacy;
        return '<div class="report-files" data-report-files="' + esc(r.id) + '">' + files.map((a, i) =>
            '<a class="report-file" data-file-i="' + i + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir anexo ' + esc(a.name) + '">' +
            (/^image\//.test(a.type) ? '<span class="report-thumb" aria-hidden="true"></span>' : '<span class="report-thumb report-thumb-pdf" aria-hidden="true">PDF</span>') +
            '<span class="report-file-name">' + esc(a.name) + '<small class="d-block opacity-75">' + kb(a.size) + '</small></span></a>').join('') + '</div>';
    }
    async function fillAttachments(list) {
        const all = list.reduce((acc, r) => acc.concat(r.attachments || []), []);
        if (!all.length) return;
        const urls = await Reports.fileUrls(all);
        list.forEach(r => {
            const box = document.querySelector('[data-report-files="' + CSS.escape(r.id) + '"]'); if (!box) return;
            (r.attachments || []).forEach((a, i) => {
                const link = box.querySelector('[data-file-i="' + i + '"]'), url = urls && urls[a.path];
                if (!link) return;
                if (!url) { link.classList.add('is-missing'); link.title = urls === null ? 'Não foi possível gerar o link agora.' : 'Arquivo não encontrado.'; return; }
                link.href = url;
                if (/^image\//.test(a.type)) { const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; link.querySelector('.report-thumb').appendChild(img); }
            });
        });
    }
    function initReports() {
        const rows = $('report-rows');
        function renderReports() {
            const list = Reports.all();
            $('reports-count').textContent = plural(list.length, 'denúncia', 'denúncias');
            navCount('denuncias', list.length);
            rows.innerHTML = list.map(r =>
                '<div class="panel-box mb-3"><div class="d-flex justify-content-between gap-2"><strong>' + esc(r.subject) + '</strong>' +
                '<button class="btn btn-sm btn-outline-primary" data-rdel="' + esc(r.id) + '">Excluir</button></div>' +
                '<small class="text-muted">' + esc(util.fmtDate(r.date)) + ' • ' + (r.anonymous ? 'Anônimo' : esc(r.name || '—') + ' (' + esc(r.email || 'sem e-mail') + ')') + '</small>' +
                '<p class="mb-1 mt-2" style="white-space:pre-wrap">' + esc(r.story) + '</p>' + attachmentsHTML(r) + '</div>').join('') ||
                '<p class="text-muted">Nenhuma denúncia recebida.</p>';
            fillAttachments(list);
        }
        rows.addEventListener('click', e => {
            const b = e.target.closest('[data-rdel]');
            if (b && confirm('Excluir esta denúncia? Os anexos dela também são apagados.')) { Reports.remove(b.dataset.rdel); renderReports(); }
        });
        document.addEventListener('jb:sync-error', () => { if (loaded.reports) renderReports(); });
        rows.innerHTML = util.loadingHTML('Carregando denúncias…');
        Reports.load().then(ok => { loaded.reports = ok; if (ok) renderReports(); else rows.innerHTML = failed('as denúncias'); });
    }

    /* =====================================================================
       Equipe e cargos (coordenador e admin)
       As regras valem no banco (set_member_role); a tela só oferece o que o cargo permite.
       ===================================================================== */
    function initTeam() {
        const teamMsg = (t, type) => { const m = $('team-msg'); m.className = 'alert alert-' + (type || 'success'); m.textContent = t; m.hidden = false; };
        $('team-rules').textContent = Auth.role() === 'admin'
            ? 'Como administrador, você coloca qualquer conta como leitor, jornalista, professor (JB Educa) ou coordenador e dá selos de perfil. Administradores só mudam pelo SQL do Supabase, e ninguém muda o próprio cargo nem os próprios selos.'
            : 'Como coordenador, você coloca ou tira jornalistas e professores e dá selos de perfil a leitores, jornalistas e professores. Coordenadores são definidos pelo administrador, e ninguém muda o próprio cargo nem os próprios selos.';
        const profileBadges = () => Badges.forProfiles();
        $('badge-legend').innerHTML = profileBadges().map(b => '<li class="mb-1">' + util.badgeSpan(b) + ' <span class="text-muted">' + esc(b.desc) + '</span></li>').join('') || '<li class="text-muted">Nenhum selo de perfil ativo.</li>';
        // Sem busca, a página mostra só a equipe e quem tem selo: quem volta a leitor sai da lista.
        let teamQuery = '';
        const inTeamView = m => teamQuery || util.isStaffRole(m.role) || (m.badges || []).length;
        function renderTeam() {
            $('team-scope').textContent = teamQuery ? 'Resultado da busca por “' + teamQuery + '” (todas as contas).' : 'Mostrando a equipe e quem tem selo. Busque um nome ou e-mail para achar qualquer conta.';
            $('team-rows').innerHTML = Members.list().filter(inTeamView).map(m => {
                const roles = Auth.assignableRoles(m);
                const ctl = roles.length
                    ? '<select class="form-select form-select-sm" data-role-for="' + esc(m.id) + '" aria-label="Cargo de ' + esc(m.name) + '">' +
                      roles.map(r => '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + esc(util.roleLabel(r)) + (r === 'professor' ? ' (JB Educa)' : '') + '</option>').join('') + '</select>' +
                      '<button class="btn btn-sm btn-primary" type="button" data-role-save="' + esc(m.id) + '">Salvar</button>' +
                      (util.isStaffRole(m.role) && roles.includes('leitor') ? '<button class="btn btn-sm btn-outline-danger" type="button" data-role-remove="' + esc(m.id) + '">Remover da equipe</button>' : '')
                    : '<span class="small text-muted">' + (m.id === me.id ? 'Você' : m.role === 'admin' ? 'Só pelo SQL do Supabase' : 'Definido pelo administrador') + '</span>';
                // Selos de perfil que a pessoa já tem continuam marcáveis mesmo se desativados depois
                const choices = profileBadges().concat((m.badges || []).filter(b => JB.BADGES[b] && !profileBadges().some(x => x.slug === b)).map(b => JB.BADGES[b]));
                const badges = Auth.canGiveBadges(m) && choices.length
                    ? '<details class="team-badges"><summary class="small">Selos (' + (m.badges || []).length + ')</summary><div class="d-flex flex-wrap gap-2 align-items-center mt-2">' +
                      choices.map(b => '<label class="form-check form-check-inline small mb-0"><input class="form-check-input" type="checkbox" data-badge-of="' + esc(m.id) + '" value="' + esc(b.slug) + '"' + ((m.badges || []).includes(b.slug) ? ' checked' : '') + '> ' + esc(b.label) + '</label>').join('') +
                      '<button class="btn btn-sm btn-outline-dark" type="button" data-badge-save="' + esc(m.id) + '">Salvar selos</button></div></details>' : '';
                return '<div class="team-row">' + util.avatarHTML({ name: m.name }, 'avatar-sm') +
                    '<div class="team-who"><a href="' + esc(util.profileUrl(m.id)) + '">' + esc(m.name) + '</a> ' + util.sealHTML(m.role) + ' ' + util.profileBadgesHTML(m.badges) +
                    '<small class="d-block text-muted text-break">' + esc(m.email || '') + ' · ' + esc(util.roleLabel(m.role)) + '</small>' + badges + '</div>' +
                    '<div class="team-ctl">' + ctl + '</div></div>';
            }).join('') || '<p class="text-muted mb-0">' + (teamQuery ? 'Nenhuma conta encontrada.' : 'Ninguém na equipe além de você. Busque uma conta para dar um cargo ou selo.') + '</p>';
        }
        function renderTeamLog() {
            $('team-log').innerHTML = Members.log().slice(0, 15).map(l => '<li><span><strong>' + esc(l.targetName || 'Conta removida') + '</strong>: ' + esc(util.roleLabel(l.oldRole)) + ' → ' + esc(util.roleLabel(l.newRole)) +
                '<small class="d-block opacity-75">' + esc(util.fmtDate(l.date)) + (l.byName ? ' · por ' + esc(l.byName) : '') + '</small></span></li>').join('') ||
                '<li class="text-muted">Nenhuma mudança ainda.</li>';
        }
        async function loadTeam(q) {
            $('team-rows').innerHTML = util.loadingHTML('Carregando contas…');
            const [ok] = await Promise.all([Members.load(q), Members.loadLog().then(renderTeamLog)]);
            if (ok) renderTeam(); else $('team-rows').innerHTML = util.errorHTML('Não foi possível carregar as contas agora.');
        }
        $('team-search').addEventListener('submit', e => { e.preventDefault(); $('team-msg').hidden = true; teamQuery = e.target.elements.q.value.trim(); loadTeam(teamQuery); });
        $('team-rows').addEventListener('click', async e => {
            const bs = e.target.closest('[data-badge-save]');
            if (bs) {
                const m = Members.list().find(x => x.id === bs.dataset.badgeSave); if (!m) return;
                const picked = Array.prototype.filter.call($('team-rows').querySelectorAll('[data-badge-of="' + CSS.escape(m.id) + '"]'), c => c.checked).map(c => c.value);
                bs.disabled = true;
                const r = await Members.setBadges(m.id, picked);
                if (r.ok) teamMsg(picked.length ? m.name + ' agora tem: ' + picked.map(b => JB.BADGES[b] ? JB.BADGES[b].label : b).join(', ') + '.' : 'Selos de ' + m.name + ' removidos.');
                else teamMsg(r.error, 'danger');
                renderTeam();
                return;
            }
            const rm = e.target.closest('[data-role-remove]');
            const b = rm || e.target.closest('[data-role-save]'); if (!b) return;
            const m = Members.list().find(x => x.id === (rm ? rm.dataset.roleRemove : b.dataset.roleSave)); if (!m) return;
            const sel = $('team-rows').querySelector('[data-role-for="' + CSS.escape(m.id) + '"]');
            const role = rm ? 'leitor' : sel.value;
            if (role === m.role) { teamMsg(m.name + ' já é ' + util.roleLabel(role).toLowerCase() + '.', 'secondary'); return; }
            const ask = rm ? 'Remover ' + m.name + ' da equipe? A conta volta a ser de leitor e perde o acesso ao painel na hora (as matérias dela continuam).'
                : 'Mudar o cargo de ' + m.name + ' de ' + util.roleLabel(m.role) + ' para ' + util.roleLabel(role) + '?';
            if (!confirm(ask)) { sel.value = m.role; return; }
            b.disabled = sel.disabled = true;
            const r = await Members.setRole(m.id, role);
            if (r.ok) { teamMsg(rm ? m.name + ' saiu da equipe (agora é leitor).' : m.name + ' agora é ' + util.roleLabel(role).toLowerCase() + '.'); await Members.loadLog(); renderTeamLog(); }
            else teamMsg(r.error, 'danger');
            renderTeam();
        });
        loadTeam('');
    }

    /* =====================================================================
       Selos e tags (coordenação)
       ===================================================================== */
    function initLabels() {
        const bform = $('badge-form'), bf = n => bform.elements[n];
        bf('color').innerHTML = opts(JB.BADGE_COLORS);
        const usedIn = slug => News.everything().filter(n => (n.badges || []).includes(slug)).length;
        const previewBadge = () => {
            $('badge-preview').innerHTML = util.badgeSpan({ label: bf('label').value.trim() || 'Nome do selo', color: bf('color').value, desc: bf('desc').value });
            if (!bf('slugOrig').value) bf('slug').placeholder = util.slugify(bf('label').value, 30) || 'gerado-pelo-nome';
        };
        ['label', 'color', 'desc'].forEach(n => bf(n).addEventListener('input', previewBadge));
        function resetBadge() {
            bform.reset(); bf('slugOrig').value = ''; bf('slug').disabled = false; bf('active').checked = true; bf('forNews').checked = true;
            $('badge-form-title').textContent = 'Novo selo'; bform.classList.remove('was-validated'); previewBadge();
        }
        function renderBadges() {
            const list = Badges.all().slice().sort((a, b) => (a.sort - b.sort) || a.label.localeCompare(b.label, 'pt-BR'));
            $('badges-count').textContent = plural(list.length, 'selo', 'selos');
            $('badge-rows').innerHTML = list.map(b => '<div class="label-row"><div class="label-main">' + util.badgeSpan(b) + ' <code class="small">' + esc(b.slug) + '</code>' +
                '<small class="d-block text-muted">' + esc(b.desc || 'Sem descrição') + '</small>' +
                '<small class="d-block">' + [b.forProfiles ? 'Perfis' : '', b.forNews ? 'Matérias' : ''].filter(Boolean).join(' e ') + (b.forProfiles || b.forNews ? '' : 'Sem uso definido') +
                (b.active ? '' : ' · <strong class="text-danger">Desativado</strong>') + (b.forNews ? ' · em ' + plural(usedIn(b.slug), 'matéria', 'matérias') : '') + '</small></div>' +
                '<div class="label-actions"><button type="button" class="btn btn-sm btn-outline-dark" data-bedit="' + esc(b.slug) + '">Editar</button><button type="button" class="btn btn-sm btn-outline-primary" data-bdel="' + esc(b.slug) + '">Excluir</button></div></div>').join('') ||
                '<p class="text-muted">Nenhum selo cadastrado.</p>';
        }
        bform.addEventListener('submit', async e => {
            e.preventDefault();
            if (!bform.checkValidity()) { bform.classList.add('was-validated'); return; }
            const orig = bf('slugOrig').value, isNew = !orig;
            if (!bf('forProfiles').checked && !bf('forNews').checked && !confirm('O selo não está liberado nem para perfis nem para matérias. Salvar assim mesmo?')) return;
            const btn = bform.querySelector('[type="submit"]'); btn.disabled = true;
            const r = await Badges.save({ slug: isNew ? (bf('slug').value.trim() || bf('label').value) : orig, label: bf('label').value, desc: bf('desc').value, color: bf('color').value,
                forProfiles: bf('forProfiles').checked, forNews: bf('forNews').checked, active: bf('active').checked, sort: bf('sort').value }, isNew);
            btn.disabled = false;
            if (!r.ok) { note(r.error, 'danger'); return; }
            note(isNew ? 'Selo criado.' : 'Selo atualizado.'); resetBadge(); renderBadges();
        });
        $('badge-cancel').addEventListener('click', resetBadge);
        $('badge-rows').addEventListener('click', async e => {
            const ed = e.target.closest('[data-bedit]'), del = e.target.closest('[data-bdel]');
            if (ed) {
                const b = JB.BADGES[ed.dataset.bedit]; if (!b) return;
                bf('slugOrig').value = b.slug; bf('slug').value = b.slug; bf('slug').disabled = true;
                bf('label').value = b.label; bf('desc').value = b.desc || ''; bf('color').value = b.color; bf('sort').value = b.sort || 0;
                bf('forProfiles').checked = !!b.forProfiles; bf('forNews').checked = !!b.forNews; bf('active').checked = !!b.active;
                $('badge-form-title').textContent = 'Editar selo'; previewBadge(); bform.scrollIntoView({ behavior: 'smooth' }); bf('label').focus();
            }
            if (del) {
                const b = JB.BADGES[del.dataset.bdel]; if (!b) return;
                if (!confirm('Excluir o selo “' + b.label + '”? Ele sai de todas as matérias e perfis que o usam (' + plural(usedIn(b.slug), 'matéria', 'matérias') + '). Para só esconder, desative.')) return;
                const r = await Badges.remove(b.slug);
                if (!r.ok) { note(r.error, 'danger'); return; }
                note('Selo excluído.', 'warning'); resetBadge(); renderBadges();
            }
        });

        // Tags
        const tform = $('tag-form'), tf = n => tform.elements[n];
        const tagUse = slug => News.everything().filter(n => (n.tags || []).includes(slug)).length;
        function resetTag() { tform.reset(); tf('slug').value = ''; $('tag-form-title').textContent = 'Nova tag'; tform.classList.remove('was-validated'); }
        function renderTagRows() {
            const q = $('tag-q').value.trim().toLowerCase();
            const all = Tags.all(), list = all.filter(t => !q || (t.name + ' ' + t.slug + ' ' + (t.description || '')).toLowerCase().includes(q));
            $('tags-count').textContent = plural(all.length, 'tag', 'tags');
            $('tag-rows').innerHTML = list.map(t => '<div class="label-row"><div class="label-main"><a class="tag-chip" href="' + esc(util.tagUrl(t.slug)) + '">#' + esc(t.name) + '</a> <code class="small">' + esc(t.slug) + '</code>' +
                (t.description ? '<small class="d-block text-muted">' + esc(t.description) + '</small>' : '') + '<small class="d-block">' + plural(tagUse(t.slug), 'matéria', 'matérias') + '</small></div>' +
                '<div class="label-actions"><button type="button" class="btn btn-sm btn-outline-dark" data-tedit="' + esc(t.slug) + '">Editar</button><button type="button" class="btn btn-sm btn-outline-primary" data-tdel="' + esc(t.slug) + '">Excluir</button></div></div>').join('') ||
                '<p class="text-muted">' + (all.length ? 'Nenhuma tag neste filtro.' : 'Nenhuma tag ainda. Crie aqui ou direto no editor de matérias.') + '</p>';
        }
        tform.addEventListener('submit', async e => {
            e.preventDefault();
            if (!tform.checkValidity()) { tform.classList.add('was-validated'); return; }
            const slug = tf('slug').value;
            const btn = tform.querySelector('[type="submit"]'); btn.disabled = true;
            const r = await Tags.save({ slug: slug || undefined, name: tf('name').value, description: tf('description').value });
            btn.disabled = false;
            if (!r.ok) { note(r.error, 'danger'); return; }
            note(r.existed ? 'Essa tag já existia.' : slug ? 'Tag atualizada.' : 'Tag criada.', r.existed ? 'info' : 'success'); resetTag(); renderTagRows();
        });
        $('tag-cancel').addEventListener('click', resetTag);
        $('tag-q').addEventListener('input', renderTagRows);
        $('tag-rows').addEventListener('click', async e => {
            const ed = e.target.closest('[data-tedit]'), del = e.target.closest('[data-tdel]');
            if (ed) {
                const t = Tags.get(ed.dataset.tedit); if (!t) return;
                tf('slug').value = t.slug; tf('name').value = t.name; tf('description').value = t.description || '';
                $('tag-form-title').textContent = 'Editar tag'; tform.scrollIntoView({ behavior: 'smooth' }); tf('name').focus();
            }
            if (del) {
                const t = Tags.get(del.dataset.tdel); if (!t) return;
                if (!confirm('Excluir a tag “' + t.name + '”? Ela sai de ' + plural(tagUse(t.slug), 'matéria', 'matérias') + '.')) return;
                const r = await Tags.remove(t.slug);
                if (!r.ok) { note(r.error, 'danger'); return; }
                note('Tag excluída.', 'warning'); resetTag(); renderTagRows();
            }
        });
        resetBadge(); renderBadges(); resetTag(); renderTagRows();
    }

    /* =====================================================================
       Segurança: lockdown, proteções, MFA da equipe, push e auditoria (coordenador/admin)
       ===================================================================== */
    function initSecurity() {
        const ACTIONS = {
            'news.create': 'criou a matéria', 'news.status': 'mudou o status de', 'news.edit': 'editou', 'news.delete': 'excluiu a matéria', 'news.featured': 'pôs na manchete',
            'comment.moderate': 'apagou um comentário em', 'report.delete': 'apagou a denúncia', 'author.create': 'cadastrou o autor', 'author.edit': 'editou o autor', 'author.delete': 'excluiu o autor',
            'role.change': 'mudou o cargo de', 'account.login': 'entrou na conta', 'account.mfa.enabled': 'ativou a verificação em duas etapas', 'account.mfa.disabled': 'removeu um app autenticador',
            'account.mfa.verified': 'confirmou o código do app autenticador', 'account.password.changed': 'trocou a senha', 'account.age_confirmed': 'confirmou a idade',
            'account.underage_deleted': 'teve a conta apagada (menor de ' + JB.MIN_AGE + ' anos)', 'account.deleted': 'excluiu a própria conta',
            'badge.change': 'mudou os selos de', 'news.editors': 'mudou os colaboradores de', 'site.lockdown_on': 'LIGOU o', 'site.lockdown_off': 'desligou o',
            'tag.create': 'criou a tag', 'tag.edit': 'editou a tag', 'tag.delete': 'excluiu a tag', 'badge.create': 'criou o selo', 'badge.edit': 'editou o selo', 'badge.delete': 'excluiu o selo'
        };
        const badgeList = l => (l || []).map(b => JB.BADGES[b] ? JB.BADGES[b].label : b).join(', ') || 'nenhum';
        function auditDetail(a) {
            const d = a.details || {};
            if (a.action === 'news.status') return (STATUS[d.from] || d.from) + ' → ' + (STATUS[d.to] || d.to);
            if (a.action === 'role.change') return util.roleLabel(d.from) + ' → ' + util.roleLabel(d.to);
            if (a.action === 'comment.moderate') return 'comentário de ' + (d.autor || '?');
            if (a.action === 'badge.change') return badgeList(d.from) + ' → ' + badgeList(d.to);
            if (a.action === 'news.editors') return (d.names || []).length ? 'agora: ' + d.names.join(', ') : 'sem colaboradores';
            if (a.action === 'site.lockdown_on' && d.message) return 'mensagem: ' + d.message;
            if (a.action === 'account.login' || a.action === 'account.mfa.verified') return d.aal === 'aal2' ? 'com verificação em duas etapas' : 'só com a senha';
            return '';
        }
        let auditLast = null;
        async function loadAudit(more) {
            if (!more) { auditLast = null; $('audit-rows').innerHTML = util.loadingHTML('Carregando auditoria…'); }
            const rows = await JB.Security.audit({ filter: $('audit-filter').value, before: more && auditLast ? auditLast.at : null, limit: 50 });
            if (rows === null) { $('audit-rows').innerHTML = JB.mode === 'local' ? '<p class="text-muted small">A auditoria só existe com o Supabase.</p>' : failed('a auditoria'); $('audit-more').hidden = true; return; }
            const html = rows.map(a => '<div class="audit-row"><span class="audit-when">' + esc(hm(a.at)) + '</span><div><strong>' + esc(a.actor_name || 'Conta removida') + '</strong>' +
                (a.actor_role && util.isStaffRole(a.actor_role) ? ' <small class="opacity-75">(' + esc(util.roleLabel(a.actor_role)) + ')</small>' : '') + ' ' + esc(ACTIONS[a.action] || a.action) +
                (a.target_label ? ' <em>' + esc(a.target_label) + '</em>' : '') + (auditDetail(a) ? '<div class="small opacity-75">' + esc(auditDetail(a)) + '</div>' : '') + '</div></div>').join('');
            if (more) $('audit-rows').insertAdjacentHTML('beforeend', html); else $('audit-rows').innerHTML = html || '<p class="text-muted small">Nenhum registro ainda.</p>';
            if (rows.length) auditLast = rows[rows.length - 1];
            $('audit-more').hidden = rows.length < 50;
        }
        async function loadSecurity() {
            const check = (state, title, text) => '<li class="sec-' + state + '"><span class="sec-dot" aria-hidden="true"></span><div><strong>' + esc(title) + '</strong> <span class="visually-hidden">(' + (state === 'ok' ? 'ok' : state === 'warn' ? 'atenção' : 'problema') + ')</span><div class="small">' + text + '</div></div></li>';
            $('sec-checks').innerHTML = util.loadingHTML('Verificando…'); $('sec-staff').innerHTML = util.loadingHTML();
            if (JB.mode === 'local') { $('sec-checks').innerHTML = '<li class="small text-muted">No modo de demonstração local não há servidor para verificar.</li>'; $('sec-staff').innerHTML = ''; return; }
            const [ov, cap, google] = await Promise.all([JB.Security.overview(), JB.Security.captchaEnforced(), JB.Security.googleEnabled()]);
            const staff = (ov && ov.staff) || [];
            const noMfa = staff.filter(s => !s.mfa);
            $('sec-checks').innerHTML = [
                JB.Captcha.enabled && cap === 'on' ? check('ok', 'CAPTCHA (Turnstile)', 'Login, cadastro, recuperação e troca de senha exigem a verificação anti-robô.')
                    : JB.Captcha.enabled ? check('warn', 'CAPTCHA (Turnstile)', cap === null ? 'Não foi possível consultar o Supabase agora.' : 'O site já mostra o desafio, mas o Supabase ainda não exige: ligue em Authentication &gt; Attack Protection &gt; CAPTCHA (Turnstile + chave secreta).')
                    : check('bad', 'CAPTCHA (Turnstile)', 'Sem TURNSTILE_SITE_KEY em assets/js/config.js.'),
                check(noMfa.length ? 'bad' : 'ok', 'Verificação em duas etapas da equipe', noMfa.length ? esc(noMfa.length + ' pessoa(s) da equipe ainda sem MFA (sem acesso ao painel até ativar).') : 'Toda a equipe tem MFA ativo.'),
                check('ok', 'Idade mínima (' + JB.MIN_AGE + ' anos)', ov ? esc((ov.age_pending || 0) + ' conta(s) ainda sem idade confirmada (não gravam nada até confirmar).') : 'Conferida pelo banco no cadastro e no 1º acesso pelo Google.'),
                check('ok', 'Senhas', 'O site pede ' + JB.PASSWORD_MIN + '+ caracteres com minúscula, maiúscula, número e símbolo. Mantenha o mesmo no Supabase (Authentication &gt; Sign In / Providers &gt; Email).'),
                check(google ? 'ok' : 'warn', 'Login com o Google', google ? 'Ativo no Supabase.' : 'Desligado: configure em Authentication &gt; Sign In / Providers &gt; Google (veja docs/DEPLOY.md). O botão só aparece quando estiver ligado.'),
                check('ok', 'Limites contra abuso', 'Senha errada: espera crescente no site + limite por IP do Supabase. Comentários, denúncias e newsletter têm limite por minuto no banco.'),
                ov && 'push_ready' in ov ? (ov.push_ready ? check('ok', 'Notificações push', esc(ov.push_devices + ' aparelho(s) inscrito(s). Alertas de segurança chegam também com o site fechado.'))
                    : check('warn', 'Notificações push', 'Os avisos aparecem no sino do site, mas o envio com o site fechado não está configurado: faltam os segredos do Vault (jb_push_hook_url e jb_push_hook_secret) e as variáveis VAPID_PRIVATE_KEY e PUSH_HOOK_SECRET no Cloudflare (docs/DEPLOY.md).')) : '',
                ov ? check('ok', 'Contas', esc(ov.accounts + ' conta(s); ' + ov.with_mfa + ' com MFA; ' + ov.audit_24h + ' registro(s) de auditoria nas últimas 24 h.')) : ''
            ].join('');
            $('sec-staff').innerHTML = ov === null ? failed('a lista da equipe') : staff.map(s => '<div class="d-flex justify-content-between gap-2 border-bottom py-1 small"><span>' + esc(s.name) + ' <span class="opacity-75">(' + esc(util.roleLabel(s.role)) + ')</span></span>' +
                '<span>' + (s.mfa ? '<span class="badge bg-success">MFA ativo</span>' : '<span class="badge bg-danger">Sem MFA</span>') + (s.age_ok ? '' : ' <span class="badge bg-secondary">idade pendente</span>') + '</span></div>').join('') || '<p class="small text-muted mb-0">Sem equipe cadastrada.</p>';
        }
        /* Modo lockdown */
        let lockOn = false;
        const lockAlert = (t, type) => { const m = $('lockdown-alert'); m.className = 'alert mt-3 mb-0 alert-' + (type || 'success'); m.textContent = t; m.hidden = false; };
        function paintLockdown(st) {
            lockOn = !!(st && st.lockdown);
            $('lockdown-panel').classList.toggle('is-on', lockOn);
            $('lockdown-state').className = 'badge ' + (lockOn ? 'bg-danger' : 'bg-success');
            $('lockdown-state').textContent = lockOn ? 'LIGADO: site fechado ao público' : 'Desligado: site aberto';
            $('lockdown-toggle').className = 'btn ' + (lockOn ? 'btn-success' : 'btn-danger');
            $('lockdown-toggle').textContent = lockOn ? 'Desligar e reabrir o site' : 'Ligar o modo lockdown';
            if (lockOn) $('lockdown-msg').value = st.message || '';
            $('lockdown-info').textContent = lockOn && st.since ? 'Ligado desde ' + util.fmtDate(st.since) + '.' : JB.mode === 'local' ? 'Demonstração local: só muda a tela deste navegador.' : '';
        }
        $('lockdown-form').addEventListener('submit', async e => {
            e.preventDefault();
            const on = !lockOn, text = $('lockdown-msg').value.trim();
            if (!confirm(on ? 'Ligar o modo lockdown? O site fecha AGORA para todo mundo que não é da equipe (leitores, comentários, denúncias e cadastros param).' : 'Desligar o modo lockdown e reabrir o site para o público?')) return;
            const btn = $('lockdown-toggle'); btn.disabled = true;
            const r = await JB.Site.setLockdown(on, text);
            btn.disabled = false;
            if (!r.ok) { lockAlert(r.error, 'danger'); return; }
            paintLockdown({ lockdown: on, message: text, since: new Date().toISOString() });
            lockAlert(on ? 'Modo lockdown ligado. Só a equipe (com a verificação em duas etapas) acessa o conteúdo. Os administradores foram notificados.' : 'Site reaberto ao público. Os administradores foram notificados.', on ? 'warning' : 'success');
            loadAudit();
        });
        JB.Site.status().then(paintLockdown, () => paintLockdown(null));
        $('sec-recheck').addEventListener('click', loadSecurity);
        $('audit-filter').addEventListener('change', () => loadAudit());
        $('audit-more').addEventListener('click', () => loadAudit(true));
        loadSecurity(); loadAudit();
    }

    /* =====================================================================
       Visão geral
       ===================================================================== */
    function initOverview() {
        const lead = $('overview-greeting');
        if (lead) lead.textContent = util.greeting() + ', ' + me.name.split(' ')[0] + '.';
        renderStats(); renderTodo(); renderVisits();
        $('quick-links').innerHTML = [
            Auth.divisions().includes('jb') ? '<a class="btn btn-primary btn-sm" href="editor.html">+ Nova matéria</a>' : '',
            Auth.divisions().includes('educa') ? '<a class="btn btn-educa btn-sm" href="editor.html?divisao=educa">+ Material do JB Educa</a>' : '',
            '<a class="btn btn-outline-dark btn-sm" href="admin-materias.html' + (editor ? '' : '?mine=1') + '">' + (editor ? 'Todas as matérias' : 'Minhas matérias') + '</a>',
            editor ? '<a class="btn btn-outline-dark btn-sm" href="admin-selos-tags.html">Selos e tags</a>' : '',
            editor ? '<a class="btn btn-outline-dark btn-sm" href="admin-seguranca.html">Segurança</a>' : ''
        ].join('');
        if (editor) {   // denúncias, newsletter e moderação: só coordenador/admin (o RLS faz o mesmo)
            Reports.load().then(ok => { loaded.reports = ok; renderStats(); renderTodo(); navCount('denuncias', ok ? Reports.all().length : 0); });
            JB.Newsletter.load().then(ok => { loaded.newsletter = ok; renderStats(); });
            JB.Comments.load().then(ok => { loaded.comments = ok; renderStats(); navCount('comentarios', ok ? JB.Comments.flat().length : 0); });
            JB.Site.status().then(st => {
                const box = $('overview-lock'); if (!box) return;
                box.innerHTML = st && st.lockdown ? '<div class="alert alert-danger mb-0"><strong>Modo lockdown ligado</strong> desde ' + esc(util.fmtDate(st.since)) + '. <a href="admin-seguranca.html">Gerenciar</a></div>'
                    : '<p class="small mb-0"><span class="badge bg-success">Site aberto</span> Lockdown desligado. <a href="admin-seguranca.html">Segurança</a></p>';
            }, () => { });
        }
    }

    /* ---------- Carga ---------- */
    const MODULES = { geral: initOverview, materias: initNews, autores: initAuthors, audiencia: initAudience, comentarios: initComments, denuncias: initReports, equipe: initTeam, selos: initLabels, seguranca: initSecurity };
    JB.ready.then(() => {
        $('admin-loading').hidden = true;
        if (JB.loadError) { $('gate').hidden = true; $('admin-error').innerHTML = util.errorHTML(); return; }
        $('panel').hidden = false;
        navCount('materias', News.everything().length);
        if (blocked) {
            $('admin-section').innerHTML = '<div class="alert alert-secondary">Esta área é da coordenação da redação. <a href="admin.html">Voltar à visão geral</a>.</div>';
            return;
        }
        (MODULES[section] || initOverview)();
    });
});
