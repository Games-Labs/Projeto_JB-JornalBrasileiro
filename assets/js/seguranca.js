/* Segurança da conta (seguranca.html): confirmar a idade (quem entrou pelo Google ou tinha conta
   antes da regra), digitar o código do app autenticador depois do login e ativar/remover a
   verificação em duas etapas (MFA, TOTP). Obrigatória para a equipe, opcional para leitores.
   Quem impõe as regras é o banco (my_role() em supabase/08_seguranca.sql); aqui é só a interface. */
JB.authReady.then(function () {
    'use strict';
    const { Auth, util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);
    const next = (() => { const n = new URLSearchParams(location.search).get('next') || ''; return /^[\w-]+\.html$/.test(n) ? n : ''; })();
    $('sec-loading').hidden = true;
    if (!Auth.current()) { $('sec-guest').hidden = false; return; }
    $('sec-content').hidden = false;
    const msg = (t, type) => { const m = $('sec-msg'); m.className = 'alert alert-' + (type || 'success'); m.textContent = t; m.hidden = !t; };
    const busy = (btn, on) => { btn.disabled = on; };

    if (JB.mode === 'local') {
        $('sec-lead').textContent = 'No modo de demonstração local o login é simulado: não há verificação em duas etapas nem confirmação de idade no servidor.';
        return;
    }

    let enrolling = null;   // { id } da ativação em andamento
    async function render() {
        const me = Auth.current();
        if (!me) { location.href = '../index.html'; return; }
        const staff = util.isStaffRole(me.role), st = Auth.mfaState(), ageOk = Auth.ageOk();
        $('age-box').hidden = ageOk;
        $('mfa-challenge').hidden = !ageOk || st !== 'challenge';
        $('mfa-box').hidden = !ageOk || st === 'challenge';
        $('sec-lead').textContent = !ageOk ? 'Falta um passo para liberar sua conta.'
            : st === 'challenge' ? 'Confirme que é você para terminar de entrar.'
            : st === 'enroll' ? 'Como ' + util.roleLabel(me.role).toLowerCase() + ' do JB, você precisa ativar a verificação em duas etapas para usar o painel e as funções da redação.'
            : 'Sua conta está liberada.';
        if (!$('mfa-box').hidden) {
            $('mfa-intro').textContent = staff
                ? 'Obrigatória para a equipe da redação: sem ela o painel fica bloqueado. Você pode cadastrar mais de um aparelho (ex.: celular e reserva).'
                : 'Opcional para leitores, mas recomendada: depois de ativar, entrar na conta pede a senha e um código do seu celular.';
            const list = await Auth.mfaFactors();
            const fs = list || [];
            $('mfa-factors').innerHTML = list === null ? '<li class="text-danger small">Não foi possível carregar os aparelhos agora.</li>'
                : fs.map(f => '<li><span><strong>' + esc(f.name) + '</strong> <small class="opacity-75">ativado em ' + esc(new Date(f.created).toLocaleDateString('pt-BR')) + '</small></span>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" data-remove="' + esc(f.id) + '">Remover</button></li>').join('')
                || '<li class="small text-muted">Nenhum app autenticador ativo.</li>';
            $('mfa-start').textContent = fs.length ? 'Adicionar outro aparelho' : 'Ativar com um app autenticador';
            $('mfa-start').hidden = !!enrolling;
        }
        const done = Auth.accountOk();
        $('sec-next').hidden = !(done && next);
        if (next) $('next-link').href = next;
        return done;
    }
    // Terminou um passo: se a conta ficou liberada e veio de outra página, volta para ela
    const advance = async okText => { msg(okText); if ((await render()) && next) setTimeout(() => { location.href = next; }, 900); };

    /* Idade */
    $('age-birth').max = new Date().toISOString().slice(0, 10);
    $('age-form').addEventListener('submit', async e => {
        e.preventDefault(); msg('');
        const btn = e.target.querySelector('button[type=submit]'); busy(btn, true);
        const r = await Auth.confirmAge(e.target.elements.birth.value);
        busy(btn, false);
        if (r.underage) {
            $('sec-content').innerHTML = '<div class="auth-card text-center"><h1 class="h4">Conta removida</h1><p>O Jornal Brasileiro aceita contas a partir de ' + JB.MIN_AGE + ' anos. Por isso sua conta e os dados dela foram apagados. Você continua podendo ler todas as notícias sem conta.</p><a class="btn btn-primary" href="../index.html">Ir para a capa</a></div>';
            return;
        }
        if (!r.ok) return msg(r.error, 'danger');
        advance('Idade confirmada.');
    });

    /* Código depois do login */
    $('challenge-form').addEventListener('submit', async e => {
        e.preventDefault(); msg('');
        const btn = e.target.querySelector('button[type=submit]'); busy(btn, true);
        const r = await Auth.mfaVerify(e.target.elements.code.value);
        busy(btn, false);
        if (!r.ok) { e.target.elements.code.select(); return msg(r.error, 'danger'); }
        e.target.reset();
        advance('Verificação concluída.');
    });
    $('challenge-logout').addEventListener('click', async () => { await Auth.logout(); location.href = '../index.html'; });

    /* Ativar */
    $('mfa-start').addEventListener('click', async e => {
        msg(''); busy(e.target, true);
        const r = await Auth.mfaEnroll();
        busy(e.target, false);
        if (!r.ok) return msg(r.error, 'danger');
        enrolling = { id: r.id };
        $('mfa-qr').src = r.qr; $('mfa-qr').hidden = !r.qr;
        $('mfa-secret').textContent = r.secret;
        $('mfa-uri').href = /^otpauth:\/\//.test(r.uri || '') ? r.uri : '#';
        $('mfa-enroll').hidden = false; $('mfa-start').hidden = true;
        $('enroll-code').focus();
    });
    $('enroll-form').addEventListener('submit', async e => {
        e.preventDefault(); msg('');
        if (!enrolling) return;
        const btn = e.target.querySelector('button[type=submit]'); busy(btn, true);
        const r = await Auth.mfaVerify(e.target.elements.code.value, enrolling.id);
        busy(btn, false);
        if (!r.ok) { e.target.elements.code.select(); return msg(r.error, 'danger'); }
        enrolling = null; e.target.reset(); $('mfa-enroll').hidden = true; $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent = '';
        advance('Verificação em duas etapas ativada. A partir de agora, entrar na conta pede também o código do app.');
    });
    $('enroll-cancel').addEventListener('click', () => { enrolling = null; $('mfa-enroll').hidden = true; $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent = ''; render(); });

    /* Remover um aparelho */
    $('mfa-factors').addEventListener('click', async e => {
        const b = e.target.closest('[data-remove]'); if (!b) return;
        const me = Auth.current(), last = $('mfa-factors').querySelectorAll('[data-remove]').length === 1;
        const warn = last && util.isStaffRole(me.role) ? ' Como você é da equipe, o painel fica bloqueado até ativar de novo.' : '';
        if (!confirm('Remover este app autenticador?' + warn)) return;
        busy(b, true);
        const r = await Auth.mfaRemove(b.dataset.remove);
        if (!r.ok) { busy(b, false); return msg(r.error, 'danger'); }
        msg('Aparelho removido.'); render();
    });

    render();
});
