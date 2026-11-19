/* Contas: login (#login-form), cadastro (#register-form) e recuperação de senha
   (#forgot-form em recuperar-senha.html, #reset-form em redefinir-senha.html).
   A recuperação usa o fluxo oficial do Supabase Auth: resetPasswordForEmail() envia o link,
   o link abre redefinir-senha.html com uma sessão de recuperação e updateUser() grava a senha. */
// Os formulários recebem o listener na hora (antes da sessão carregar), para nunca serem
// enviados de forma nativa (o que poria e-mail e senha na URL); cada envio espera JB.authReady.
(function () {
    'use strict';
    const MIN = JB.PASSWORD_MIN;
    const next = (() => {
        const n = new URLSearchParams(location.search).get('next') || '';
        return /^[\w-]+\.html$/.test(n) ? n : '';   // só páginas locais (evita redirecionamento aberto)
    })();
    const msgBox = document.getElementById('form-error');
    const show = (msg, type) => { msgBox.className = 'alert alert-' + (type || 'danger'); msgBox.textContent = msg; msgBox.hidden = false; };
    const hide = () => { if (msgBox) msgBox.hidden = true; };
    const busy = (form, on, text) => {
        const btn = form.querySelector('button[type=submit]');
        if (on) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Aguarde…'; } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
        btn.disabled = on;
    };
    const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
    // Regras de senha nova (cadastro e redefinição): mínimo do Supabase + confirmação igual.
    const passwordError = (pass, confirm) => {
        if (pass.length < MIN) return 'A senha precisa ter ao menos ' + MIN + ' caracteres.';
        if (pass !== confirm) return 'As senhas não conferem.';
        return '';
    };

    /* ---------- Login ---------- */
    const login = document.getElementById('login-form');
    if (login) {
        if (new URLSearchParams(location.search).get('senha') === 'alterada') show('Senha alterada com sucesso. Entre com a nova senha.', 'success');
        login.addEventListener('submit', async e => {
            e.preventDefault(); hide(); await JB.authReady;
            const f = login.elements;
            busy(login, true, 'Entrando…');
            const r = await JB.Auth.login(f.email.value, f.password.value);
            busy(login, false);
            if (!r.ok) return show(r.error);
            location.href = next || (r.user.role === 'admin' ? 'admin.html' : 'perfil.html');
        });
    }

    /* ---------- Cadastro ---------- */
    const reg = document.getElementById('register-form');
    if (reg) reg.addEventListener('submit', async e => {
        e.preventDefault(); hide(); await JB.authReady;
        const f = reg.elements;
        if (!f.name.value.trim()) return show('Informe seu nome.');
        if (!emailOk(f.email.value)) return show('Informe um e-mail válido.');
        const err = passwordError(f.password.value, f.confirm.value);
        if (err) return show(err);
        busy(reg, true, 'Cadastrando…');
        const r = await JB.Auth.register({ name: f.name.value, email: f.email.value, password: f.password.value });
        busy(reg, false);
        if (!r.ok) return show(r.error);
        if (r.pending) {   // Supabase com confirmação de e-mail ativada
            reg.hidden = true;
            show('Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois faça login.', 'success');
            return;
        }
        location.href = next || 'perfil.html';
    });

    /* ---------- Recuperação: 1) pedir o link ---------- */
    const forgot = document.getElementById('forgot-form');
    if (forgot) forgot.addEventListener('submit', async e => {
        e.preventDefault(); hide(); await JB.authReady;
        const email = forgot.elements.email.value;
        if (!emailOk(email)) return show('Informe um e-mail válido.');
        busy(forgot, true, 'Enviando…');
        const r = await JB.Auth.requestPasswordReset(email);
        busy(forgot, false);
        if (!r.ok) return show(r.error);
        // Mesma resposta exista ou não a conta (não revela quem é cadastrado).
        document.getElementById('forgot-step').hidden = true;
        document.getElementById('sent-email').textContent = email.trim();
        document.getElementById('forgot-sent').hidden = false;
    });

    /* ---------- Recuperação: 2) definir a nova senha ---------- */
    const reset = document.getElementById('reset-form');
    if (reset) {
        const states = ['reset-checking', 'reset-step', 'reset-invalid', 'reset-done'];
        const state = id => states.forEach(s => { document.getElementById(s).hidden = s !== id; });
        const invalid = expired => {
            document.getElementById('invalid-title').textContent = expired ? 'Link expirado ou já utilizado' : 'Link de recuperação inválido';
            document.getElementById('invalid-text').textContent = expired
                ? 'Por segurança, o link de recuperação vale por tempo limitado e só pode ser usado uma vez. Peça um novo link para continuar.'
                : 'Esta página só funciona a partir do link enviado por e-mail. Abra o link mais recente que você recebeu ou peça um novo.';
            state('reset-invalid');
        };
        JB.Auth.recoveryState().then(s => {
            if (s === 'ready') { state('reset-step'); reset.elements.password.focus(); }
            else if (s === 'unsupported') { invalid(false); document.getElementById('invalid-text').textContent = 'A recuperação de senha por e-mail só funciona com o Supabase configurado (veja docs/DEPLOY.md).'; }
            else invalid(s === 'expired');
        });
        reset.addEventListener('submit', async e => {
            e.preventDefault(); hide(); await JB.authReady;
            const f = reset.elements;
            const err = passwordError(f.password.value, f.confirm.value);
            if (err) return show(err);
            busy(reset, true, 'Salvando…');
            const r = await JB.Auth.updatePassword(f.password.value);
            busy(reset, false);
            if (r.ok) { reset.reset(); return state('reset-done'); }
            if (r.expired) return invalid(true);
            show(r.error);
        });
    }
})();
