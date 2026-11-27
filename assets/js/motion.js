/* Jornal Brasileiro (JB): sistema de animações (par do assets/css/motion.css)
   - Revela cards, manchetes e blocos quando entram na tela (IntersectionObserver), um depois do outro.
   - Pega sozinho o que os scripts das páginas desenham depois (MutationObserver): nenhuma página
     precisa de código próprio. Para marcar outro bloco, basta o atributo data-reveal (ou data-reveal="fade|zoom|left").
   - Cada bloco anima uma vez só: se a página redesenha a lista (ex.: cobertura ao vivo a cada 30 s),
     o que já apareceu não anima de novo.
   - Com o "reduzir movimento" do sistema, os blocos só esmaecem (sem deslizar).
   - Nada fica escondido sem JavaScript, com "Menos animação" ligado ou
     no painel e no editor (ferramentas de trabalho ficam sem efeito de entrada).
   - Barra de progresso de leitura na página da matéria; resposta visual ao seguir, favoritar,
     ligar notificações e mudar preferências; contador do sino "pula" quando chega aviso novo.
   API: JB.Motion.reveal(el), JB.Motion.pop(el), JB.Motion.reduced(). */
(function () {
    'use strict';
    const JB = window.JB || (window.JB = {});
    const doc = document.documentElement, body = document.body;
    const page = body.dataset.page || '';
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() { } };
    // off = o leitor ligou "Menos animação" no site: nada anima. reduced = isso ou o "reduzir movimento"
    // do sistema: nada se mexe (os blocos só esmaecem ao aparecer, ver motion.css).
    const off = () => doc.getAttribute('data-motion') === 'reduce';
    const reduced = () => mq.matches || off();
    const ms = (name, fallback) => {
        const v = getComputedStyle(doc).getPropertyValue(name).trim();
        const n = parseFloat(v);
        return isNaN(n) ? fallback : (/ms$/.test(v) ? n : n * 1000);
    };

    /* ---------- Revelar ---------- */
    const REVEAL = [
        '.news-card', '.mini-card', '.mini-feature', '.live-card', '.column-card', '.editorial-card', '.special-card',
        '.svc-card', '.about-division', '.team-card', '.hist-item', '.match-card', '.list-hero', '.columnist',
        '.section-title', '.section-head', '.lead-story > *', '.article-title', '.article-sheet > .lead', '.article-sheet > .meta-info',
        '[data-reveal]'
    ].join(',');
    const SKIP_PAGES = ['admin'];   // painel e editor
    const enabled = 'IntersectionObserver' in window && 'MutationObserver' in window && !SKIP_PAGES.includes(page);
    const seen = new Set();   // blocos que já apareceram (sobrevive a um redesenho da lista)
    const keyOf = el => {
        const a = el.matches('a[href]') ? el : el.querySelector('a[href]');
        const img = el.matches('img') ? el : el.querySelector('img[src]');
        return (String(el.getAttribute('class') || '').split(' ')[0] || el.tagName) + '|' +
            (a ? a.getAttribute('href') : img ? img.getAttribute('src') : (el.textContent || '').trim().slice(0, 80));
    };
    let io = null;
    function show(el, delay) {
        el.style.setProperty('--jb-delay', delay + 'ms');
        el.classList.add('is-in');
        seen.add(el.dataset.jbKey);
        // depois da transição, devolve o elemento ao normal (para o hover do card voltar a valer)
        setTimeout(() => { el.classList.remove('jb-reveal', 'is-in'); el.style.removeProperty('--jb-delay'); delete el.dataset.jbKey; }, delay + ms('--jb-motion-dur', 500) + 120);
    }
    function onIntersect(entries) {
        const stagger = ms('--jb-motion-stagger', 60);
        entries.filter(e => e.isIntersecting)
            .sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
            .forEach((e, i) => { io.unobserve(e.target); show(e.target, Math.min(i, 8) * stagger); });
    }
    // initial = elemento que já estava na página quando este script rodou (pode já ter sido pintado)
    function prepare(el, initial) {
        if (el.classList.contains('jb-reveal') || el.closest('.jb-lockdown-screen, [data-no-reveal]')) return;
        if (el.parentElement && el.parentElement.closest('.jb-reveal')) return;   // o bloco de fora já anima
        const key = keyOf(el);
        if (seen.has(key)) return;
        const rects = el.getClientRects();
        if (rects.length) {
            const r = el.getBoundingClientRect();
            if (r.bottom <= 0) { seen.add(key); return; }                       // já passou (acima da tela)
            if (initial && r.top < innerHeight) { seen.add(key); return; }       // já está à vista: não pisca
        }
        el.dataset.jbKey = key;
        el.classList.add('jb-reveal');
        io.observe(el);
    }
    function scan(root, initial) {
        if (root.nodeType !== 1) return;
        if (root.matches(REVEAL)) prepare(root, initial);
        root.querySelectorAll(REVEAL).forEach(el => prepare(el, initial));
    }
    function revealAll() {   // impressão, ou o leitor ligou "Menos animação"
        document.querySelectorAll('.jb-reveal').forEach(el => { if (io) io.unobserve(el); el.classList.remove('jb-reveal', 'is-in'); });
    }
    if (enabled && !off()) {
        doc.classList.add('jb-motion');
        io = new IntersectionObserver(onIntersect, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
        scan(document.querySelector('main') || body, true);
        new MutationObserver(list => {
            if (off()) return;
            list.forEach(m => m.addedNodes.forEach(n => scan(n, false)));
        }).observe(body, { childList: true, subtree: true });
        window.addEventListener('beforeprint', revealAll);
    }
    const onReduce = () => { if (off()) { revealAll(); doc.classList.remove('jb-motion'); } };
    new MutationObserver(onReduce).observe(doc, { attributes: true, attributeFilter: ['data-motion'] });

    /* ---------- Resposta visual às ações ---------- */
    function pop(el) {
        if (!el || reduced()) return;
        el.classList.remove('jb-pop'); void el.offsetWidth; el.classList.add('jb-pop');
        el.addEventListener('animationend', () => el.classList.remove('jb-pop'), { once: true });
    }
    const POP = '[aria-pressed], #btn-fav, #btn-follow, [data-fav], [data-a11y], .theme-toggle';
    document.addEventListener('click', e => { const b = e.target.closest(POP); if (b && !b.disabled) pop(b); });
    document.addEventListener('change', e => {
        const t = e.target;
        if (t.matches && t.matches('.form-switch .form-check-input, .form-check-input[type="checkbox"]')) pop(t);
    });
    // Sino: o contador "pula" quando o número sobe
    let lastCount = null;
    const readCount = () => { const c = document.querySelector('.notif-count'); return c ? parseInt(c.textContent, 10) || 10 : 0; };
    new MutationObserver(() => {
        const n = readCount();
        if (lastCount !== null && n > lastCount && !reduced()) {
            const c = document.querySelector('.notif-count');
            if (c) { c.classList.add('jb-bump'); c.addEventListener('animationend', () => c.classList.remove('jb-bump'), { once: true }); }
        }
        lastCount = n;
    }).observe(document.getElementById('site-top') || body, { childList: true, subtree: true });

    /* ---------- Barra de progresso de leitura (matéria) ---------- */
    const article = document.getElementById('article');
    if (article && page === 'noticias') {
        const bar = document.createElement('div');
        bar.className = 'jb-progress';
        bar.setAttribute('aria-hidden', 'true');   // decorativa: o leitor de tela já sabe onde está
        bar.hidden = true;
        bar.innerHTML = '<span></span>';
        body.appendChild(bar);
        const fill = bar.firstChild;
        let ticking = false, last = -1;
        const update = () => {
            ticking = false;
            const content = article.querySelector('.article-body');   // o texto da matéria é a referência
            if (!content) { bar.hidden = true; return; }
            const r = content.getBoundingClientRect();
            const total = r.height - innerHeight * 0.35;   // termina quando o fim do texto chega perto do rodapé da tela
            const p = total <= 0 ? 1 : Math.max(0, Math.min(1, (innerHeight * 0.65 - r.top) / total));
            bar.hidden = r.height < innerHeight * 0.5;     // texto curto: sem barra
            if (Math.abs(p - last) > 0.001) { fill.style.setProperty('--p', p.toFixed(4)); last = p; }
        };
        const ask = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
        window.addEventListener('scroll', ask, { passive: true });
        window.addEventListener('resize', ask);
        new MutationObserver(ask).observe(article, { childList: true, subtree: true });
        ask();
    }

    JB.Motion = { reveal: el => (io && !off() ? prepare(el, false) : null), pop, reduced, off };
})();
