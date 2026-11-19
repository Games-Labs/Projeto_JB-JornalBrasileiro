/* Contas: login (#login-form), cadastro (#register-form) e recuperação de senha
   (#forgot-form e #code-form em recuperar-senha.html, #reset-form em redefinir-senha.html).
   A recuperação usa o fluxo oficial do Supabase Auth: resetPasswordForEmail() envia um e-mail com
   código e link. O código é conferido pelo Supabase (verifyOtp type 'recovery') na própria página;
   o link abre redefinir-senha.html. Os dois criam uma sessão de recuperação e updateUser() grava a senha.
   Proteções: CAPTCHA (Turnstile) no login, cadastro e pedido de recuperação; regras de senha; idade
   mínima no cadastro; espera crescente depois de várias senhas erradas (o limite de verdade é o do
   Supabase, por IP). Depois do login, quem ainda precisa confirmar a idade ou a verificação em duas
   etapas vai para seguranca.html. */
// Os formulários recebem o listener na hora (antes da sessão carregar), para nunca serem
// enviados de forma nativa (o que poria e-mail e senha na URL); cada envio espera JB.authReady.
(function () {
    'use strict';
    const { util } = JB;
    const next = (() => {
        const n = new URLSearchParams(location.search).get('next') || '';
        return /^[\w-]+\.html$/.test(n) ? n : '';   // só páginas locais (evita redirecionamento aberto)
    })();
    const msgBox = document.getElementById('form-error');
    const show = (msg, type) => { msgBox.className = 'alert alert-' + (type || 'danger') + (msgBox.classList.contains('mt-3') ? ' mt-3 mb-0' : ''); msgBox.textContent = msg; msgBox.hidden = false; };
    const hide = () => { if (msgBox) msgBox.hidden = true; };
    const busy = (form, on, text) => {
        const btn = form.querySelector('button[type=submit]');
        if (on) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Aguarde…'; } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
        btn.disabled = on;
    };
    const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
    // Regras de senha nova (cadastro, redefinição): as mesmas do Supabase + confirmação igual.
    const passwordError = (pass, confirm) => {
        const missing = util.passwordIssues(pass);
        if (missing.length) return 'A senha precisa ter ' + missing.join(', ') + '.';
        if (pass !== confirm) return 'As senhas não conferem.';
        return '';
    };
    // Lista de regras que se atualiza enquanto a pessoa digita
    document.querySelectorAll('[data-pw-rules]').forEach(ul => {
        const input = ul.closest('form').elements[ul.dataset.pwRules];
        const paint = () => {
            const missing = util.passwordIssues(input.value);
            ul.innerHTML = input.value ? util.passwordIssues('').map(r => '<li class="' + (missing.includes(r) ? 'todo' : 'done') + '">' + util.esc(r) + '</li>').join('') : '';
        };
        input.addEventListener('input', paint);
    });
    // CAPTCHA de cada formulário (só no modo Supabase com TURNSTILE_SITE_KEY)
    const captchaOf = form => { const el = form && form.querySelector('[data-captcha]'); return JB.Captcha.mount(el); };
    const destFor = user => next || (user && util.isStaffRole(user.role) ? 'admin.html' : 'perfil.html');
    // Conta ainda não liberada (idade ou verificação em duas etapas): passa por seguranca.html
    const proceed = user => {
        const dest = destFor(user);
        location.href = JB.Auth.accountOk() ? dest : 'seguranca.html?next=' + encodeURIComponent(dest);
    };

    /* ---------- Login com o Google (login e cadastro) ---------- */
    const googleBox = document.getElementById('google-box');
    if (googleBox) {
        JB.Auth.googleAvailable().then(on => { googleBox.hidden = !on; });
        document.getElementById('google-login').addEventListener('click', async e => {
            e.target.disabled = true; hide();
            const r = await JB.Auth.loginWithGoogle(next);
            if (!r.ok) { e.target.disabled = false; show(r.error); }
        });
    }

    /* ---------- Login ---------- */
    const login = document.getElementById('login-form');
    if (login) {
        const captcha = captchaOf(login);
        if (new URLSearchParams(location.search).get('senha') === 'alterada') show('Senha alterada com sucesso. Entre com a nova senha.', 'success');
        // Volta do Google: a sessão já foi aberta pelo supabase-js; termina o fluxo daqui.
        JB.authReady.then(async () => {
            const err = JB.Auth.oauthError && JB.Auth.oauthError();
            if (err) return show('Não foi possível entrar com o Google: ' + err);
            const me = JB.Auth.current();
            if (me && JB.Auth.finishLogin) { show('Você já está conectado. Redirecionando…', 'info'); await JB.Auth.finishLogin(); proceed(me); }
        });
        // Espera crescente depois de 5 senhas erradas nesta aba (30 s, 1 min, 2 min… até 15 min).
        const GUARD = 'jb_login_guard';
        const guard = { get() { try { return JSON.parse(sessionStorage.getItem(GUARD)) || { fails: 0, until: 0 }; } catch (e) { return { fails: 0, until: 0 }; } }, set(v) { try { sessionStorage.setItem(GUARD, JSON.stringify(v)); } catch (e) { } } };
        login.addEventListener('submit', async e => {
            e.preventDefault(); hide();
            const g = guard.get(), wait = Math.ceil((g.until - Date.now()) / 1000);
            if (wait > 0) return show('Muitas tentativas com senha errada. Aguarde ' + (wait > 90 ? Math.ceil(wait / 60) + ' minutos' : wait + ' segundos') + ' e tente de novo, ou use “Esqueci minha senha”.');
            await JB.authReady;
            const f = login.elements;
            busy(login, true, 'Entrando…');
            const token = await captcha.token();
            const r = await JB.Auth.login(f.email.value, f.password.value, token);
            captcha.reset();
            busy(login, false);
            if (!r.ok) {
                if (/incorretos/.test(r.error)) {
                    g.fails++;
                    if (g.fails >= 5) g.until = Date.now() + Math.min(15 * 60, 30 * Math.pow(2, g.fails - 5)) * 1000;
                    guard.set(g);
                }
                return show(r.error);
            }
            guard.set({ fails: 0, until: 0 });
            proceed(r.user);
        });
    }

    /* ---------- Cadastro ---------- */
    const reg = document.getElementById('register-form');
    if (reg) {
        const captcha = captchaOf(reg);
        const birth = reg.elements.birth;
        birth.max = new Date().toISOString().slice(0, 10);
        reg.addEventListener('submit', async e => {
            e.preventDefault(); hide(); await JB.authReady;
            const f = reg.elements;
            if (!f.name.value.trim()) return show('Informe seu nome.');
            if (!emailOk(f.email.value)) return show('Informe um e-mail válido.');
            const age = util.ageFrom(f.birth.value);
            if (isNaN(age)) return show('Informe sua data de nascimento.');
            if (age < JB.MIN_AGE) return show('O JB aceita cadastros a partir de ' + JB.MIN_AGE + ' anos.');
            const err = passwordError(f.password.value, f.confirm.value);
            if (err) return show(err);
            busy(reg, true, 'Cadastrando…');
            const token = await captcha.token();
            const r = await JB.Auth.register({ name: f.name.value, email: f.email.value, password: f.password.value, birthDate: f.birth.value, captchaToken: token });
            captcha.reset();
            busy(reg, false);
            if (!r.ok) return show(r.error);
            if (r.pending) {   // Supabase com confirmação de e-mail ativada
                reg.hidden = true; if (googleBox) googleBox.hidden = true;
                show('Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois faça login.', 'success');
                return;
            }
            proceed(r.user);
        });
    }

    /* ---------- Recuperação: 1) pedir o e-mail (código + link) e 1b) confirmar o código ---------- */
    const forgot = document.getElementById('forgot-form');
    const codeForm = document.getElementById('code-form');
    if (forgot && codeForm) {
        const captcha = captchaOf(forgot);
        const mfaField = codeForm.querySelector('[data-mfa-field]');
        const step = id => {
            ['forgot-step', 'forgot-sent', 'forgot-done'].forEach(s => { document.getElementById(s).hidden = s !== id; });
            document.getElementById('login-hint').hidden = id === 'forgot-done';
            hide();
        };
        const toCode = (email, sent) => {
            email = email.trim();
            codeForm.elements.email.value = email;
            document.getElementById('sent-email').textContent = email;
            document.getElementById('sent-msg').hidden = !sent;
            document.getElementById('nosent-msg').hidden = sent;
            step('forgot-sent');
            (emailOk(email) ? codeForm.elements.code : codeForm.elements.email).focus();
        };
        // E-mail cujo código o Supabase já aceitou: se só a senha for recusada, não pede o código de novo
        // (ele é de uso único). A sessão de recuperação fica só nesta aba (jb_recovery).
        let verifiedFor = '';

        forgot.addEventListener('submit', async e => {
            e.preventDefault(); hide(); await JB.authReady;
            const email = forgot.elements.email.value;
            if (!emailOk(email)) return show('Informe um e-mail válido.');
            busy(forgot, true, 'Enviando…');
            const token = await captcha.token();
            const r = await JB.Auth.requestPasswordReset(email, token);
            captcha.reset();
            busy(forgot, false);
            if (!r.ok) return show(r.error);
            toCode(email, true);   // mesma resposta exista ou não a conta (não revela quem é cadastrado)
        });
        document.getElementById('have-code').addEventListener('click', () => toCode(forgot.elements.email.value, false));
        document.getElementById('resend').addEventListener('click', () => {
            forgot.elements.email.value = codeForm.elements.email.value;
            step('forgot-step'); forgot.elements.email.focus();
        });

        codeForm.addEventListener('submit', async e => {
            e.preventDefault(); hide(); await JB.authReady;
            const f = codeForm.elements, email = f.email.value.trim().toLowerCase();
            if (!emailOk(email)) return show('Informe o e-mail da conta.');
            const already = verifiedFor === email;
            if (!already && !/^\d{6,10}$/.test(f.code.value.replace(/\s+/g, ''))) return show('Digite o código numérico que chegou no e-mail.');
            const err = passwordError(f.password.value, f.confirm.value);
            if (err) return show(err);
            busy(codeForm, true, 'Verificando…');
            if (!already) {
                const v = await JB.Auth.verifyRecoveryCode(email, f.code.value);
                if (!v.ok) { busy(codeForm, false); return show(v.error); }
                verifiedFor = email;
            }
            const r = await JB.Auth.updatePassword(f.password.value, f.mfa.value.trim());
            busy(codeForm, false);
            if (r.ok) { codeForm.reset(); verifiedFor = ''; mfaField.hidden = true; return step('forgot-done'); }
            if (r.expired) { verifiedFor = ''; return show('A verificação expirou. Peça um novo código.'); }
            if (r.mfa) { mfaField.hidden = false; f.mfa.focus(); }
            show(r.error);
        });
    }

    /* ---------- Recuperação: 2) definir a nova senha (aberta pelo link do e-mail) ---------- */
    const reset = document.getElementById('reset-form');
    if (reset) {
        const mfaField = reset.querySelector('[data-mfa-field]');
        const states = ['reset-checking', 'reset-step', 'reset-invalid', 'reset-done'];
        const state = id => states.forEach(s => { document.getElementById(s).hidden = s !== id; });
        const invalid = expired => {
            document.getElementById('invalid-title').textContent = expired ? 'Link expirado ou já utilizado' : 'Link de recuperação inválido';
            document.getElementById('invalid-text').textContent = expired
                ? 'Por segurança, o link de recuperação vale por tempo limitado e só pode ser usado uma vez. Peça um novo link para continuar.'
                : 'Esta página só funciona a partir do link enviado por e-mail. Abra o link mais recente que você recebeu, digite o código do e-mail em "Esqueci minha senha" ou peça um novo.';
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
            const r = await JB.Auth.updatePassword(f.password.value, f.mfa.value.trim());
            busy(reset, false);
            if (r.ok) { reset.reset(); return state('reset-done'); }
            if (r.expired) return invalid(true);
            if (r.mfa) { mfaField.hidden = false; f.mfa.focus(); }
            show(r.error);
        });
    }
})();
