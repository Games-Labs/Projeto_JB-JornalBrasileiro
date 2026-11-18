/* Login (#login-form) e cadastro (#register-form) */
(function () {
    'use strict';
    const next = (() => {
        const n = new URLSearchParams(location.search).get('next') || '';
        return /^[\w-]+\.html$/.test(n) ? n : '';   // só páginas locais
    })();
    const showError = (msg) => { const el = document.getElementById('form-error'); el.textContent = msg; el.hidden = false; };

    const login = document.getElementById('login-form');
    if (login) login.addEventListener('submit', e => {
        e.preventDefault();
        const r = JB.Auth.login(login.email.value, login.password.value);
        if (!r.ok) return showError(r.error);
        location.href = next || (r.user.role === 'admin' ? 'admin.html' : 'perfil.html');
    });

    const reg = document.getElementById('register-form');
    if (reg) reg.addEventListener('submit', e => {
        e.preventDefault();
        if (reg.password.value.length < 6) return showError('A senha precisa ter ao menos 6 caracteres.');
        if (reg.password.value !== reg.confirm.value) return showError('As senhas não conferem.');
        const r = JB.Auth.register({ name: reg.elements.name.value, email: reg.email.value, password: reg.password.value });
        if (!r.ok) return showError(r.error);
        location.href = next || 'perfil.html';
    });
})();
