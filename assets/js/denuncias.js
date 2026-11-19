/* Formulário de denúncias / pautas. Só confirma o envio depois que o servidor aceitou. */
(function () {   // listener registrado na hora: o formulário nunca é enviado de forma nativa (o relato iria para a URL)
    'use strict';
    const form = document.getElementById('report-form');
    const ok = document.getElementById('report-ok');
    const fail = document.getElementById('report-fail');
    const anon = document.getElementById('anonimo');
    const contact = document.getElementById('contato-wrap');
    const btn = form.querySelector('button[type=submit]');
    const els = form.elements;

    const syncContact = () => { contact.hidden = anon.checked; };
    anon.addEventListener('change', syncContact);
    JB.authReady.then(() => { const me = JB.Auth.current(); if (me && !els.nome.value && !els.email.value) { els.nome.value = me.name; els.email.value = me.email; } });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        await JB.authReady;
        ok.hidden = fail.hidden = true;
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        const file = document.getElementById('anexo').files[0];
        btn.disabled = true; const label = btn.textContent; btn.textContent = 'Enviando…';
        JB.Reports.add({
            subject: els.assunto.value.trim(),
            story: els.relato.value.trim(),
            anonymous: anon.checked,
            name: anon.checked ? '' : els.nome.value.trim(),
            email: anon.checked ? '' : els.email.value.trim(),
            // Apenas metadados (nome e tamanho): o conteúdo do arquivo não é enviado nem armazenado.
            attachment: file ? { name: file.name.slice(0, 200), size: file.size } : null
        });
        const saved = await JB.flush();
        btn.disabled = false; btn.textContent = label;
        const box = saved ? ok : fail;
        if (saved) { form.reset(); form.classList.remove('was-validated'); syncContact(); }
        box.hidden = false; box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
})();
