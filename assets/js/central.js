/* Minha Central: notificações (matérias seguidas, coberturas ao vivo e, para administradores,
   alertas de segurança), favoritos (na conta, se logado; senão no navegador), histórico de leitura
   (sempre só neste navegador) e recomendações calculadas a partir dos dois. */
JB.ready.then(function () {
    'use strict';
    const { News, Favs, History, Auth, util } = JB;
    const grid = list => list.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('');
    const empty = t => '<div class="col-12"><div class="alert alert-secondary mb-0">' + t + '</div></div>';
    if (JB.loadError) { ['reco', 'favs', 'history'].forEach(id => { document.getElementById(id).innerHTML = '<div class="col-12">' + util.errorHTML() + '</div>'; }); document.getElementById('clear-history').hidden = true; return; }
    document.getElementById('storage-info').textContent = JB.mode === 'local' ? 'Modo de demonstração local: tudo fica apenas neste navegador.' : Auth.current()
        ? 'Seus favoritos ficam salvos na sua conta. O histórico de leitura fica apenas neste navegador.'
        : 'Sem login, favoritos e histórico ficam apenas neste navegador. Entre na sua conta para guardar os favoritos nela.';

    function render() {
        const favs = Favs.all(), hist = History.all();
        document.getElementById('fav-count').textContent = favs.length;
        document.getElementById('favs').innerHTML = favs.length ? grid(favs) : empty('Nenhum favorito ainda. Abra uma matéria e use “Salvar para ler depois”.');
        document.getElementById('history').innerHTML = hist.length ? grid(hist) : empty('Você ainda não leu nenhuma matéria.');
        document.getElementById('clear-history').hidden = !hist.length;

        // Recomendações: editorias de interesse do perfil + editorias das matérias lidas/favoritas
        const me = Auth.current();
        const seen = new Set(hist.concat(favs).map(n => n.id));
        const weight = {};
        ((me && me.interests) || []).forEach(c => { weight[c] = (weight[c] || 0) + 3; });
        hist.concat(favs).forEach(n => { weight[n.category] = (weight[n.category] || 0) + 1; });
        const reco = News.all().filter(n => !seen.has(n.id))
            .sort((a, b) => (weight[b.category] || 0) - (weight[a.category] || 0) || new Date(b.date) - new Date(a.date)).slice(0, 6);
        document.getElementById('reco-info').textContent = Object.keys(weight).length
            ? 'Baseadas nas suas editorias de interesse e no que você já leu.'
            : 'Ainda não conhecemos seus interesses: mostrando as notícias mais recentes. Leia matérias ou escolha editorias no seu perfil.';
        document.getElementById('reco').innerHTML = reco.length ? grid(reco) : empty('Sem novas sugestões no momento.');
    }

    document.getElementById('clear-history').addEventListener('click', () => { if (confirm('Limpar o histórico de leitura?')) { History.clear(); render(); } });
    render();

    /* ---------- Notificações e matérias seguidas ---------- */
    const { Notifications, Follows, Push } = JB;
    const $ = id => document.getElementById(id);
    const { esc } = util;
    const KIND = { live: 'Ao vivo', follow: 'Matéria seguida', security: 'Segurança', role: 'Equipe' };
    const changed = () => document.dispatchEvent(new CustomEvent('jb:notifs'));   // atualiza o sino
    function paintNotifs() {
        const list = Notifications.list();
        $('notif-actions').hidden = !list.length;
        $('notif-read').hidden = !Notifications.unread();
        $('notif-box').innerHTML = list.length ? '<ul class="notif-page-list">' + list.map(n => '<li class="' + (n.readAt ? '' : 'is-unread') + '"><div><span class="notif-kind notif-kind-' + esc(n.kind) + '">' + esc(KIND[n.kind] || 'Aviso') + '</span>' +
            (n.url ? '<a href="' + esc(util.root() + n.url) + '" data-open="' + esc(n.id) + '"><strong>' + esc(n.title) + '</strong></a>' : '<strong>' + esc(n.title) + '</strong>') + (n.body ? '<p class="mb-0 small">' + esc(n.body) + '</p>' : '') +
            '<small class="text-muted">' + esc(util.fmtDate(n.date)) + (n.readAt ? '' : ' · <strong>não lida</strong>') + '</small></div>' +
            '<button type="button" class="btn btn-sm btn-link text-danger p-0" data-del="' + esc(n.id) + '" aria-label="Apagar a notificação: ' + esc(n.title) + '">Apagar</button></li>').join('') + '</ul>'
            : '<p class="text-muted mb-0">Nenhuma notificação. Use “Seguir esta matéria” em uma matéria para saber quando ela for atualizada ou corrigida.</p>';
    }
    function paintFollows() {
        const ids = Follows.ids(), list = ids.map(id => News.get(id)).filter(n => n && util.isPublished(n));
        $('follow-count').textContent = list.length;
        $('follow-list').innerHTML = list.map(n => '<li><a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a>' + (n.kind === 'aovivo' && n.live ? ' ' + util.liveBadge() : '') +
            ' <button type="button" class="btn btn-sm btn-link p-0" data-unfollow="' + esc(n.id) + '">Deixar de seguir</button></li>').join('') || '<li class="text-muted small">Você não segue nenhuma matéria.</li>';
    }
    async function paintSettings() {
        const me = Auth.current();
        const st = await Push.state();
        const pushText = { on: 'ativadas neste aparelho.', off: 'desativadas neste aparelho.', denied: 'bloqueadas pelo navegador: libere as notificações nas configurações do site.',
            unsupported: JB.mode === 'local' ? 'só funcionam no site publicado.' : 'este navegador não recebe notificações com o site fechado (no iPhone, instale o app do JB na tela de início).' }[st];
        $('notif-settings').innerHTML = '<h3 class="h6 fw-bold">Preferências</h3>' +
            '<div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="pref-live"' + (Auth.notifyLive() ? ' checked' : '') + '><label class="form-check-label" for="pref-live">Avisar sobre todas as coberturas <strong>ao vivo</strong>, mesmo as que não sigo</label></div>' +
            '<p class="small mb-2"><strong>Notificações com o site fechado</strong> (push): ' + esc(pushText) + '</p>' +
            (st === 'on' ? '<button type="button" class="btn btn-sm btn-outline-dark" id="push-off">Desativar neste aparelho</button>' : st === 'off' ? '<button type="button" class="btn btn-sm btn-primary" id="push-on">Ativar neste aparelho</button>' : '') +
            '<p class="small mt-2 mb-0" id="push-msg" aria-live="polite"></p>' +
            (me && me.role === 'admin' ? '<p class="small text-muted mt-3 mb-0">Como administrador, você recebe também os <strong>alertas de segurança</strong> (modo lockdown ligado ou desligado, mudanças de cargo).</p>' : '');
    }
    if (!Auth.current()) {
        $('notif-box').innerHTML = '<p class="mb-0"><a href="login.html?next=central.html">Entre na sua conta</a> para seguir matérias e receber avisos de atualizações e coberturas ao vivo.</p>';
    } else {
        $('notif-settings-wrap').hidden = false;
        Promise.all([Notifications.load(), Follows.load()]).then(r => {
            if (r[0] === false) $('notif-box').innerHTML = util.errorHTML('Não foi possível carregar as notificações agora.'); else paintNotifs();
            paintFollows();
        });
        paintSettings();
        $('notif-read').addEventListener('click', async () => { await Notifications.markRead(); paintNotifs(); changed(); });
        $('notif-clear').addEventListener('click', async () => { if (!confirm('Apagar todas as notificações?')) return; await Notifications.remove(); paintNotifs(); changed(); });
        $('notif-box').addEventListener('click', async e => {
            const d = e.target.closest('[data-del]'), o = e.target.closest('[data-open]');
            if (d) { await Notifications.remove(d.dataset.del); paintNotifs(); changed(); }
            if (o) Notifications.markRead([o.dataset.open]);
        });
        $('follow-list').addEventListener('click', async e => {
            const b = e.target.closest('[data-unfollow]'); if (!b) return;
            b.disabled = true;
            await Follows.toggle(b.dataset.unfollow); paintFollows();
        });
        $('notif-settings').addEventListener('change', async e => {
            if (e.target.id !== 'pref-live') return;
            const ok = await Auth.setNotifyLive(e.target.checked);
            if (ok === false) e.target.checked = !e.target.checked;
        });
        $('notif-settings').addEventListener('click', async e => {
            const on = e.target.closest('#push-on'), off = e.target.closest('#push-off');
            if (!on && !off) return;
            e.target.disabled = true;
            const r = on ? await Push.enable() : await Push.disable();
            await paintSettings();
            $('push-msg').textContent = r.ok ? (on ? 'Pronto: você recebe os avisos mesmo com o site fechado.' : 'Desativadas neste aparelho.') : r.error;
        });
        if (location.hash === '#notificacoes') setTimeout(() => $('notificacoes').scrollIntoView(), 50);
    }
});
