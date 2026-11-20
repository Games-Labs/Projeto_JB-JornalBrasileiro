/* Painel Administrativo — lista de matérias (fluxo editorial, agendamento, versões; a escrita e a
   edição ficam em editor.html / editor.js), autores, audiência, denúncias, moderação
   e cargos da redação. O que cada cargo vê depende de JB.Auth (admin, coordenador, jornalista).
   Esconder partes do painel aqui é só interface: quem impede um jornalista de publicar, ou um
   leitor de ler denúncias, são as políticas RLS e set_member_role no Supabase. */
JB.authReady.then(function () {
    'use strict';
    const { News, Reports, Authors, Versions, Auth, Members, KINDS, STATUS, STATUS_FLOW, util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);

    if (!Auth.isStaff()) {
        $('admin-loading').hidden = true; $('gate').hidden = false;
        // Da equipe, mas a conta ainda não está liberada nesta sessão (idade ou verificação em duas etapas)
        if (util.isStaffRole(Auth.realRole())) {
            const st = Auth.mfaState();
            $('gate').innerHTML = '<h1 class="h3">Falta um passo</h1><p>' + esc(!Auth.ageOk() ? 'Confirme sua idade para liberar a conta.'
                : st === 'challenge' ? 'Digite o código do app autenticador para usar o painel.'
                : 'A equipe da redação só usa o painel com a verificação em duas etapas ativada. Ative agora com um app autenticador (leva um minuto).') +
                '</p><a class="btn btn-primary" href="seguranca.html?next=admin.html">Continuar</a>';
        }
        return;
    }
    const me = Auth.current();
    const editor = Auth.isEditor();                     // coordenador ou admin
    const allowedStatuses = Auth.allowedStatuses();     // jornalista: rascunho, revisão, aprovada
    document.querySelectorAll('[data-editor-only]').forEach(el => { el.hidden = !editor; });
    const ROLE_NOTES = {
        admin: 'Acesso total à redação. Coordenadores e jornalistas são definidos na aba “Equipe e cargos”.',
        coordenador: 'Você publica, arquiva e corrige matérias, modera comentários, lê denúncias e coloca ou tira jornalistas na aba “Equipe e cargos”.',
        jornalista: 'Você cria e edita as suas matérias até “Aprovada”; quem publica é um coordenador. As matérias dos colegas aparecem só para leitura.'
    };
    $('role-note').innerHTML = util.sealHTML(me.role) + ' Você entrou como <strong>' + esc(util.roleLabel(me.role)) + '</strong>. ' + esc(ROLE_NOTES[me.role] || '');

    const tbody = $('news-rows');
    const msg = $('admin-msg');
    const note = (t, type) => { msg.className = 'alert alert-' + (type || 'success'); msg.textContent = t; msg.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => { msg.hidden = true; }, 4500); };
    const opts = (obj, label) => Object.keys(obj).map(k => '<option value="' + k + '">' + esc(label ? label(obj[k]) : obj[k]) + '</option>').join('');
    const nowIso = () => new Date().toISOString();
    const hm = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const editUrl = n => 'editor.html?id=' + encodeURIComponent(n.id);

    $('news-mine').checked = !editor;           // jornalista começa vendo as próprias matérias
    $('news-status').innerHTML += opts(STATUS) + '<option value="agendada">Agendada</option>';
    $('news-kind').innerHTML += opts(KINDS);

    // Reduz a foto do autor no navegador (lado maior ≤ max px) antes de enviar: WebP, ou JPEG se o navegador não gerar WebP
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
    let uploading = false;

    /* ---------- Tabela de matérias ---------- */
    const statusOf = n => util.isScheduled(n) ? 'agendada' : (n.status || 'publicada');
    function statusBadge(n) {
        if (util.isScheduled(n)) return '<span class="badge status-badge bg-info text-dark" title="Publica em ' + esc(util.fmtDate(n.date)) + '">Agendada · ' + esc(hm(n.date)) + '</span>';
        return '<span class="badge status-badge ' + (util.isPublished(n) ? 'bg-success' : 'bg-secondary') + '">' + esc(STATUS[n.status || 'publicada']) + '</span>';
    }
    const nextOf = n => { const i = STATUS_FLOW.indexOf(n.status || 'publicada'); return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : ''; };
    // Próximo passo do fluxo permitido para quem está logado (jornalista para em "Aprovada")
    const canAdvance = n => { const nx = nextOf(n); return !!nx && Auth.canEditNews(n) && allowedStatuses.includes(nx); };
    const canSeeVersions = n => editor || Auth.isOwnNews(n);
    function renderNews() {
        const all = News.everything();
        const q = $('news-q').value.trim().toLowerCase(), st = $('news-status').value, kd = $('news-kind').value, mine = $('news-mine').checked;
        const list = all.filter(n => (!q || (n.title + ' ' + n.author).toLowerCase().includes(q)) && (!st || statusOf(n) === st) && (!kd || (n.kind || 'noticia') === kd) && (!mine || Auth.isOwnNews(n)));
        tbody.innerHTML = list.map(n =>
            '<tr><td><img class="admin-thumb" src="' + esc(util.imgSrc(n)) + '" alt="" loading="lazy"></td>' +
            '<td><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a>' + (n.featured ? ' <span class="badge bg-primary">Manchete</span>' : '') + (n.video ? ' <span class="badge text-bg-dark">Vídeo</span>' : '') + (Auth.isOwnNews(n) ? ' <span class="badge mine-badge">Sua</span>' : '') +
            '<div class="small opacity-75">' + esc(KINDS[n.kind] || KINDS.noticia) + (n.kind === 'aovivo' && n.live ? ' · ao vivo' : '') + ' · ' + esc(n.author) + (util.wasUpdated(n) ? ' · atualizada ' + esc(hm(n.updated_at)) : '') + '</div></td>' +
            '<td>' + esc(util.catLabel(n.category)) + '</td>' +
            '<td>' + statusBadge(n) + '</td>' +
            '<td class="text-nowrap">' + new Date(n.date).toLocaleDateString('pt-BR') + '</td>' +
            '<td><div class="d-flex flex-wrap gap-1">' + (canAdvance(n) ? '<button class="btn btn-sm btn-primary" data-adv="' + esc(n.id) + '" title="Mover para: ' + esc(STATUS[nextOf(n)]) + '">→ ' + esc(STATUS[nextOf(n)]) + '</button>' : '') +
            (Auth.canEditNews(n) ? '<a class="btn btn-sm btn-outline-dark" href="' + esc(editUrl(n)) + '">Editar</a>'
                : '<a class="btn btn-sm btn-outline-dark" href="' + esc(util.articleUrl(n)) + '" title="Somente leitura">Ver</a>') +
            (canSeeVersions(n) ? '<button class="btn btn-sm btn-outline-dark" data-hist="' + esc(n.id) + '">Versões</button>' : '') +
            (editor ? '<button class="btn btn-sm btn-outline-primary" data-del="' + esc(n.id) + '">Excluir</button>' : '') + '</div></td></tr>').join('') ||
            '<tr><td colspan="6" class="text-center text-muted">' + (all.length ? 'Nenhuma matéria neste filtro.' : 'Nenhuma notícia cadastrada.') + '</td></tr>';
        $('news-count').textContent = all.length;
        renderStats();
        if (loaded.audience) renderAudience();
    }
    ['news-q', 'news-status', 'news-kind', 'news-mine'].forEach(id => $(id).addEventListener('input', renderNews));

    const loaded = { comments: false, reports: false, newsletter: false, audience: false };
    function renderStats() {
        const list = News.everything();
        const v = (key, n) => loaded[key] ? n : '…';
        const producing = n => ['rascunho', 'revisao', 'aprovada'].includes(n.status);
        const cards = [
            ['Publicadas', list.filter(util.isPublished).length], ['Em produção', list.filter(producing).length],
            ['Agendadas', list.filter(util.isScheduled).length], ['Ao vivo', list.filter(n => n.kind === 'aovivo' && n.live && util.isPublished(n)).length]
        ].concat(editor
            ? [['Denúncias', v('reports', Reports.all().length)], ['Comentários', v('comments', JB.Comments.flat().length)], ['Leituras', JB.Views.total()], ['Newsletter', v('newsletter', JB.Newsletter.count())]]
            : [['Minhas em produção', list.filter(n => producing(n) && Auth.isOwnNews(n)).length], ['Aguardando publicação', list.filter(n => n.status === 'aprovada' && Auth.isOwnNews(n)).length], ['Leituras', JB.Views.total()]]);
        $('stats').innerHTML = cards.map(c => '<div class="col-6 col-md-3 col-xl"><div class="stat-card"><strong>' + c[1] + '</strong><span>' + c[0] + '</span></div></div>').join('');
    }


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

    /* ---------- Versões ---------- */
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
                return '<div class="panel-box mb-3"><div class="d-flex flex-wrap justify-content-between gap-2"><span class="small">Substituída em <strong>' + esc(util.fmtDate(v.replacedAt)) + '</strong>' + (v.replacedBy ? ' por ' + esc(v.replacedBy) : '') + '</span>' +
                    (Auth.canEditNews(n) ? '<button class="btn btn-sm btn-outline-dark" data-restore="' + esc(v.id) + '">Restaurar esta versão</button>' : '') + '</div>' +
                    '<h3 class="h6 mt-2 mb-1">' + esc(s.title) + '</h3><p class="small mb-1">' + esc(s.subtitle) + '</p>' +
                    '<p class="small opacity-75 mb-0">' + esc(KINDS[s.kind] || '') + ' · ' + esc(util.catLabel(s.category)) + ' · ' + esc(s.author) + ' · ' + (s.body || []).length + ' blocos de texto' + (s.video ? ' · com vídeo' : '') + '</p>' +
                    '<details class="small mt-1"><summary>Ver texto</summary><div class="article-body version-body">' + util.bodyHTML(s.body || []) + '</div></details></div>';
            }).join('') || '<p class="text-muted">Nenhuma versão anterior: esta matéria ainda não foi editada depois de criada.</p>');
    }
    vbody.addEventListener('click', async e => {
        const b = e.target.closest('[data-restore]'); if (!b || !versionsOf) return;
        const v = Versions.forNews(versionsOf).find(x => String(x.id) === b.dataset.restore);
        if (!v || !confirm('Restaurar esta versão? O conteúdo atual será guardado como versão anterior.')) return;
        const patch = Object.assign({ id: versionsOf }, v.snapshot);
        // Campo que não existia na versão antiga volta vazio (inclui video = '')
        JB.VERSIONED.forEach(k => { if (!(k in patch)) patch[k] = k === 'chart' || k === 'verdict' ? null : (k === 'body' || k === 'sources' || k === 'timeline' || k === 'people' ? [] : ''); });
        News.save(patch);
        const ok = await JB.flush();
        versionsModal.hide(); renderNews();
        if (ok) note('Versão restaurada.');
    });

    /* ---------- Autores ---------- */
    const aform = $('author-form');
    const af = n => aform.elements[n];
    const avatarPrev = () => { $('au-avatar-preview').innerHTML = util.avatarHTML({ name: af('name').value || '?', avatar: af('avatar').value ? util.imgSrc({ image: af('avatar').value }) : '' }, 'avatar-md'); };
    function renderAuthors() {
        const list = Authors.all();
        $('authors-count').textContent = list.length;
        $('author-rows').innerHTML = list.map(a => '<div class="panel-box mb-3 d-flex gap-3 align-items-start">' + util.avatarHTML({ name: a.name, avatar: a.avatar ? util.imgSrc({ image: a.avatar }) : '' }, 'avatar-md') +
            '<div class="flex-grow-1"><div class="d-flex flex-wrap justify-content-between gap-2"><a class="fw-bold" href="' + esc(util.authorUrl(a.name)) + '">' + esc(a.name) + '</a>' +
            '<div class="d-flex gap-1"><button class="btn btn-sm btn-outline-dark" data-aedit="' + esc(a.id) + '">Editar</button><button class="btn btn-sm btn-outline-primary" data-adel="' + esc(a.id) + '">Excluir</button></div></div>' +
            '<small class="d-block">' + esc(a.role) + (a.columnist ? ' · Colunista' : '') + ' · ' + News.everything().filter(n => n.author === a.name).length + ' matérias</small>' +
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
        const r = Authors.save({ id: id || undefined, name: af('name').value.trim(), role: af('role').value.trim(), bio: af('bio').value.trim(), avatar: af('avatar').value, columnist: af('columnist').checked });
        if (!r.ok) { note(r.error, 'danger'); return; }
        // Renomeou: as matérias assinadas com o nome antigo passam para o novo
        if (before && before !== r.author.name) News.everything().filter(n => n.author === before).forEach(n => News.save({ id: n.id, author: r.author.name }));
        const ok = await JB.flush();
        if (ok) { note(id ? 'Autor atualizado.' : 'Autor cadastrado.'); resetAuthor(); }
        renderAuthors(); renderNews();
    });
    $('author-cancel').addEventListener('click', resetAuthor);
    $('author-rows').addEventListener('click', async e => {
        const ed = e.target.closest('[data-aedit]'), del = e.target.closest('[data-adel]');
        if (ed) {
            const a = Authors.all().find(x => x.id === ed.dataset.aedit); if (!a) return;
            af('authorId').value = a.id; af('name').value = a.name; af('role').value = a.role || ''; af('bio').value = a.bio || ''; af('avatar').value = a.avatar || ''; af('columnist').checked = !!a.columnist;
            $('author-form-title').textContent = 'Editar autor'; avatarPrev(); aform.scrollIntoView({ behavior: 'smooth' });
        }
        if (del && confirm('Excluir este autor? As matérias continuam assinadas com o nome dele.')) { Authors.remove(del.dataset.adel); renderAuthors(); if (await JB.flush()) note('Autor excluído.', 'warning'); }
    });

    /* ---------- Audiência ---------- */
    function renderAudience() {
        loaded.audience = true;
        const pub = News.all(), views = id => JB.Views.count(id);
        const sum = (keyOf, labelOf) => {
            const acc = {};
            pub.forEach(n => { const k = keyOf(n); acc[k] = (acc[k] || 0) + views(n.id); });
            return Object.keys(acc).filter(k => acc[k] > 0).map(k => ({ label: labelOf(k), value: acc[k] })).sort((a, b) => b.value - a.value);
        };
        const empty = t => '<h2 class="h6 fw-bold">' + t + '</h2><p class="text-muted small mb-0">Ainda sem leituras registradas.</p>';
        const cat = sum(n => n.category, util.catLabel), kind = sum(n => n.kind || 'noticia', util.kindLabel);
        $('aud-cat').innerHTML = cat.length ? util.barChartHTML({ title: 'Leituras por editoria', unit: 'leituras', items: cat }) : empty('Leituras por editoria');
        $('aud-kind').innerHTML = kind.length ? util.barChartHTML({ title: 'Leituras por tipo de conteúdo', unit: 'leituras', items: kind }) : empty('Leituras por tipo de conteúdo');
        // Publicações por mês (últimos 6 meses, em ordem cronológica)
        const months = [];
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) }); }
        const perMonth = months.map(mm => ({ label: mm.label, value: pub.filter(n => { const d = new Date(n.date); return d.getFullYear() === mm.y && d.getMonth() === mm.m; }).length }));
        $('aud-month').innerHTML = util.barChartHTML({ title: 'Publicações por mês', unit: 'matérias', items: perMonth }) || empty('Publicações por mês');
        const top = JB.Views.top(10);
        $('aud-top').innerHTML = top.map((n, i) => '<li class="most-read-item"><span class="rank">' + (i + 1) + '</span><span><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a><small class="d-block opacity-75">' + views(n.id) + ' leituras · ' + esc(util.catLabel(n.category)) + '</small></span></li>').join('') ||
            '<li class="text-muted small">Ainda sem leituras registradas.</li>';
    }
    document.querySelector('[data-bs-target="#tab-audience"]').addEventListener('shown.bs.tab', renderAudience);

    /* ---------- Comentários e denúncias ---------- */
    function renderComments() {
        const list = JB.Comments.flat();
        $('comments-count').textContent = list.length;
        $('comment-rows').innerHTML = list.map(c => {
            const n = News.get(c.newsId);
            return '<div class="panel-box mb-3"><div class="d-flex justify-content-between gap-2"><strong>' + esc(c.name) + '</strong>' +
                '<button class="btn btn-sm btn-outline-primary" data-cdel="' + esc(c.newsId + '|' + c.id) + '">Excluir</button></div>' +
                '<small class="text-muted">' + esc(util.fmtDate(c.date)) + ' • em ' + (n ? esc(n.title) : 'matéria removida') + '</small>' +
                '<p class="mb-0 mt-2" style="white-space:pre-wrap">' + esc(c.text) + '</p>' + (c.editedAt ? '<small class="text-muted fst-italic">editado pelo autor em ' + esc(util.fmtDate(c.editedAt)) + '</small>' : '') + '</div>';
        }).join('') || '<p class="text-muted">Nenhum comentário.</p>';
        renderStats();
    }

    function renderReports() {
        const list = Reports.all();
        $('reports-count').textContent = list.length;
        $('report-rows').innerHTML = list.map(r =>
            '<div class="panel-box mb-3"><div class="d-flex justify-content-between gap-2"><strong>' + esc(r.subject) + '</strong>' +
            '<button class="btn btn-sm btn-outline-primary" data-rdel="' + esc(r.id) + '">Excluir</button></div>' +
            '<small class="text-muted">' + esc(util.fmtDate(r.date)) + ' • ' + (r.anonymous ? 'Anônimo' : esc(r.name || '—') + ' (' + esc(r.email || 'sem e-mail') + ')') + '</small>' +
            '<p class="mb-1 mt-2" style="white-space:pre-wrap">' + esc(r.story) + '</p>' +
            (r.attachment && r.attachment.name ? '<small>📎 ' + esc(r.attachment.name) + ' (' + Math.round((Number(r.attachment.size) || 0) / 1024) + ' KB)</small>' : '') + '</div>').join('') ||
            '<p class="text-muted">Nenhuma denúncia recebida.</p>';
        renderStats();
    }
    $('report-rows').addEventListener('click', e => {
        const b = e.target.closest('[data-rdel]');
        if (b && confirm('Excluir esta denúncia?')) { Reports.remove(b.dataset.rdel); renderReports(); }
    });
    $('comment-rows').addEventListener('click', e => {
        const b = e.target.closest('[data-cdel]');
        if (b && confirm('Excluir este comentário?')) { const p = b.dataset.cdel.split('|'); JB.Comments.remove(p[0], p[1]); renderComments(); }
    });
    // Gravação recusada pelo servidor: o cache já foi desfeito, só redesenhar.
    document.addEventListener('jb:sync-error', () => { renderNews(); renderAuthors(); if (loaded.reports) renderReports(); if (loaded.comments) renderComments(); });

    /* ---------- Equipe e cargos (coordenador e admin) ---------- */
    // As regras valem no banco (set_member_role); a tela só oferece o que o cargo permite.
    const teamMsg = (t, type) => { const m = $('team-msg'); m.className = 'alert alert-' + (type || 'success'); m.textContent = t; m.hidden = false; };
    $('team-rules').textContent = Auth.role() === 'admin'
        ? 'Como administrador, você coloca qualquer conta como leitor, jornalista ou coordenador. Administradores só mudam pelo SQL do Supabase, e ninguém muda o próprio cargo.'
        : 'Como coordenador, você coloca ou tira jornalistas. Coordenadores são definidos pelo administrador, e ninguém muda o próprio cargo.';
    function renderTeam() {
        $('team-rows').innerHTML = Members.list().map(m => {
            const roles = Auth.assignableRoles(m);
            const ctl = roles.length
                ? '<select class="form-select form-select-sm" data-role-for="' + esc(m.id) + '" aria-label="Cargo de ' + esc(m.name) + '">' +
                  roles.map(r => '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + esc(util.roleLabel(r)) + '</option>').join('') + '</select>' +
                  '<button class="btn btn-sm btn-primary" type="button" data-role-save="' + esc(m.id) + '">Salvar</button>'
                : '<span class="small text-muted">' + (m.id === me.id ? 'Você' : m.role === 'admin' ? 'Só pelo SQL do Supabase' : 'Definido pelo administrador') + '</span>';
            return '<div class="team-row">' + util.avatarHTML({ name: m.name }, 'avatar-sm') +
                '<div class="team-who"><a href="' + esc(util.profileUrl(m.id)) + '">' + esc(m.name) + '</a> ' + util.sealHTML(m.role) +
                '<small class="d-block text-muted text-break">' + esc(m.email || '') + ' · ' + esc(util.roleLabel(m.role)) + '</small></div>' +
                '<div class="team-ctl">' + ctl + '</div></div>';
        }).join('') || '<p class="text-muted mb-0">Nenhuma conta encontrada.</p>';
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
    $('team-search').addEventListener('submit', e => { e.preventDefault(); $('team-msg').hidden = true; loadTeam(e.target.elements.q.value); });
    $('team-rows').addEventListener('click', async e => {
        const b = e.target.closest('[data-role-save]'); if (!b) return;
        const m = Members.list().find(x => x.id === b.dataset.roleSave); if (!m) return;
        const sel = $('team-rows').querySelector('[data-role-for="' + CSS.escape(m.id) + '"]');
        const role = sel.value;
        if (role === m.role) { teamMsg(m.name + ' já é ' + util.roleLabel(role).toLowerCase() + '.', 'secondary'); return; }
        if (!confirm('Mudar o cargo de ' + m.name + ' de ' + util.roleLabel(m.role) + ' para ' + util.roleLabel(role) + '?')) { sel.value = m.role; return; }
        b.disabled = sel.disabled = true;
        const r = await Members.setRole(m.id, role);
        if (r.ok) { teamMsg(m.name + ' agora é ' + util.roleLabel(role).toLowerCase() + '.'); await Members.loadLog(); renderTeamLog(); }
        else teamMsg(r.error, 'danger');
        renderTeam();
    });
    let teamLoaded = false;
    document.querySelector('[data-bs-target="#tab-team"]').addEventListener('shown.bs.tab', () => { if (!teamLoaded) { teamLoaded = true; loadTeam(''); } });

    /* ---------- Segurança: proteções, MFA da equipe e auditoria (coordenador/admin) ---------- */
    const ACTIONS = {
        'news.create': 'criou a matéria', 'news.status': 'mudou o status de', 'news.edit': 'editou', 'news.delete': 'excluiu a matéria', 'news.featured': 'pôs na manchete',
        'comment.moderate': 'apagou um comentário em', 'report.delete': 'apagou a denúncia', 'author.create': 'cadastrou o autor', 'author.edit': 'editou o autor', 'author.delete': 'excluiu o autor',
        'role.change': 'mudou o cargo de', 'account.login': 'entrou na conta', 'account.mfa.enabled': 'ativou a verificação em duas etapas', 'account.mfa.disabled': 'removeu um app autenticador',
        'account.mfa.verified': 'confirmou o código do app autenticador', 'account.password.changed': 'trocou a senha', 'account.age_confirmed': 'confirmou a idade',
        'account.underage_deleted': 'teve a conta apagada (menor de ' + JB.MIN_AGE + ' anos)', 'account.deleted': 'excluiu a própria conta'
    };
    function auditDetail(a) {
        const d = a.details || {};
        if (a.action === 'news.status') return (STATUS[d.from] || d.from) + ' → ' + (STATUS[d.to] || d.to);
        if (a.action === 'role.change') return util.roleLabel(d.from) + ' → ' + util.roleLabel(d.to);
        if (a.action === 'comment.moderate') return 'comentário de ' + (d.autor || '?');
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
            ov ? check('ok', 'Contas', esc(ov.accounts + ' conta(s); ' + ov.with_mfa + ' com MFA; ' + ov.audit_24h + ' registro(s) de auditoria nas últimas 24 h.')) : ''
        ].join('');
        $('sec-staff').innerHTML = ov === null ? failed('a lista da equipe') : staff.map(s => '<div class="d-flex justify-content-between gap-2 border-bottom py-1 small"><span>' + esc(s.name) + ' <span class="opacity-75">(' + esc(util.roleLabel(s.role)) + ')</span></span>' +
            '<span>' + (s.mfa ? '<span class="badge bg-success">MFA ativo</span>' : '<span class="badge bg-danger">Sem MFA</span>') + (s.age_ok ? '' : ' <span class="badge bg-secondary">idade pendente</span>') + '</span></div>').join('') || '<p class="small text-muted mb-0">Sem equipe cadastrada.</p>';
    }
    let securityLoaded = false;
    document.querySelector('[data-bs-target="#tab-security"]').addEventListener('shown.bs.tab', () => { if (!securityLoaded) { securityLoaded = true; loadSecurity(); loadAudit(); } });
    $('sec-recheck').addEventListener('click', loadSecurity);
    $('audit-filter').addEventListener('change', () => loadAudit());
    $('audit-more').addEventListener('click', () => loadAudit(true));

    /* ---------- Carga: notícias (JB.ready) + dados exclusivos do painel, em paralelo ---------- */
    const failed = t => util.errorHTML('Não foi possível carregar ' + t + ' agora.');
    if (editor) {   // denúncias, newsletter e moderação: só coordenador/admin (o RLS faz o mesmo)
        $('report-rows').innerHTML = util.loadingHTML('Carregando denúncias…');
        $('comment-rows').innerHTML = util.loadingHTML('Carregando comentários…');
        Reports.load().then(ok => { loaded.reports = ok; if (ok) renderReports(); else $('report-rows').innerHTML = failed('as denúncias'); });
        JB.Newsletter.load().then(ok => { loaded.newsletter = ok; renderStats(); });
    }

    JB.ready.then(() => {
        $('admin-loading').hidden = true;
        if (JB.loadError) { $('gate').hidden = true; $('admin-error').innerHTML = util.errorHTML(); return; }
        $('panel').hidden = false;
        resetAuthor();
        renderNews(); renderAuthors();
        if (editor) JB.Comments.load().then(ok => { loaded.comments = ok; if (ok) renderComments(); else $('comment-rows').innerHTML = failed('os comentários'); });
    });
});
