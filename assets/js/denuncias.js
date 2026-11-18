/* Formulário de denúncias / pautas — salva em localStorage (jb_reports) */
(function () {
    'use strict';
    const form = document.getElementById('report-form');
    const ok = document.getElementById('report-ok');
    const anon = document.getElementById('anonimo');
    const contact = document.getElementById('contato-wrap');
    const me = JB.Auth.current();

    anon.addEventListener('change', () => { contact.hidden = anon.checked; });
    if (me) { document.getElementById('nome').value = me.name; document.getElementById('email').value = me.email; }

    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        const file = document.getElementById('anexo').files[0];
        JB.Reports.add({
            subject: form.assunto.value.trim(),
            story: form.relato.value.trim(),
            anonymous: anon.checked,
            name: anon.checked ? '' : form.nome.value.trim(),
            email: anon.checked ? '' : form.email.value.trim(),
            // Apenas metadados: o conteúdo do arquivo não é armazenado (limite do localStorage)
            attachment: file ? { name: file.name, size: file.size } : null
        });
        form.reset(); form.classList.remove('was-validated'); contact.hidden = false;
        ok.hidden = false; ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
})();
