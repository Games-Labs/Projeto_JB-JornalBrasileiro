/* Painel Administrativo — matérias (fluxo editorial, agendamento, tipos de conteúdo, ao vivo,
   fontes, cronologia, gráfico, correções e versões), autores, audiência, denúncias e moderação.
   Esconder o painel aqui é só interface: quem impede um não-editor de ler denúncias ou
   gravar notícias são as políticas RLS do Supabase. */
JB.authReady.then(function () {
    'use strict';
    const { News, Reports, Authors, Versions, CATEGORIES, KINDS, VERDICTS, IMAGES, STATUS, STATUS_FLOW, util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);

    if (!JB.Auth.isAdmin()) { $('admin-loading').hidden = true; $('gate').hidden = false; return; }

    const form = $('news-form');
    const tbody = $('news-rows');
    const formTitle = $('form-title');
    const msg = $('admin-msg');
    const saveBtn = form.querySelector('button[type=submit]');
    const note = (t, type) => { msg.className = 'alert alert-' + (type || 'success'); msg.textContent = t; msg.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => { msg.hidden = true; }, 4500); };
    const field = n => form.elements[n];
    const opts = (obj, label) => Object.keys(obj).map(k => '<option value="' + k + '">' + esc(label ? label(obj[k]) : obj[k]) + '</option>').join('');
    const nowIso = () => new Date().toISOString();
    const hm = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    field('category').innerHTML = opts(CATEGORIES, c => c.label);
    field('kind').innerHTML = opts(KINDS);
    field('verdict').innerHTML += opts(VERDICTS, v => v.label);
    $('news-status').innerHTML += opts(STATUS) + '<option value="agendada">Agendada</option>';
    $('news-kind').innerHTML += opts(KINDS);

    /* ---------- Campos "a | b" (uma linha por item) ---------- */
    const parseLines = (text, a, b) => text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const i = l.indexOf('|');
        const o = {}; o[a] = (i < 0 ? l : l.slice(0, i)).trim(); o[b] = i < 0 ? '' : l.slice(i + 1).trim();
        return o;
    }).filter(o => o[a] || o[b]);
    const formatLines = (list, a, b) => (list || []).map(o => (o[a] || '') + (o[b] ? ' | ' + o[b] : '')).join('\n');
    // Aceita "14000", "14.000", "8,6" e "8.6"
    const toNumber = v => {
        let s = String(v).trim().replace(/\s/g, '');
        if (!s) return NaN;
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        return Number(s);
    };
    function readChart() {
        const items = parseLines(field('chartItems').value, 'label', 'value').slice(0, 12)
            .map(o => ({ label: o.label.slice(0, 80), value: toNumber(o.value) })).filter(o => o.label && isFinite(o.value));
        if (!items.length) return null;
        return { title: field('chartTitle').value.trim(), unit: field('chartUnit').value.trim(), source: field('chartSource').value.trim(), items };
    }
    function readSources() {
        return parseLines(field('sources').value, 'label', 'url').map(s => {
            if (!s.url && /^https?:\/\//i.test(s.label)) return { label: s.label, url: s.label };   // linha só com o link
            return s;
        });
    }

    /* ---------- Tipo de conteúdo: mostra só os campos que fazem sentido ---------- */
    function syncKind() {
        const k = field('kind').value;
        $('verdict-wrap').hidden = k !== 'checagem';
        field('verdict').required = k === 'checagem';
        $('live-wrap').hidden = $('updates-box').hidden = k !== 'aovivo';
        $('body-help').hidden = k !== 'entrevista';
    }
    field('kind').addEventListener('change', syncKind);

    /* ---------- Atualizações ao vivo e correções (listas editáveis) ---------- */
    let formUpdates = [], formCorrections = [];
    function renderUpdates() {
        const list = formUpdates.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        $('updates-list').innerHTML = list.map(u => '<li><span><strong>' + esc(hm(u.date)) + '</strong> ' + esc(u.text) + (u.author ? ' <small class="opacity-75">— ' + esc(u.author) + '</small>' : '') + '</span>' +
            '<button type="button" class="btn btn-sm btn-outline-primary" data-uprm="' + esc(u.date + '|' + u.text) + '" aria-label="Remover atualização">×</button></li>').join('') || '<li class="text-muted small">Nenhuma atualização ainda.</li>';
    }
    function renderCorrections() {
        $('corrections-list').innerHTML = formCorrections.map((c, i) => '<li><span><strong>' + esc(hm(c.date)) + '</strong> ' + esc(c.text) + '</span>' +
            '<button type="button" class="btn btn-sm btn-outline-primary" data-corrm="' + i + '" aria-label="Remover correção">×</button></li>').join('') || '<li class="text-muted small">Nenhuma correção registrada.</li>';
    }
    // Em matéria já salva, a lista vai para o servidor na hora (é o que o leitor vê ao vivo)
    async function persistList(key, value, okText) {
        const id = field('newsId').value;
        if (!id) return;
        const patch = { id }; patch[key] = value;
        News.save(patch);
        const ok = await JB.flush();
        if (ok) note(okText); else { const n = News.get(id); formUpdates = (n.updates || []).slice(); formCorrections = (n.corrections || []).slice(); renderUpdates(); renderCorrections(); }
        renderNews();
    }
    $('add-update').addEventListener('click', () => {
        const ta = $('f-update'), text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        const me = JB.Auth.current();
        formUpdates.push({ date: nowIso(), text, author: me ? me.name : '' });
        ta.value = ''; renderUpdates();
        persistList('updates', formUpdates.slice(), 'Atualização publicada.');
    });
    $('updates-list').addEventListener('click', e => {
        const b = e.target.closest('[data-uprm]'); if (!b || !confirm('Remover esta atualização?')) return;
        formUpdates = formUpdates.filter(u => (u.date + '|' + u.text) !== b.dataset.uprm); renderUpdates();
        persistList('updates', formUpdates.slice(), 'Atualização removida.');
    });
    $('corrections-list').addEventListener('click', e => {
        const b = e.target.closest('[data-corrm]'); if (!b || !confirm('Remover esta correção? Pela política de correções, o ideal é mantê-la.')) return;
        formCorrections.splice(Number(b.dataset.corrm), 1); renderCorrections();
        persistList('corrections', formCorrections.slice(), 'Correção removida.');
    });

    /* ---------- Seletor de imagem: galeria local, upload ou URL ---------- */
    const preview = $('img-preview');
    const options = $('img-options');
    const warn = $('img-warn');
    options.innerHTML = '<button type="button" class="img-option auto" data-img="" title="Automática (pela categoria)">Automática</button>' +
        Object.keys(IMAGES).map(p => '<button type="button" class="img-option" data-img="' + esc(p) + '" title="' + esc(IMAGES[p]) + '"><img src="' + esc(util.root() + p) + '" alt="' + esc(IMAGES[p]) + '" loading="lazy"></button>').join('');

    function setImage(value) {            // value: '' | caminho local | URL (Storage ou externa) | data URL (modo local)
        field('image').value = value;
        warn.hidden = true;
        const fake = { image: value, category: field('category').value };
        preview.src = util.imgSrc(fake);
        options.querySelectorAll('.img-option').forEach(b => b.classList.toggle('selected', b.dataset.img === value));
        if (!(value in IMAGES)) field('imageUrl').value = /^https?:/.test(value) ? value : '';
    }
    const warnImg = (t, type) => { warn.className = 'alert alert-' + (type || 'warning') + ' py-1 px-2 small mt-2 mb-0'; warn.textContent = t; warn.hidden = false; };
    options.addEventListener('click', e => { const b = e.target.closest('.img-option'); if (b) { $('img-file').value = ''; setImage(b.dataset.img); } });
    field('category').addEventListener('change', () => { if (!field('image').value) setImage(''); });
    field('imageUrl').addEventListener('input', e => {
        const v = e.target.value.trim();
        if (v && !/^https:\/\//i.test(v)) { warnImg('Use um endereço que comece com https://'); return; }
        setImage(v);
    });
    // Reduz a imagem no navegador (lado maior ≤ max px, JPEG 80%) antes de enviar
    function resize(file, max) {
        return new Promise((resolve, reject) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(b => b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.')), 'image/jpeg', 0.8);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esse arquivo como imagem.')); };
            img.src = url;
        });
    }
    let uploading = false;
    $('img-file').addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        if (!/^image\//.test(file.type)) { warnImg('Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).'); return; }
        uploading = true; saveBtn.disabled = true; warnImg('Enviando imagem…', 'info');
        try { setImage(await JB.Media.upload(await resize(file, 1200))); }
        catch (err) { warnImg(err.message || 'Falha ao enviar a imagem.', 'danger'); e.target.value = ''; }
        finally { uploading = false; saveBtn.disabled = false; }
    });

    /* ---------- Tabela de matérias ---------- */
    const statusOf = n => util.isScheduled(n) ? 'agendada' : (n.status || 'publicada');
    function statusBadge(n) {
        if (util.isScheduled(n)) return '<span class="badge status-badge bg-info text-dark" title="Publica em ' + esc(util.fmtDate(n.date)) + '">Agendada · ' + esc(hm(n.date)) + '</span>';
        return '<span class="badge status-badge ' + (util.isPublished(n) ? 'bg-success' : 'bg-secondary') + '">' + esc(STATUS[n.status || 'publicada']) + '</span>';
    }
    function renderNews() {
        const all = News.everything();
        const q = $('news-q').value.trim().toLowerCase(), st = $('news-status').value, kd = $('news-kind').value;
        const list = all.filter(n => (!q || (n.title + ' ' + n.author).toLowerCase().includes(q)) && (!st || statusOf(n) === st) && (!kd || (n.kind || 'noticia') === kd));
        const nextOf = n => { const i = STATUS_FLOW.indexOf(n.status || 'publicada'); return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : ''; };
        tbody.innerHTML = list.map(n =>
            '<tr><td><img class="admin-thumb" src="' + esc(util.imgSrc(n)) + '" alt="" loading="lazy"></td>' +
            '<td><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a>' + (n.featured ? ' <span class="badge bg-primary">Manchete</span>' : '') +
            '<div class="small opacity-75">' + esc(KINDS[n.kind] || KINDS.noticia) + (n.kind === 'aovivo' && n.live ? ' · ao vivo' : '') + ' · ' + esc(n.author) + (util.wasUpdated(n) ? ' · atualizada ' + esc(hm(n.updated_at)) : '') + '</div></td>' +
            '<td>' + esc(util.catLabel(n.category)) + '</td>' +
            '<td>' + statusBadge(n) + '</td>' +
            '<td class="text-nowrap">' + new Date(n.date).toLocaleDateString('pt-BR') + '</td>' +
            '<td><div class="d-flex flex-wrap gap-1">' + (nextOf(n) ? '<button class="btn btn-sm btn-primary" data-adv="' + esc(n.id) + '" title="Mover para: ' + esc(STATUS[nextOf(n)]) + '">→ ' + esc(STATUS[nextOf(n)]) + '</button>' : '') +
            '<button class="btn btn-sm btn-outline-dark" data-edit="' + esc(n.id) + '">Editar</button>' +
            '<button class="btn btn-sm btn-outline-dark" data-hist="' + esc(n.id) + '">Versões</button>' +
            '<button class="btn btn-sm btn-outline-primary" data-del="' + esc(n.id) + '">Excluir</button></div></td></tr>').join('') ||
            '<tr><td colspan="6" class="text-center text-muted">' + (all.length ? 'Nenhuma matéria neste filtro.' : 'Nenhuma notícia cadastrada.') + '</td></tr>';
        $('news-count').textContent = all.length;
        renderStats();
        if (loaded.audience) renderAudience();
    }
    ['news-q', 'news-status', 'news-kind'].forEach(id => $(id).addEventListener('input', renderNews));

    const loaded = { comments: false, reports: false, newsletter: false, audience: false };
    function renderStats() {
        const list = News.everything();
        const v = (key, n) => loaded[key] ? n : '…';
        const cards = [
            ['Publicadas', list.filter(util.isPublished).length], ['Em produção', list.filter(n => ['rascunho', 'revisao', 'aprovada'].includes(n.status)).length],
            ['Agendadas', list.filter(util.isScheduled).length], ['Ao vivo', list.filter(n => n.kind === 'aovivo' && n.live && util.isPublished(n)).length],
            ['Denúncias', v('reports', Reports.all().length)], ['Comentários', v('comments', JB.Comments.flat().length)], ['Leituras', JB.Views.total()], ['Newsletter', v('newsletter', JB.Newsletter.count())]
        ];
        $('stats').innerHTML = cards.map(c => '<div class="col-6 col-md-3 col-xl"><div class="stat-card"><strong>' + c[1] + '</strong><span>' + c[0] + '</span></div></div>').join('');
    }

    /* ---------- Formulário de matéria ---------- */
    // datetime-local trabalha em horário local, sem fuso
    const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    let editingDate = null;
    function resetForm() {
        form.reset(); field('newsId').value = ''; setImage(''); formTitle.textContent = 'Nova notícia'; form.classList.remove('was-validated');
        formUpdates = []; formCorrections = []; editingDate = null; renderUpdates(); renderCorrections(); syncKind();
        $('extras').open = false; $('preview-link').hidden = true;
    }
    function fillForm(n) {
        field('newsId').value = n.id; field('title').value = n.title; field('subtitle').value = n.subtitle; field('category').value = n.category; field('author').value = n.author;
        field('status').value = n.status || 'publicada'; field('kind').value = n.kind || 'noticia'; field('verdict').value = n.verdict || ''; field('live').checked = !!n.live;
        field('pubdate').value = toLocalInput(n.date); editingDate = n.date;
        field('body').value = n.body.join('\n\n'); field('featured').checked = !!n.featured;
        field('sources').value = formatLines(n.sources, 'label', 'url'); field('timeline').value = formatLines(n.timeline, 'when', 'text'); field('people').value = formatLines(n.people, 'name', 'role');
        const c = n.chart || {};
        field('chartTitle').value = c.title || ''; field('chartUnit').value = c.unit || ''; field('chartSource').value = c.source || '';
        field('chartItems').value = (c.items || []).map(i => i.label + ' | ' + i.value).join('\n');
        $('extras').open = !!((n.sources || []).length || (n.timeline || []).length || (n.people || []).length || n.chart);
        formUpdates = (n.updates || []).slice(); formCorrections = (n.corrections || []).slice(); renderUpdates(); renderCorrections();
        field('correction').value = '';
        setImage(n.image || ''); syncKind();
        $('preview-link').href = util.articleUrl(n); $('preview-link').hidden = false;
        formTitle.textContent = 'Editar notícia'; form.scrollIntoView({ behavior: 'smooth' });
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (uploading) return;
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        const kind = field('kind').value;
        const pub = field('pubdate').value;
        const correction = field('correction').value.trim();
        if (correction) formCorrections.push({ date: nowIso(), text: correction });
        const item = {
            id: field('newsId').value || undefined, title: field('title').value.trim(), subtitle: field('subtitle').value.trim(), category: field('category').value,
            image: field('image').value, status: field('status').value, author: field('author').value.trim() || 'Redação JB', featured: field('featured').checked,
            body: field('body').value.split(/\n+/).map(s => s.trim()).filter(Boolean),
            kind, verdict: kind === 'checagem' ? (field('verdict').value || null) : null, live: kind === 'aovivo' && field('live').checked,
            sources: readSources(), timeline: parseLines(field('timeline').value, 'when', 'text'), people: parseLines(field('people').value, 'name', 'role'),
            chart: readChart(), updates: kind === 'aovivo' ? formUpdates.slice() : [], corrections: formCorrections.slice()
        };
        // Data de publicação: a escolhida (agendamento) ou agora. Editando sem mexer no campo, mantém a data.
        if (pub) {
            const chosen = new Date(pub).toISOString();
            if (!item.id || toLocalInput(editingDate) !== pub) item.date = chosen;
        } else if (!item.id || item.status === 'publicada') item.date = nowIso();
        if (item.featured) News.everything().filter(n => n.featured && n.id !== item.id).forEach(n => News.save({ id: n.id, featured: false })); // apenas uma manchete
        const editing = !!item.id;
        saveBtn.disabled = true;
        News.save(item);
        const ok = await JB.flush();
        saveBtn.disabled = false;
        if (!ok) {
            if (correction) formCorrections.pop();
            note(JB.mode === 'local' ? 'Atenção: o armazenamento do navegador está cheio; a notícia não foi salva. Use uma imagem menor ou da galeria.' : 'A notícia não foi salva. Verifique a conexão e tente de novo (o formulário foi mantido).', 'danger');
            renderNews(); return;
        }
        const saved = News.get(item.id) || item;
        note((editing ? 'Notícia atualizada' : 'Notícia salva') + ' — ' + (util.isScheduled(saved) ? 'agendada para ' + util.fmtDate(saved.date) : 'status: ' + STATUS[item.status]) + '.');
        resetForm(); renderNews();
    });
    $('cancel-edit').addEventListener('click', resetForm);

    tbody.addEventListener('click', async e => {
        const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), adv = e.target.closest('[data-adv]'), hist = e.target.closest('[data-hist]');
        if (adv) {
            const n = News.get(adv.dataset.adv);
            const next = STATUS_FLOW[STATUS_FLOW.indexOf(n.status || 'publicada') + 1];
            const patch = { id: n.id, status: next };
            // Ao publicar: vale a data agendada (se for futura); senão, publica agora.
            if (next === 'publicada' && !(new Date(n.date) > Date.now())) patch.date = nowIso();
            News.save(patch); renderNews();
            if (await JB.flush()) { const s = News.get(n.id); note('“' + n.title + '” movida para: ' + (s && util.isScheduled(s) ? 'Publicada (agendada para ' + util.fmtDate(s.date) + ')' : STATUS[next]) + '.'); }
        }
        if (ed) fillForm(News.get(ed.dataset.edit));
        if (hist) openVersions(hist.dataset.hist);
        if (del && confirm('Excluir esta notícia? As versões anteriores também serão apagadas.')) { News.remove(del.dataset.del); renderNews(); if (await JB.flush()) note('Notícia excluída.', 'warning'); }
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
                    '<button class="btn btn-sm btn-outline-dark" data-restore="' + esc(v.id) + '">Restaurar esta versão</button></div>' +
                    '<h3 class="h6 mt-2 mb-1">' + esc(s.title) + '</h3><p class="small mb-1">' + esc(s.subtitle) + '</p>' +
                    '<p class="small opacity-75 mb-0">' + esc(KINDS[s.kind] || '') + ' · ' + esc(util.catLabel(s.category)) + ' · ' + esc(s.author) + ' · ' + (s.body || []).length + ' parágrafos</p>' +
                    '<details class="small mt-1"><summary>Ver texto</summary>' + (s.body || []).map(p => '<p class="mb-1">' + esc(p) + '</p>').join('') + '</details></div>';
            }).join('') || '<p class="text-muted">Nenhuma versão anterior: esta matéria ainda não foi editada depois de criada.</p>');
    }
    vbody.addEventListener('click', async e => {
        const b = e.target.closest('[data-restore]'); if (!b || !versionsOf) return;
        const v = Versions.forNews(versionsOf).find(x => String(x.id) === b.dataset.restore);
        if (!v || !confirm('Restaurar esta versão? O conteúdo atual será guardado como versão anterior.')) return;
        const patch = Object.assign({ id: versionsOf }, v.snapshot);
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
        $('authors-list').innerHTML = list.map(a => '<option value="' + esc(a.name) + '">').join('');
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
                '<p class="mb-0 mt-2" style="white-space:pre-wrap">' + esc(c.text) + '</p></div>';
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

    /* ---------- Carga: notícias (JB.ready) + dados exclusivos do painel, em paralelo ---------- */
    $('report-rows').innerHTML = util.loadingHTML('Carregando denúncias…');
    $('comment-rows').innerHTML = util.loadingHTML('Carregando comentários…');
    const failed = t => util.errorHTML('Não foi possível carregar ' + t + ' agora.');
    Reports.load().then(ok => { loaded.reports = ok; if (ok) renderReports(); else $('report-rows').innerHTML = failed('as denúncias'); });
    JB.Newsletter.load().then(ok => { loaded.newsletter = ok; renderStats(); });

    JB.ready.then(() => {
        $('admin-loading').hidden = true;
        if (JB.loadError) { $('gate').hidden = true; $('admin-error').innerHTML = util.errorHTML(); return; }
        $('panel').hidden = false;
        resetForm(); resetAuthor();
        renderNews(); renderAuthors();
        JB.Comments.load().then(ok => { loaded.comments = ok; if (ok) renderComments(); else $('comment-rows').innerHTML = failed('os comentários'); });
    });
});
