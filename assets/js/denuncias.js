/* Formulário de denúncias / pautas. Só quem tem conta envia (o banco recusa visitantes) e só
   confirma o envio depois que o servidor aceitou. Anexos: até 6; imagens são redesenhadas num
   canvas (tira metadados como GPS e reduz o tamanho); PDFs vão como estão (até 5 MB). */
(function () {   // listener registrado na hora: o formulário nunca é enviado de forma nativa (o relato iria para a URL)
    'use strict';
    const form = document.getElementById('report-form');
    const ok = document.getElementById('report-ok');
    const fail = document.getElementById('report-fail');
    const gate = document.getElementById('report-gate');
    const anon = document.getElementById('anonimo');
    const contact = document.getElementById('contato-wrap');
    const fileInput = document.getElementById('anexo');
    const btn = form.querySelector('button[type=submit]');
    const els = form.elements;
    const MAX_FILES = 6, MAX_PDF = 5 * 1024 * 1024, IMG_TYPES = /^image\/(jpeg|png|webp|gif)$/;
    const esc = s => JB.util.esc(s);

    const syncContact = () => { contact.hidden = anon.checked; };
    anon.addEventListener('change', syncContact);

    // Lista dos arquivos escolhidos, com os problemas já apontados
    function fileProblems(files) {
        if (files.length > MAX_FILES) return 'No máximo ' + MAX_FILES + ' arquivos por denúncia.';
        for (const f of files) {
            if (f.type === 'application/pdf') { if (f.size > MAX_PDF) return '“' + f.name + '” passa de 5 MB.'; }
            else if (!IMG_TYPES.test(f.type)) return '“' + f.name + '” não é imagem (JPG, PNG, WebP, GIF) nem PDF.';
        }
        return '';
    }
    function paintFiles() {
        const files = Array.from(fileInput.files), problem = fileProblems(files);
        document.getElementById('anexo-list').innerHTML = files.map(f => '<li>' + esc(f.name) + ' <span class="text-muted">(' + Math.max(1, Math.round(f.size / 1024)) + ' KB)</span></li>').join('') +
            (problem ? '<li class="text-danger fw-semibold">' + esc(problem) + '</li>' : '');
        fileInput.classList.toggle('is-invalid', !!problem);
    }
    fileInput.addEventListener('change', paintFiles);

    // Redesenha a imagem (lado maior ≤ max px): o arquivo novo não carrega os metadados do original
    function cleanImage(file, max) {
        return new Promise((resolve, reject) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(b => b ? resolve(b) : reject(new Error('Não foi possível processar “' + file.name + '”.')), 'image/jpeg', 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler “' + file.name + '” como imagem.')); };
            img.src = url;
        });
    }

    // Visitante: convite para entrar. Conta não liberada: passo da verificação.
    JB.authReady.then(() => {
        const me = JB.Auth.current(), here = encodeURIComponent('denuncias.html');
        if (!me || !JB.Auth.accountOk()) {
            gate.innerHTML = !me
                ? '<h2 class="h5">Entre para enviar</h2><p>Para evitar abuso, as denúncias e pautas são enviadas por uma conta do portal. Você ainda pode enviar de forma anônima: seu nome e e-mail não vão para a redação.</p>' +
                  '<a class="btn btn-primary" href="login.html?next=' + here + '">Entrar</a> <a class="btn btn-outline-dark" href="cadastro.html">Criar conta</a>'
                : '<h2 class="h5">Falta um passo</h2><p>Conclua a verificação da sua conta para enviar denúncias.</p><a class="btn btn-primary" href="seguranca.html?next=' + here + '">Continuar</a>';
            gate.hidden = false; form.hidden = true;
            return;
        }
        if (!els.nome.value && !els.email.value) { els.nome.value = me.name; els.email.value = me.email; }
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        await JB.authReady;
        ok.hidden = fail.hidden = true;
        if (!JB.Auth.current() || !JB.Auth.accountOk()) return;
        const files = Array.from(fileInput.files), problem = fileProblems(files);
        if (!form.checkValidity() || problem) { form.classList.add('was-validated'); paintFiles(); if (problem) fileInput.focus(); return; }
        btn.disabled = true; const label = btn.textContent;
        const showFail = text => { fail.textContent = text; fail.hidden = false; fail.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
        try {
            const folder = JB.Reports.newFolder(), attachments = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                btn.textContent = 'Enviando anexo ' + (i + 1) + ' de ' + files.length + '…';
                // no modo local os anexos ficam no próprio navegador: imagens menores
                const blob = f.type === 'application/pdf' ? f : await cleanImage(f, JB.mode === 'local' ? 900 : 1600);
                const name = f.type === 'application/pdf' ? f.name : f.name.replace(/\.[^.]+$/, '') + '.jpg';
                attachments.push(await JB.Reports.upload(blob, name, folder));
            }
            btn.textContent = 'Enviando…';
            const r = JB.Reports.add({
                subject: els.assunto.value.trim(),
                story: els.relato.value.trim(),
                anonymous: anon.checked,
                name: anon.checked ? '' : els.nome.value.trim(),
                email: anon.checked ? '' : els.email.value.trim(),
                attachments
            });
            if (!r) { showFail('Entre na sua conta para enviar a denúncia.'); return; }
            const saved = await JB.flush();
            if (!saved) { showFail('Não foi possível enviar a denúncia agora. Seu texto continua no formulário: verifique a conexão e tente novamente.'); return; }
            form.reset(); form.classList.remove('was-validated'); syncContact(); paintFiles();
            ok.hidden = false; ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
            console.error(err);
            showFail((err && err.message) || 'Não foi possível enviar os anexos. Tente de novo.');
        } finally { btn.disabled = false; btn.textContent = label; }
    });
})();
