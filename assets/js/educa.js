/* JB Educa (pages/educa.html): aulas e listas de exercícios do JB Educa, filtradas por disciplina
   (?materia=) e por tipo, mais a calculadora da fórmula de Bhaskara com o passo a passo.
   A página usa <body data-division="educa"> (tema verde, nome da divisão no cabeçalho). */
(function () {
    'use strict';
    const { util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);
    const TeX = (s, display) => util.texToMathML(s, display);

    /* ---------- Calculadora de Bhaskara (não depende dos dados) ---------- */
    const form = $('bhaskara-form');
    const parse = v => { const s = String(v || '').trim().replace(/\s/g, '').replace(',', '.'); return s === '' || s === '-' ? NaN : Number(s); };
    // Número com no máximo 4 casas, vírgula decimal, sem "-0"
    const fmt = x => { const r = Math.round(x * 10000) / 10000; return (Object.is(r, -0) ? 0 : r).toLocaleString('pt-BR', { maximumFractionDigits: 4 }); };
    const tex = x => fmt(x).replace(/\./g, '');                     // milhar sem ponto dentro da fórmula
    const par = x => x < 0 ? '(' + tex(x) + ')' : tex(x);         // (−3)² com parênteses
    function term(coef, v, first) {
        if (coef === 0) return '';
        const sign = coef < 0 ? '-' : first ? '' : '+';
        const abs = Math.abs(coef);
        return sign + (abs === 1 && v ? '' : tex(abs)) + v;
    }
    function solve() {
        const out = $('bhaskara-out');
        const a = parse(form.elements.a.value), b = parse(form.elements.b.value), c = parse(form.elements.c.value);
        if (![a, b, c].every(isFinite)) { out.innerHTML = '<p class="text-muted small mb-0">Preencha a, b e c (use vírgula ou ponto para decimais).</p>'; return; }
        if (a === 0) { out.innerHTML = '<div class="alert alert-warning small mb-0">Com <strong>a = 0</strong> não é equação do 2º grau. ' + (b !== 0 ? 'É do 1º grau: x = ' + esc(fmt(-c / b)) + '.' : 'Não há x para calcular.') + '</div>'; return; }
        const eq = (term(a, 'x^2', true) + term(b, 'x', false) + term(c, '', false)) + '=0';
        const d = b * b - 4 * a * c;
        const steps = [];
        steps.push(['Equação', eq]);
        steps.push(['Coeficientes', 'a=' + tex(a) + ';\\; b=' + tex(b) + ';\\; c=' + tex(c)]);
        steps.push(['Discriminante', '\\Delta=b^2-4ac=' + par(b) + '^2-4\\cdot' + par(a) + '\\cdot' + par(c) + '=' + tex(d)]);
        let result;
        if (d < 0) {
            const re = -b / (2 * a), im = Math.sqrt(-d) / (2 * Math.abs(a));
            steps.push(['Raízes', '\\Delta<0']);
            result = '<p class="mb-1"><strong>Não há raízes reais</strong>: nenhum número real elevado ao quadrado dá negativo, então a parábola não corta o eixo x.</p>' +
                '<p class="small mb-0">Nos números complexos: ' + TeX('x=' + tex(re) + '\\pm' + tex(im) + 'i') + '</p>';
        } else {
            const r = Math.sqrt(d), x1 = (-b + r) / (2 * a), x2 = (-b - r) / (2 * a);
            const exact = Number.isInteger(r) ? tex(r) : '\\sqrt{' + tex(d) + '}';
            steps.push(['Fórmula', 'x=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}=\\frac{' + tex(-b) + '\\pm' + exact + '}{' + tex(2 * a) + '}']);
            result = d === 0
                ? '<p class="mb-0"><strong>Uma raiz real (dupla)</strong>, porque Δ = 0: ' + TeX('x_1=x_2=' + tex(x1)) + '</p>'
                : '<p class="mb-0"><strong>Duas raízes reais</strong>: ' + TeX('x_1=' + tex(x1)) + ' e ' + TeX('x_2=' + tex(x2)) + (Number.isInteger(r) ? '' : ' <span class="small text-muted">(aproximadas)</span>') + '</p>';
        }
        const xv = -b / (2 * a), yv = -d / (4 * a);
        out.innerHTML = '<ol class="bhaskara-steps">' + steps.map(s => '<li><span class="bh-label">' + esc(s[0]) + '</span>' + TeX(s[1], true) + '</li>').join('') + '</ol>' +
            '<div class="bhaskara-result">' + result + '</div>' +
            '<p class="small text-muted mt-2 mb-0">Vértice da parábola: ' + TeX('V=\\left(' + tex(xv) + ';\\;' + tex(yv) + '\\right)') + ' · concavidade ' + (a > 0 ? 'para cima (a > 0)' : 'para baixo (a < 0)') + '.</p>';
    }
    if (form) {
        form.addEventListener('submit', e => { e.preventDefault(); solve(); });
        form.addEventListener('input', solve);
        $('bhaskara-example').addEventListener('click', () => { form.elements.a.value = '1'; form.elements.b.value = '-5'; form.elements.c.value = '6'; solve(); });
        $('bhaskara-formula').innerHTML = TeX('ax^2+bx+c=0 \\quad\\Rightarrow\\quad x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', true);
        solve();
    }

    /* ---------- Materiais ---------- */
    JB.ready.then(function () {
        const { News, SUBJECTS, DIVISIONS } = JB;
        const grid = $('educa-grid'), info = $('educa-info');
        if (JB.loadError) { grid.innerHTML = '<div class="col-12">' + util.errorHTML() + '</div>'; info.textContent = ''; return; }
        const params = new URLSearchParams(location.search);
        let subject = SUBJECTS[params.get('materia')] ? params.get('materia') : '';
        let kind = DIVISIONS.educa.kinds[params.get('tipo')] ? params.get('tipo') : '';
        const all = News.byDivision('educa');
        const count = s => all.filter(n => n.category === s).length;
        const subjBar = $('subject-bar'), kindBar = $('kind-bar');
        function paintBars() {
            subjBar.innerHTML = '<li><button type="button" class="subject-chip" data-subject="" aria-pressed="' + !subject + '">Todas <small>' + all.length + '</small></button></li>' +
                Object.keys(SUBJECTS).map(s => '<li><button type="button" class="subject-chip" data-subject="' + s + '" aria-pressed="' + (s === subject) + '">' + esc(SUBJECTS[s].label) + ' <small>' + count(s) + '</small></button></li>').join('');
            kindBar.innerHTML = [['', 'Tudo']].concat(Object.keys(DIVISIONS.educa.kinds).map(k => [k, DIVISIONS.educa.kinds[k]])).map(k =>
                '<button type="button" class="btn btn-sm ' + (k[0] === kind ? 'btn-educa' : 'btn-outline-dark') + '" data-kind="' + k[0] + '" aria-pressed="' + (k[0] === kind) + '">' + esc(k[1]) + '</button>').join('');
        }
        function render() {
            paintBars();
            const list = all.filter(n => (!subject || n.category === subject) && (!kind || n.kind === kind));
            const S = SUBJECTS[subject];
            $('subject-desc').textContent = S ? S.desc : 'Escolha uma disciplina ou veja tudo o que o JB Educa já publicou.';
            document.title = (S ? S.label + ' — ' : '') + 'JB Educa — Jornal Brasileiro (JB)';
            info.textContent = list.length + (list.length === 1 ? ' material' : ' materiais');
            grid.innerHTML = list.map(n => '<div class="col-md-6 col-lg-4">' + util.newsCard(n) + '</div>').join('') ||
                '<div class="col-12"><div class="alert alert-secondary mb-0">' + (all.length ? 'Ainda não há materiais neste filtro.' : 'Os primeiros materiais do JB Educa estão sendo preparados pelos professores.') + '</div></div>';
            const q = new URLSearchParams(); if (subject) q.set('materia', subject); if (kind) q.set('tipo', kind);
            history.replaceState(null, '', 'educa.html' + (q.toString() ? '?' + q : ''));
        }
        subjBar.addEventListener('click', e => { const b = e.target.closest('[data-subject]'); if (b) { subject = b.dataset.subject; render(); } });
        kindBar.addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) { kind = b.dataset.kind; render(); } });
        render();
        // Professores e coordenação: atalho para criar material
        JB.authReady.then(() => {
            const box = $('educa-staff');
            if (box && JB.Auth.divisions().includes('educa')) {
                box.innerHTML = '<a class="btn btn-educa btn-sm" href="editor.html?divisao=educa">+ Novo material</a> <a class="btn btn-outline-dark btn-sm" href="admin-materias.html?divisao=educa">Materiais no painel</a>';
                box.hidden = false;
            }
        });
    });
})();
