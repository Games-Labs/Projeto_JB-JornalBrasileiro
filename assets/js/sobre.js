/* Sobre o JB (pages/sobre.html): números do portal e as divisões (lidas de JB.DIVISIONS, então uma
   divisão nova aparece aqui sem mexer na página). */
(function () {
    'use strict';
    const { DIVISIONS, util } = JB;
    const { esc } = util;
    const R = util.root();
    const ICON = {
        jb: '<path d="M4 5h12v14H6a2 2 0 0 1-2-2z"/><path d="M16 8h3v9a2 2 0 0 1-2 2M7.5 9h5M7.5 12.5h5M7.5 16h3"/>',
        educa: '<path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.4 3.4 2 5.5 2s4-.6 5.5-2V11M21.5 9v5"/>'
    };
    document.getElementById('about-division-list').innerHTML = Object.keys(DIVISIONS).map(k => {
        const d = DIVISIONS[k];
        const areas = Object.keys(d.categories).map(c => d.categories[c].label).join(' · ');
        return '<div class="col-md-6"><a class="about-division division-' + esc(k) + '" href="' + R + esc(d.home) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICON[k] || ICON.jb) + '</svg>' +
            '<span><strong>' + esc(d.name) + '</strong><em>' + esc(d.tagline) + '</em><span class="d-block">' + esc(d.desc) + '</span><small>' + esc(areas) + '</small></span></a></div>';
    }).join('');

    const stats = document.getElementById('about-stats');
    JB.ready.then(() => {
        if (JB.loadError) { stats.innerHTML = ''; stats.hidden = true; return; }
        const pub = JB.News.published();
        const num = (n, label) => '<div class="about-stat"><strong>' + Number(n).toLocaleString('pt-BR') + '</strong><span>' + esc(label) + '</span></div>';
        const checks = pub.filter(n => n.kind === 'checagem').length;
        const educa = pub.filter(n => util.divisionOf(n) === 'educa').length;
        stats.innerHTML = num(pub.filter(n => util.divisionOf(n) === 'jb').length, 'matérias publicadas') + num(checks, 'checagens de fatos') +
            num(educa, 'materiais do JB Educa') + num(JB.Authors.all().length, 'autores e colunistas');
    });
})();
