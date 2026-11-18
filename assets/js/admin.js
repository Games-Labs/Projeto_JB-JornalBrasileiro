/* Painel Administrativo — CRUD de notícias + caixa de denúncias */
(function () {
    'use strict';
    const { News, Reports, CATEGORIES, IMAGES, util } = JB;
    const { esc } = util;

    if (!JB.Auth.isAdmin()) { document.getElementById('gate').hidden = false; return; }
    document.getElementById('panel').hidden = false;

    const form = document.getElementById('news-form');
    const tbody = document.getElementById('news-rows');
    const formTitle = document.getElementById('form-title');
    const msg = document.getElementById('admin-msg');
    const note = (t, type) => { msg.className = 'alert alert-' + (type || 'success'); msg.textContent = t; msg.hidden = false; setTimeout(() => { msg.hidden = true; }, 3500); };
    const field = n => form.elements[n];

    field('category').innerHTML = Object.keys(CATEGORIES).map(k => '<option value="' + k + '">' + esc(CATEGORIES[k].label) + '</option>').join('');

    /* ---------- Seletor de imagem: galeria local, upload ou URL ---------- */
    const preview = document.getElementById('img-preview');
    const options = document.getElementById('img-options');
    const warn = document.getElementById('img-warn');
    options.innerHTML = '<button type="button" class="img-option auto" data-img="" title="Automática (pela categoria)">Automática</button>' +
        Object.keys(IMAGES).map(p => '<button type="button" class="img-option" data-img="' + p + '" title="' + esc(IMAGES[p]) + '"><img src="' + util.root() + p + '" alt="' + esc(IMAGES[p]) + '"></button>').join('');

    function setImage(value) {            // value: '' | caminho local | data URL | URL
        field('image').value = value;
        warn.hidden = true;
        const fake = { image: value, category: field('category').value };
        preview.src = util.imgSrc(fake);
        options.querySelectorAll('.img-option').forEach(b => b.classList.toggle('selected', b.dataset.img === value));
        if (!(value in IMAGES)) field('imageUrl').value = /^https?:/.test(value) ? value : '';
    }
    options.addEventListener('click', e => { const b = e.target.closest('.img-option'); if (b) { document.getElementById('img-file').value = ''; setImage(b.dataset.img); } });
    field('category').addEventListener('change', () => { if (!field('image').value) setImage(''); });
    field('imageUrl').addEventListener('input', e => setImage(e.target.value.trim()));
    document.getElementById('img-file').addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
            const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
            const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            setImage(c.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => { warn.textContent = 'Não foi possível ler esse arquivo como imagem.'; warn.hidden = false; };
        img.src = url;
    });

    function renderNews() {
        const list = News.all();
        tbody.innerHTML = list.map(n =>
            '<tr><td><img class="admin-thumb" src="' + esc(util.imgSrc(n)) + '" alt=""></td>' +
            '<td><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a>' + (n.featured ? ' <span class="badge bg-primary">Destaque</span>' : '') + '</td>' +
            '<td>' + esc(util.catLabel(n.category)) + '</td><td class="text-nowrap">' + new Date(n.date).toLocaleDateString('pt-BR') + '</td>' +
            '<td class="text-nowrap"><button class="btn btn-sm btn-outline-dark" data-edit="' + n.id + '">Editar</button> ' +
            '<button class="btn btn-sm btn-outline-primary" data-del="' + n.id + '">Excluir</button></td></tr>').join('') ||
            '<tr><td colspan="5" class="text-center text-muted">Nenhuma notícia cadastrada.</td></tr>';
        document.getElementById('news-count').textContent = list.length;
    }

    function renderReports() {
        const list = Reports.all();
        document.getElementById('reports-count').textContent = list.length;
        document.getElementById('report-rows').innerHTML = list.map(r =>
            '<div class="panel-box mb-3"><div class="d-flex justify-content-between gap-2"><strong>' + esc(r.subject) + '</strong>' +
            '<button class="btn btn-sm btn-outline-primary" data-rdel="' + r.id + '">Excluir</button></div>' +
            '<small class="text-muted">' + esc(util.fmtDate(r.date)) + ' • ' + (r.anonymous ? 'Anônimo' : esc(r.name || '—') + ' (' + esc(r.email || 'sem e-mail') + ')') + '</small>' +
            '<p class="mb-1 mt-2" style="white-space:pre-wrap">' + esc(r.story) + '</p>' +
            (r.attachment ? '<small>📎 ' + esc(r.attachment.name) + ' (' + Math.round(r.attachment.size / 1024) + ' KB)</small>' : '') + '</div>').join('') ||
            '<p class="text-muted">Nenhuma denúncia recebida.</p>';
    }

    function resetForm() { form.reset(); field('newsId').value = ''; setImage(''); formTitle.textContent = 'Nova notícia'; form.classList.remove('was-validated'); }

    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        const item = {
            id: field('newsId').value || undefined, title: field('title').value.trim(), subtitle: field('subtitle').value.trim(), category: field('category').value,
            image: field('image').value, author: field('author').value.trim() || 'Redação JB', featured: field('featured').checked,
            body: field('body').value.split(/\n+/).map(s => s.trim()).filter(Boolean)
        };
        if (item.featured) News.all().filter(n => n.featured && n.id !== item.id).forEach(n => News.save({ id: n.id, featured: false })); // apenas uma manchete
        const editing = !!item.id;
        News.save(item);
        if (!JB.storageOk()) { note('Atenção: o armazenamento do navegador está cheio; a notícia não foi salva de forma permanente. Use uma imagem menor ou da galeria.', 'danger'); resetForm(); renderNews(); return; }
        note(editing ? 'Notícia atualizada.' : 'Notícia publicada.');
        resetForm(); renderNews();
    });
    document.getElementById('cancel-edit').addEventListener('click', resetForm);

    tbody.addEventListener('click', e => {
        const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
        if (ed) {
            const n = News.get(ed.dataset.edit);
            field('newsId').value = n.id; field('title').value = n.title; field('subtitle').value = n.subtitle; field('category').value = n.category; field('author').value = n.author;
            field('body').value = n.body.join('\n\n'); field('featured').checked = !!n.featured;
            setImage(n.image || '');
            formTitle.textContent = 'Editar notícia'; form.scrollIntoView({ behavior: 'smooth' });
        }
        if (del && confirm('Excluir esta notícia?')) { News.remove(del.dataset.del); note('Notícia excluída.', 'warning'); renderNews(); }
    });
    document.getElementById('report-rows').addEventListener('click', e => {
        const b = e.target.closest('[data-rdel]');
        if (b && confirm('Excluir esta denúncia?')) { Reports.remove(b.dataset.rdel); renderReports(); }
    });

    setImage('');
    renderNews(); renderReports();
})();
