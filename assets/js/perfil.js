/* Minhas Informações — exige usuário autenticado (a proteção real é o RLS de profiles) */
JB.authReady.then(function () {
    'use strict';
    const me = JB.Auth.current();
    if (!me) { location.replace('login.html?next=perfil.html'); return; }
    document.getElementById('profile-loading').hidden = true;
    document.getElementById('profile-content').hidden = false;

    const f = document.getElementById('profile-form');
    const fe = f.elements;
    const toast = (id, msg, type) => { const el = document.getElementById(id); el.className = 'alert alert-' + (type || 'success'); el.setAttribute('role', type === 'danger' ? 'alert' : 'status'); el.textContent = msg; el.hidden = false; };
    // Só confirma depois que o servidor aceitou a gravação.
    const saved = async (id, okMsg) => { const ok = await JB.flush(); toast(id, ok ? okMsg : 'Não foi possível salvar agora. Tente novamente.', ok ? 'success' : 'danger'); };

    function fill(u) {
        fe.name.value = u.name; fe.email.value = u.email; fe.city.value = u.city || ''; fe.bio.value = u.bio || '';
        document.getElementById('interests').innerHTML = Object.keys(JB.CATEGORIES).map(k =>
            '<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="i-' + k + '" value="' + k + '"' + ((u.interests || []).includes(k) ? ' checked' : '') + '>' +
            '<label class="form-check-label" for="i-' + k + '">' + JB.util.esc(JB.CATEGORIES[k].label) + '</label></div>').join('');
        document.getElementById('role-badge').textContent = u.role === 'admin' ? 'Administrador / Editor' : 'Leitor cadastrado';
        document.getElementById('since').textContent = new Date(u.created).toLocaleDateString('pt-BR');
        document.getElementById('admin-link').hidden = u.role !== 'admin';
    }
    fill(me);

    /* ---------- Foto de perfil ---------- */
    const renderAvatar = () => {
        const u = JB.Auth.current();
        document.getElementById('avatar-box').innerHTML = JB.util.avatarHTML(u);
        document.getElementById('avatar-remove').hidden = !u.avatar;
        document.querySelectorAll('.site-header [data-avatar]').forEach(el => { el.outerHTML = JB.util.avatarHTML(u, 'avatar-sm'); });
    };
    renderAvatar();
    document.getElementById('avatar-file').addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
            const size = 256, side = Math.min(img.width, img.height);   // recorte quadrado central
            const c = document.createElement('canvas'); c.width = c.height = size;
            c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
            URL.revokeObjectURL(url);
            JB.Auth.update({ avatar: c.toDataURL('image/jpeg', 0.85) });
            renderAvatar(); saved('profile-msg', 'Foto atualizada.').then(renderAvatar);
        };
        img.onerror = () => { URL.revokeObjectURL(url); toast('profile-msg', 'Não foi possível ler esse arquivo como imagem.', 'danger'); };
        img.src = url; e.target.value = '';
    });
    document.getElementById('avatar-remove').addEventListener('click', () => { JB.Auth.update({ avatar: '' }); renderAvatar(); saved('profile-msg', 'Foto removida.').then(renderAvatar); });

    f.addEventListener('submit', e => {
        e.preventDefault();
        if (!fe.name.value.trim()) return toast('profile-msg', 'Informe seu nome.', 'danger');
        JB.Auth.update({ name: fe.name.value.trim().slice(0, 120), city: fe.city.value.trim().slice(0, 120), bio: fe.bio.value.trim().slice(0, 1000),
            interests: [...document.querySelectorAll('#interests input:checked')].map(i => i.value) });
        saved('profile-msg', 'Perfil salvo com sucesso.').then(() => fill(JB.Auth.current()));
    });

    document.getElementById('pass-form').addEventListener('submit', async e => {
        e.preventDefault();
        const p = e.target.elements, btn = e.target.querySelector('button[type=submit]');
        if (p.next.value.length < JB.PASSWORD_MIN) return toast('pass-msg', 'A nova senha precisa ter ao menos ' + JB.PASSWORD_MIN + ' caracteres.', 'danger');
        if (p.next.value !== p.confirm.value) return toast('pass-msg', 'A confirmação não confere com a nova senha.', 'danger');
        btn.disabled = true;
        const ok = await JB.Auth.changePassword(p.current.value, p.next.value);
        btn.disabled = false;
        if (!ok) return toast('pass-msg', 'Senha atual incorreta ou nova senha inválida.', 'danger');
        e.target.reset(); toast('pass-msg', 'Senha alterada.');
    });

    document.getElementById('logout').addEventListener('click', async () => { await JB.Auth.logout(); location.href = '../index.html'; });
    document.getElementById('delete-account').addEventListener('click', async () => {
        if (me.role === 'admin') return alert('Contas de editor não podem ser excluídas por aqui.');
        if (confirm('Excluir sua conta permanentemente?')) { await JB.Auth.deleteAccount(); if (!JB.Auth.current()) location.href = '../index.html'; }
    });
});
