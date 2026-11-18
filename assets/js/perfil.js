/* Minhas Informações — exige usuário autenticado */
(function () {
    'use strict';
    const me = JB.Auth.current();
    if (!me) { location.replace('login.html?next=perfil.html'); return; }
    document.getElementById('profile-content').hidden = false;

    const f = document.getElementById('profile-form');
    const toast = (id, msg, type) => { const el = document.getElementById(id); el.className = 'alert alert-' + (type || 'success'); el.textContent = msg; el.hidden = false; };
    function fill(u) {
        f.elements.name.value = u.name; f.email.value = u.email; f.city.value = u.city || ''; f.bio.value = u.bio || '';
        document.getElementById('interests').innerHTML = Object.keys(JB.CATEGORIES).map(k =>
            '<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="i-' + k + '" value="' + k + '"' + ((u.interests || []).includes(k) ? ' checked' : '') + '>' +
            '<label class="form-check-label" for="i-' + k + '">' + JB.util.esc(JB.CATEGORIES[k].label) + '</label></div>').join('');
        document.getElementById('role-badge').textContent = u.role === 'admin' ? 'Administrador / Editor' : 'Leitor cadastrado';
        document.getElementById('since').textContent = new Date(u.created).toLocaleDateString('pt-BR');
        document.getElementById('admin-link').hidden = u.role !== 'admin';
    }
    fill(me);

    f.addEventListener('submit', e => {
        e.preventDefault();
        if (!f.elements.name.value.trim()) return;
        JB.Auth.update({ name: f.elements.name.value.trim(), city: f.city.value.trim(), bio: f.bio.value.trim(),
            interests: [...document.querySelectorAll('#interests input:checked')].map(i => i.value) });
        toast('profile-msg', 'Perfil salvo com sucesso.');
    });

    document.getElementById('pass-form').addEventListener('submit', e => {
        e.preventDefault();
        const p = e.target;
        if (p.next.value.length < 6) return toast('pass-msg', 'A nova senha precisa ter ao menos 6 caracteres.', 'danger');
        if (!JB.Auth.changePassword(p.current.value, p.next.value)) return toast('pass-msg', 'Senha atual incorreta.', 'danger');
        p.reset(); toast('pass-msg', 'Senha alterada.');
    });

    document.getElementById('logout').addEventListener('click', () => { JB.Auth.logout(); location.href = '../index.html'; });
    document.getElementById('delete-account').addEventListener('click', () => {
        if (me.id === 'admin') return alert('A conta de demonstração do editor não pode ser excluída.');
        if (confirm('Excluir sua conta permanentemente deste navegador?')) { JB.Auth.deleteAccount(); location.href = '../index.html'; }
    });
})();
