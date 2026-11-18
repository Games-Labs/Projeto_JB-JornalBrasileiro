/* Minha Central: favoritos, histórico e recomendações (tudo em localStorage) */
(function () {
    'use strict';
    const { News, Favs, History, Auth, util } = JB;
    const grid = list => list.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('');
    const empty = t => '<div class="col-12"><div class="alert alert-secondary mb-0">' + t + '</div></div>';

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
})();
