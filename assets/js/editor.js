/* Editor de matérias: pages/editor.html (nova matéria) e editor.html?id=<id> (edição).
   Página inteira para escrever: título e resumo grandes, texto com formatação (negrito, itálico,
   links, intertítulos, citações e listas), mídia (imagem e vídeo do YouTube), gráfico, fontes,
   cronologia, correções e atualizações ao vivo, com prévia do card e rascunho automático no navegador.
   O texto é guardado como lista de blocos (util.blockOf/bodyHTML em storage.js): o banco continua
   recebendo uma lista de strings, sem HTML. Quem impede um jornalista de publicar ou de editar a
   matéria de outro é o banco (RLS); esconder opções aqui é só interface. */
JB.authReady.then(function () {
    'use strict';
    const { News, Authors, Auth, Members, Drafts, Tags, Badges, DIVISIONS, VERDICTS, IMAGES, STATUS, CHART_TYPES, util } = JB;
    const { esc } = util;
    const $ = id => document.getElementById(id);
    const form = $('news-form');
    const field = n => form.elements[n];
    let currentId = new URLSearchParams(location.search).get('id') || '';

    if (!Auth.isStaff()) {
        $('ed-loading').hidden = true; $('gate').hidden = false;
        const next = 'editor.html' + (currentId ? '?id=' + encodeURIComponent(currentId) : '');
        $('gate').querySelector('a').href = 'login.html?next=' + encodeURIComponent(next);
        if (util.isStaffRole(Auth.realRole())) {
            const st = Auth.mfaState();
            $('gate').innerHTML = '<h1 class="h3">Falta um passo</h1><p>' + esc(!Auth.ageOk() ? 'Confirme sua idade para liberar a conta.'
                : st === 'challenge' ? 'Digite o código do app autenticador para usar o editor.'
                : 'A equipe da redação só usa o editor com a verificação em duas etapas ativada.') +
                '</p><a class="btn btn-primary" href="seguranca.html?next=' + encodeURIComponent(next) + '">Continuar</a>';
        }
        return;
    }
    const me = Auth.current();
    const editor = Auth.isEditor();
    const allowedStatuses = Auth.allowedStatuses();
    const defaultStatus = editor ? 'publicada' : 'rascunho';
    const msg = $('admin-msg');
    const saveBtn = $('save-btn');
    const note = (t, type) => { msg.className = 'alert alert-' + (type || 'success'); msg.textContent = t; msg.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => { msg.hidden = true; }, 6000); };
    const opts = (obj, label) => Object.keys(obj).map(k => '<option value="' + k + '">' + esc(label ? label(obj[k]) : obj[k]) + '</option>').join('');
    const nowIso = () => new Date().toISOString();
    const hm = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const hhmm = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    field('status').innerHTML = allowedStatuses.map(s => '<option value="' + s + '">' + esc(STATUS[s]) + '</option>').join('');
    const professor = Auth.role() === 'professor';
    $('status-help').textContent = editor ? 'Você pode publicar, agendar e arquivar.' : (professor ? 'Professores' : 'Jornalistas') + ' levam o conteúdo até “Aprovada”; quem publica é um coordenador.';
    $('feat-wrap').hidden = !editor;
    field('verdict').innerHTML += opts(VERDICTS, v => v.label);

    /* ---------- Divisão (Jornal Brasileiro, JB Educa…): cada uma tem as suas editorias e tipos ----------
       Professores só escrevem no JB Educa (o banco também confere). */
    const divisions = Auth.divisions();
    field('division').innerHTML = divisions.map(d => '<option value="' + d + '">' + esc(DIVISIONS[d].name) + '</option>').join('');
    $('division-wrap').hidden = divisions.length < 2;
    const divisionFromUrl = new URLSearchParams(location.search).get('divisao');
    const defaultDivision = divisions.includes(divisionFromUrl) ? divisionFromUrl : divisions[0];
    function syncDivision() {
        const key = DIVISIONS[field('division').value] ? field('division').value : 'jb', d = DIVISIONS[key];
        const cat = field('category').value, kind = field('kind').value;
        field('category').innerHTML = opts(d.categories, c => c.label);
        field('kind').innerHTML = opts(d.kinds);
        field('category').value = d.categories[cat] ? cat : d.defaultCategory;
        field('kind').value = d.kinds[kind] ? kind : d.defaultKind;
        $('cat-label').textContent = key === 'educa' ? 'Disciplina' : 'Editoria';
        $('division-help').textContent = d.desc;
        $('rte-ex-btn').hidden = key !== 'educa';
        form.dataset.division = key;
        if (typeof syncKind === 'function') syncKind();
    }
    field('division').addEventListener('change', () => { syncDivision(); if (!field('image').value) setImage(''); renderCard(); });
    field('chartType').innerHTML = opts(CHART_TYPES);

    /* =====================================================================
       Texto com formatação (contenteditable). Salvo como blocos:
       "## " intertítulo, "### " subtítulo, "> " citação, "- " / "1. " listas, **negrito**, *itálico*, [texto](link)
       ===================================================================== */
    const rte = $('f-body');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { }
    const BLOCK_RE = /^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|UL|OL|LI|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|FIGCAPTION|PRE|ADDRESS|MAIN|ASIDE|NAV|DL|DT|DD|HR|CENTER)$/;
    const BLOCK_SEL = 'p,div,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,li,table,tr,td,th,section,article,header,footer,figure,pre,address,main,aside,nav,dl,dt,dd,hr,center';
    const SKIP_RE = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|IFRAME|OBJECT|EMBED|SVG|IMG|VIDEO|AUDIO|CANVAS|BUTTON|INPUT|SELECT|TEXTAREA|META|LINK|TITLE|HEAD)$/;
    const isBlock = n => n.nodeType === 1 && BLOCK_RE.test(n.nodeName);
    const hasBlockInside = n => n.nodeType === 1 && typeof n.querySelector === 'function' && !!n.querySelector(BLOCK_SEL);
    const escInline = s => s.replace(/([\\*[\]])/g, '\\$1');
    // Fórmulas (MathML gerado por util.texToMathML): voltam a ser o LaTeX guardado na <annotation>.
    // As barras são dobradas, como no resto do texto (util.blockOf/inlineHTML desfazem).
    const isMath = n => n.nodeType === 1 && String(n.nodeName).toLowerCase() === 'math';
    const mathTex = m => { const a = m.querySelector('annotation'); return String(a ? a.textContent : m.textContent).replace(/[$\n\r]+/g, ' ').trim().slice(0, 500); };
    const escTex = s => s.replace(/\\/g, '\\\\');
    const URL_ESC = { '(': '%28', ')': '%29', ' ': '%20', '*': '%2A' };
    const wrapWith = (s, mark) => { const x = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return x[2] ? x[1] + mark + x[2] + mark + x[3] : s; };
    const wrapLink = (s, href) => { const x = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return x[2] && !/\n/.test(x[2]) ? x[1] + '[' + x[2] + '](' + href.replace(/[()\s*]/g, c => URL_ESC[c] || '') + ')' + x[3] : s; };
    // Conteúdo em linha de uma lista de nós → texto com marcação
    function inlineOf(nodes, st) {
        st = st || { b: false, i: false };
        let out = '';
        Array.prototype.forEach.call(nodes, c => {
            if (c.nodeType === 3) { out += escInline(c.nodeValue.replace(/[\s\u00A0]+/g, ' ')); return; }
            if (isMath(c)) { const tex = mathTex(c); if (tex) out += '$$' + escTex(tex) + '$$'; return; }   // f\u00F3rmula no meio da frase
            if (c.nodeType !== 1 || SKIP_RE.test(c.nodeName)) return;
            if (c.nodeName === 'BR') { out += '\n'; return; }
            const style = (c.getAttribute('style') || '').toLowerCase();
            let bold = c.nodeName === 'B' || c.nodeName === 'STRONG', ital = c.nodeName === 'I' || c.nodeName === 'EM';
            const fw = /font-weight\s*:\s*(\d+|bold|bolder|normal|lighter)/.exec(style);
            if (fw) bold = /bold/.test(fw[1]) || Number(fw[1]) >= 600;   // o Google Docs embrulha tudo em <b style="font-weight:normal">
            if (/font-style\s*:\s*italic/.test(style)) ital = true;
            let inner = inlineOf(c.childNodes, { b: st.b || bold, i: st.i || ital });
            if (c.nodeName === 'A') { const href = util.safeUrl(c.getAttribute('href')); if (href) inner = wrapLink(inner, href); }
            if (ital && !st.i) inner = wrapWith(inner, '*');
            if (bold && !st.b) inner = wrapWith(inner, '**');
            out += inner;
        });
        return out;
    }
    const clean = s => s.replace(/[ \t\u00A0]+/g, ' ').replace(/ *\n */g, '\n').replace(/^\n+|\n+$/g, '').trim();
    // Parágrafo que começa como marcação (ex.: "- não é lista") ganha o escape para continuar parágrafo
    const escapeStart = s => util.blockOf(s).type === 'p' ? s : (/^\d/.test(s) ? s.replace(/^(\d{1,3})([.)])/, '$1\\$2') : '\\' + s);
    function walk(container, out) {
        let run = [];
        const flush = () => { if (run.length) { const t = clean(inlineOf(run)); if (t) out.push(escapeStart(t)); run = []; } };
        Array.prototype.forEach.call(container.childNodes, c => {
            if (c.nodeType === 1 && SKIP_RE.test(c.nodeName)) return;
            if (!(isBlock(c) || hasBlockInside(c))) { run.push(c); return; }
            flush();
            const t = c.nodeName;
            if (!isBlock(c)) { walk(c, out); return; }   // embrulho em linha com blocos dentro (colado do Google Docs)
            // Imagem do meio do texto (gerada por util.bodyHTML): volta a ser "![legenda](endereço)".
            // Endereço fora do permitido (https, galeria do site, data URL de imagem) é descartado.
            if (t === 'FIGURE' && c.hasAttribute('data-src')) {
                const cap = c.querySelector('figcaption'), img = c.querySelector('img');
                const b = util.imgBlock(c.getAttribute('data-src'), cap ? cap.textContent : img ? img.getAttribute('alt') : '');
                if (util.blockOf(b).type === 'img') out.push(b);
                return;
            }
            // Fórmula em destaque ("$$ tex") e exercício ("?? enunciado\n=> resposta"), gerados por util.bodyHTML
            if (t === 'DIV' && c.classList.contains('body-math')) {
                const m = c.querySelector('math'), tex = m ? mathTex(m) : '';
                if (tex) out.push('$$ ' + escTex(tex));
                return;
            }
            if (t === 'DIV' && c.classList.contains('body-exercise')) { const b = exerciseOf(c); if (b) out.push(b); return; }
            if (t === 'UL' || t === 'OL') {
                let i = 0;
                Array.prototype.forEach.call(c.childNodes, li => {
                    if (li.nodeType !== 1) return;
                    if (li.nodeName !== 'LI') { walk({ childNodes: [li] }, out); return; }
                    const nested = Array.prototype.filter.call(li.childNodes, x => x.nodeType === 1 && (x.nodeName === 'UL' || x.nodeName === 'OL'));
                    const own = Array.prototype.filter.call(li.childNodes, x => !nested.includes(x));
                    const txt = clean(inlineOf(own));
                    if (txt) out.push((t === 'OL' ? (++i) + '. ' : '- ') + txt.replace(/\n/g, ' '));
                    nested.forEach(nl => walk({ childNodes: [nl] }, out));
                });
            // Intertítulo já é negrito: não repete a marcação de negrito dentro dele
            } else if (t === 'H1' || t === 'H2') { const x = clean(inlineOf(c.childNodes, { b: true, i: false })).replace(/\n/g, ' '); if (x) out.push('## ' + x); }
            else if (/^H[3-6]$/.test(t)) { const x = clean(inlineOf(c.childNodes, { b: true, i: false })).replace(/\n/g, ' '); if (x) out.push('### ' + x); }
            else if (t === 'BLOCKQUOTE') { const sub = []; walk(c, sub); sub.forEach(b => { const x = util.blockOf(b).text; if (x) out.push('> ' + x); }); }
            else if (t === 'LI') { const x = clean(inlineOf(c.childNodes)); if (x) out.push('- ' + x.replace(/\n/g, ' ')); }
            else if (t === 'HR') { /* ignora */ }
            else if (hasBlockInside(c)) walk(c, out);
            else { const x = clean(inlineOf(c.childNodes)); if (x) out.push(escapeStart(x)); }
        });
        flush();
    }
    // Partes de um exercício do texto: {q, a} em marcação (negrito, fórmulas…)
    function exerciseParts(el) {
        const q = el.querySelector('.exercise-q'), a = el.querySelector('.exercise-a > div');
        const qNodes = q ? Array.prototype.filter.call(q.childNodes, x => !(x.nodeType === 1 && x.classList.contains('exercise-n'))) : [];
        return { q: clean(inlineOf(qNodes)), a: a ? clean(inlineOf(a.childNodes)) : '' };
    }
    const exerciseBlock = (q, a) => q ? '?? ' + q + (a ? '\n=> ' + a : '') : '';
    const exerciseOf = el => { const p = exerciseParts(el); return exerciseBlock(p.q, p.a); };
    const domToBlocks = root => { const out = []; walk(root, out); return out; };
    const readBody = () => domToBlocks(rte);
    function setBody(blocks) {
        rte.innerHTML = blocks && blocks.length ? util.bodyHTML(blocks) : '<p><br></p>';
        decorateFigures();
        paintEmpty();
    }
    // Imagens dentro do editor: bloco fechado (não se digita dentro) com botões de legenda e remover
    function decorateFigures() {
        rte.querySelectorAll('figure.body-figure:not([data-ed])').forEach(fig => {
            fig.setAttribute('data-ed', ''); fig.contentEditable = 'false';
            const tools = document.createElement('span');
            tools.className = 'body-figure-tools';
            tools.innerHTML = '<button type="button" class="btn btn-sm btn-light" data-fig="caption">Legenda</button><button type="button" class="btn btn-sm btn-light" data-fig="remove">Remover</button>';
            fig.prepend(tools);
        });
        // Fórmula em destaque e exercício: também blocos fechados, com "Editar" e "Remover"
        rte.querySelectorAll('div.body-math:not([data-ed]), div.body-exercise:not([data-ed])').forEach(el => {
            el.setAttribute('data-ed', ''); el.contentEditable = 'false';
            const tools = document.createElement('span');
            tools.className = 'body-figure-tools';
            tools.innerHTML = '<button type="button" class="btn btn-sm btn-light" data-blk="edit">Editar</button><button type="button" class="btn btn-sm btn-light" data-blk="remove">Remover</button>';
            el.prepend(tools);
        });
        // Fórmula no meio da frase: não se digita dentro (clique para editar)
        rte.querySelectorAll('p math, li math, h2 math, h3 math, blockquote math').forEach(m => { if (m.getAttribute('contenteditable') !== 'false') m.setAttribute('contenteditable', 'false'); });
        rte.querySelectorAll('.body-exercise .exercise-n').forEach((s, i) => { s.textContent = 'Exercício ' + (i + 1); });
    }
    // Coloca um bloco novo (imagem, fórmula, exercício) depois do parágrafo `anchor` e põe o cursor na linha seguinte
    function placeBlock(el, anchor) {
        let after;
        if (anchor && anchor.parentNode === rte && anchor.nodeName === 'P' && !anchor.textContent.trim() && !anchor.querySelector('math')) { anchor.before(el); after = anchor; }
        else {
            after = document.createElement('p'); after.appendChild(document.createElement('br'));
            if (anchor && anchor.parentNode === rte) anchor.after(el, after); else rte.append(el, after);
        }
        decorateFigures();
        rte.focus();
        const r = document.createRange(); r.setStart(after, 0); r.collapse(true);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        onBodyInput();
    }
    const blockEl = raw => { const tpl = document.createElement('template'); tpl.innerHTML = util.bodyHTML([raw]); return tpl.content.firstElementChild; };   // gerado por nós, já escapado
    const topAnchor = () => {
        const s = getSelection();
        let top = s.rangeCount && rte.contains(s.anchorNode) ? s.anchorNode : null;
        while (top && top.parentNode !== rte) top = top.parentNode;
        return top && top !== rte ? top : null;
    };
    const setExpanded = (cmd, on) => { const b = $('rte-toolbar').querySelector('[data-cmd="' + cmd + '"]'); if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false'); };

    /* ---------- Painel "Fórmula" ---------- */
    let mathAnchor = null, mathRange = null, mathEditing = null;
    const mathMsg = t => { $('rte-math-msg').textContent = t; };
    function mathPreview() {
        const tex = $('rte-math-tex').value.trim();
        $('rte-math-preview').innerHTML = tex ? util.texToMathML(tex, !$('rte-math-inline').checked) : '';   // tudo escapado em texToMathML
        mathMsg(/\$/.test(tex) ? 'Tire o símbolo $ da fórmula.' : '');
    }
    function openMathPanel(editing) {
        closePanels('math');
        mathEditing = editing || null;
        mathAnchor = topAnchor();
        const s = getSelection();
        mathRange = !editing && s.rangeCount && rte.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
        $('rte-math-tex').value = editing ? mathTex(isMath(editing) ? editing : editing.querySelector('math')) : '';
        $('rte-math-inline').checked = editing ? isMath(editing) : false;
        $('rte-math-inline').disabled = !!editing;
        $('rte-math-insert').textContent = editing ? 'Atualizar fórmula' : 'Inserir no texto';
        mathPreview();
        $('rte-math-panel').hidden = false; setExpanded('math', true);
        $('rte-math-tex').focus();
    }
    function closeMathPanel() { $('rte-math-panel').hidden = true; setExpanded('math', false); mathEditing = null; }
    $('rte-math-tex').addEventListener('input', mathPreview);
    $('rte-math-inline').addEventListener('change', mathPreview);
    $('rte-math-cancel').addEventListener('click', () => { closeMathPanel(); rte.focus(); });
    $('rte-math-insert').addEventListener('click', () => {
        const tex = $('rte-math-tex').value.replace(/[\r\n]+/g, ' ').trim();
        if (!tex) { mathMsg('Escreva a fórmula.'); $('rte-math-tex').focus(); return; }
        if (/\$/.test(tex)) { mathMsg('Tire o símbolo $ da fórmula.'); return; }
        const inline = $('rte-math-inline').checked;
        if (mathEditing) {
            if (isMath(mathEditing)) {
                const tpl = document.createElement('template'); tpl.innerHTML = util.inlineHTML('$$' + escTex(tex) + '$$');
                const m = tpl.content.firstElementChild; if (m) mathEditing.replaceWith(m);
            } else { const el = blockEl('$$ ' + escTex(tex)); if (el) mathEditing.replaceWith(el); }
            closeMathPanel(); decorateFigures(); onBodyInput(); return;
        }
        closeMathPanel();
        if (inline) {
            rte.focus();
            if (mathRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(mathRange); }
            exec('insertHTML', util.inlineHTML('$$' + escTex(tex) + '$$') + '&nbsp;');
            decorateFigures(); onBodyInput();
        } else { const el = blockEl('$$ ' + escTex(tex)); if (el) placeBlock(el, mathAnchor); }
    });

    /* ---------- Painel "Exercício" (JB Educa) ---------- */
    let exAnchor = null, exEditing = null;
    const mapMath = (v, f) => v.replace(/\$\$([^$\n]{1,500}?)\$\$/g, (m, t) => '$$' + f(t) + '$$');
    function openExPanel(editing) {
        closePanels('exercise');
        exEditing = editing || null;
        exAnchor = topAnchor();
        const p = editing ? exerciseParts(editing) : { q: '', a: '' };
        // Na caixa de texto as fórmulas aparecem com as barras simples (como a pessoa digita)
        const plainTex = v => mapMath(v, t => t.replace(/\\\\/g, '\\'));
        $('rte-ex-q').value = plainTex(p.q); $('rte-ex-a').value = plainTex(p.a);
        $('rte-ex-insert').textContent = editing ? 'Atualizar exercício' : 'Inserir no texto';
        $('rte-ex-msg').textContent = '';
        $('rte-ex-panel').hidden = false; setExpanded('exercise', true);
        $('rte-ex-q').focus();
    }
    function closeExPanel() { $('rte-ex-panel').hidden = true; setExpanded('exercise', false); exEditing = null; }
    $('rte-ex-cancel').addEventListener('click', () => { closeExPanel(); rte.focus(); });
    $('rte-ex-insert').addEventListener('click', () => {
        // Texto digitado é marcação (negrito, itálico…); dentro das fórmulas as barras são dobradas
        const prep = v => mapMath(v.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).join('\n'), t => t.replace(/\\/g, '\\\\')).replace(/^=>/gm, '= >');
        const q = prep($('rte-ex-q').value), a = prep($('rte-ex-a').value);
        if (!q) { $('rte-ex-msg').textContent = 'Escreva o enunciado.'; $('rte-ex-q').focus(); return; }
        const el = blockEl(exerciseBlock(q, a));
        if (!el) return;
        if (exEditing) { exEditing.replaceWith(el); closeExPanel(); decorateFigures(); onBodyInput(); return; }
        closeExPanel(); placeBlock(el, exAnchor);
    });
    function closePanels(except) {
        if (except !== 'image' && !$('rte-img-panel').hidden) closeImgPanel();
        if (except !== 'math' && !$('rte-math-panel').hidden) closeMathPanel();
        if (except !== 'exercise' && !$('rte-ex-panel').hidden) closeExPanel();
    }
    rte.addEventListener('click', e => {
        const b = e.target.closest('[data-blk]');
        if (b) {
            e.preventDefault();
            const el = b.closest('.body-math, .body-exercise');
            if (b.dataset.blk === 'remove') { if (confirm(el.classList.contains('body-math') ? 'Remover esta fórmula?' : 'Remover este exercício?')) { el.remove(); onBodyInput(); } return; }
            if (el.classList.contains('body-math')) openMathPanel(el); else openExPanel(el);
            return;
        }
        const m = e.target.closest && e.target.closest('math');
        if (m && !m.closest('.body-math, .body-exercise')) { e.preventDefault(); openMathPanel(m); }
    });
    const figureEl = (src, caption) => {
        const tpl = document.createElement('template');
        tpl.innerHTML = util.bodyHTML([util.imgBlock(src, caption)]);   // gerado por nós, já escapado
        const fig = tpl.content.firstElementChild;
        return fig && fig.nodeName === 'FIGURE' ? fig : null;
    };
    rte.addEventListener('click', e => {
        const b = e.target.closest('[data-fig]'); if (!b) return;
        e.preventDefault();
        const fig = b.closest('figure');
        if (b.dataset.fig === 'remove') { if (confirm('Remover esta imagem do texto?')) { fig.remove(); onBodyInput(); } return; }
        const cap = fig.querySelector('figcaption');
        const next = window.prompt('Legenda da imagem (também é lida por leitores de tela):', cap ? cap.textContent : '');
        if (next === null) return;
        const nf = figureEl(fig.getAttribute('data-src'), next.slice(0, 300));
        if (nf) { fig.replaceWith(nf); decorateFigures(); onBodyInput(); }
    });
    // Painel "Imagem" da barra: envio (reduzido no navegador) ou endereço https, mais a legenda.
    let imgAnchor = null;
    const imgMsg = t => { $('rte-img-msg').textContent = t; };
    function openImgPanel() {
        closePanels('image');
        imgAnchor = topAnchor();
        $('rte-img-file').value = ''; $('rte-img-url').value = ''; $('rte-img-cap').value = '';
        imgMsg(imgAnchor ? 'A imagem entra logo depois do parágrafo onde está o cursor.' : 'A imagem entra no fim do texto.');
        $('rte-img-panel').hidden = false;
        $('rte-toolbar').querySelector('[data-cmd="image"]').setAttribute('aria-expanded', 'true');
        $('rte-img-file').focus();
    }
    function closeImgPanel() {
        $('rte-img-panel').hidden = true;
        $('rte-toolbar').querySelector('[data-cmd="image"]').setAttribute('aria-expanded', 'false');
    }
    $('rte-img-cancel').addEventListener('click', () => { closeImgPanel(); rte.focus(); });
    $('rte-img-insert').addEventListener('click', async () => {
        const file = $('rte-img-file').files[0], url = $('rte-img-url').value.trim(), cap = $('rte-img-cap').value.trim();
        let src = '';
        const btn = $('rte-img-insert');
        if (file) {
            if (!/^image\//.test(file.type)) { imgMsg('Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).'); return; }
            btn.disabled = true; uploading = true; saveBtn.disabled = true; imgMsg('Enviando imagem…');
            try { src = await JB.Media.upload(await resize(file, 1200)); }
            catch (err) { imgMsg(err.message || 'Falha ao enviar a imagem.'); return; }
            finally { btn.disabled = false; uploading = false; saveBtn.disabled = false; }
        } else if (url) {
            if (!/^https:\/\/[^\s()]+$/i.test(url)) { imgMsg('Use um endereço que comece com https:// (sem espaços nem parênteses).'); return; }
            src = url;
        } else { imgMsg('Escolha um arquivo ou cole o endereço da imagem.'); return; }
        const fig = figureEl(src, cap);
        if (!fig) { imgMsg('Endereço de imagem não aceito.'); return; }
        if (!cap && !confirm('Inserir sem legenda? Sem ela, quem usa leitor de tela não sabe o que a imagem mostra.')) return;
        closeImgPanel();
        placeBlock(fig, imgAnchor);
    });
    const paintEmpty = () => { rte.classList.toggle('is-empty', !rte.textContent.trim() && !rte.querySelector('li')); };

    // Comandos da barra
    const exec = (cmd, val) => { try { document.execCommand('styleWithCSS', false, false); } catch (e) { } document.execCommand(cmd, false, val === undefined ? null : val); };
    function inRte() { const s = getSelection(); return s.rangeCount && rte.contains(s.anchorNode); }
    function closestIn(tags) {
        const s = getSelection(); if (!s.rangeCount) return null;
        let n = s.anchorNode;
        while (n && n !== rte) { if (n.nodeType === 1 && tags.includes(n.nodeName)) return n; n = n.parentNode; }
        return null;
    }
    function unwrap(el) {   // tira a citação: o conteúdo volta a ser parágrafo
        const frag = document.createDocumentFragment();
        const loose = [];
        const flushLoose = () => { if (loose.length) { const p = document.createElement('p'); loose.splice(0).forEach(x => p.appendChild(x)); frag.appendChild(p); } };
        Array.from(el.childNodes).forEach(c => { if (isBlock(c)) { flushLoose(); frag.appendChild(c); } else loose.push(c); });
        flushLoose();
        el.replaceWith(frag);
    }
    function addLink() {
        const s = getSelection();
        const range = s.rangeCount && rte.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
        const existing = closestIn(['A']);
        let url = window.prompt('Endereço do link (https://…):', existing ? existing.getAttribute('href') : 'https://');
        if (url === null) return;
        url = url.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (!util.safeUrl(url) || /^https?:\/\/$/i.test(url)) { note('Link inválido: use um endereço que comece com https://', 'danger'); return; }
        rte.focus();
        if (range) { s.removeAllRanges(); s.addRange(range); }
        if (!range || range.collapsed) exec('insertHTML', '<a href="' + esc(url) + '">' + esc(url.replace(/^https?:\/\//i, '')) + '</a>');
        else exec('createLink', url);
    }
    const CMDS = {
        bold: () => exec('bold'), italic: () => exec('italic'), link: addLink, unlink: () => { const a = closestIn(['A']); if (a) { const r = document.createRange(); r.selectNodeContents(a); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } exec('unlink'); },
        h2: () => exec('formatBlock', closestIn(['H2']) ? 'p' : 'h2'),
        h3: () => exec('formatBlock', closestIn(['H3']) ? 'p' : 'h3'),
        quote: () => { const q = closestIn(['BLOCKQUOTE']); if (q) unwrap(q); else exec('formatBlock', 'blockquote'); },
        ul: () => exec('insertUnorderedList'), ol: () => exec('insertOrderedList'),
        clear: () => { exec('removeFormat'); exec('unlink'); if (closestIn(['H2', 'H3'])) exec('formatBlock', 'p'); const q = closestIn(['BLOCKQUOTE']); if (q) unwrap(q); },
        undo: () => exec('undo'), redo: () => exec('redo'),
        image: () => { if ($('rte-img-panel').hidden) openImgPanel(); else closeImgPanel(); },
        math: () => { if ($('rte-math-panel').hidden) openMathPanel(); else closeMathPanel(); },
        exercise: () => { if ($('rte-ex-panel').hidden) openExPanel(); else closeExPanel(); }
    };
    $('rte-toolbar').addEventListener('mousedown', e => { if (e.target.closest('.rte-btn')) e.preventDefault(); });   // não tira a seleção do texto
    $('rte-toolbar').addEventListener('click', e => {
        const b = e.target.closest('[data-cmd]'); if (!b) return;
        if (!inRte()) { rte.focus(); }
        CMDS[b.dataset.cmd]();
        onBodyInput(); paintToolbar();
    });
    function paintToolbar() {
        if (!inRte()) return;
        const on = (cmd, v) => { const b = $('rte-toolbar').querySelector('[data-cmd="' + cmd + '"]'); if (b) b.setAttribute('aria-pressed', v ? 'true' : 'false'); };
        let bold = false, ital = false;
        try { bold = document.queryCommandState('bold'); ital = document.queryCommandState('italic'); } catch (e) { }
        on('bold', bold); on('italic', ital);
        on('h2', !!closestIn(['H2'])); on('h3', !!closestIn(['H3'])); on('quote', !!closestIn(['BLOCKQUOTE']));
        on('ul', !!closestIn(['UL'])); on('ol', !!closestIn(['OL']));
    }
    document.addEventListener('selectionchange', paintToolbar);
    // Enter no fim de um intertítulo ou citação: a linha nova volta a ser parágrafo
    let enterFromHeading = false;
    rte.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); addLink(); onBodyInput(); }
        enterFromHeading = e.key === 'Enter' && !e.shiftKey && !!closestIn(['H2', 'H3', 'BLOCKQUOTE']);
    });
    rte.addEventListener('input', () => {
        if (!enterFromHeading) return;
        enterFromHeading = false;
        const h = closestIn(['H2', 'H3']), q = closestIn(['BLOCKQUOTE']);
        if (h && !h.textContent.trim()) exec('formatBlock', 'p');
        else if (q) {
            // linha vazia nova dentro da citação: sai para um parágrafo logo depois dela
            const cur = closestIn(['P', 'DIV']);
            if (cur && cur !== q && q.contains(cur) && !cur.textContent.trim() && cur !== q.firstElementChild) {
                const p = document.createElement('p'); p.appendChild(document.createElement('br'));
                cur.remove(); q.after(p);
                const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
                const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            }
        }
        onBodyInput();
    });
    // Colar: passa pelo mesmo conversor (mantém negrito, itálico, links, listas e intertítulos; descarta o resto)
    rte.addEventListener('paste', e => {
        const cd = e.clipboardData; if (!cd) return;
        e.preventDefault();
        const html = cd.getData('text/html'), text = cd.getData('text/plain');
        const blocks = html ? domToBlocks(new DOMParser().parseFromString(html, 'text/html').body)
            : String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => escapeStart(escInline(s)));
        if (!blocks.length) return;
        if (blocks.length === 1 && util.blockOf(blocks[0]).type === 'p') exec('insertHTML', util.inlineHTML(blocks[0]));
        else insertBlocks(blocks);
        onBodyInput();
    });
    // Vários blocos colados: divide o bloco atual no cursor e coloca os blocos novos no meio.
    // (O insertHTML do navegador juntava intertítulos e parágrafos dentro de itens de lista.)
    function insertBlocks(blocks) {
        const s = getSelection(); if (!s.rangeCount) return;
        const r = s.getRangeAt(0); r.deleteContents();
        let top = r.startContainer;
        while (top && top.parentNode !== rte) top = top.parentNode;
        if (top && top.nodeType === 3) { const p = document.createElement('p'); top.replaceWith(p); p.appendChild(top); top = p; }
        const tpl = document.createElement('template');
        tpl.innerHTML = util.bodyHTML(blocks);   // gerado por nós, já escapado
        const nodes = Array.from(tpl.content.childNodes);
        if (!top || top === rte) rte.append(...nodes);
        else {
            const tail = document.createRange();
            tail.setStart(r.startContainer, r.startOffset); tail.setEnd(top, top.childNodes.length);
            const tailEl = top.cloneNode(false); tailEl.appendChild(tail.extractContents());
            top.after(...nodes);
            if (tailEl.textContent.trim()) nodes[nodes.length - 1].after(tailEl);
            if (!top.textContent.trim()) top.remove();
        }
        const last = nodes[nodes.length - 1];
        if (last) { const c = document.createRange(); c.selectNodeContents(last); c.collapse(false); s.removeAllRanges(); s.addRange(c); }
    }
    rte.addEventListener('input', () => onBodyInput());
    // Links dentro do editor não navegam
    rte.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); });
    function onBodyInput() {
        decorateFigures();   // imagens coladas de outra matéria
        paintEmpty();
        if (!rte.firstChild) rte.innerHTML = '<p><br></p>';
        $('body-error').hidden = true; rte.classList.remove('is-invalid');
        renderStats(); changed();
    }
    function renderStats() {
        const words = readBody().map(util.plainText).join(' ').split(/\s+/).filter(Boolean).length;
        $('editor-stats').textContent = words + (words === 1 ? ' palavra' : ' palavras') + ' · ' + Math.max(1, Math.round(words / 200)) + ' min de leitura';
    }

    /* ---------- Título e resumo: altura automática e contador ---------- */
    function grow(ta) { if (!ta.offsetParent) return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }   // só com o formulário visível
    function counts() {
        const t = field('title').value.length, s = field('subtitle').value.length;
        $('title-count').innerHTML = (t > 90 ? '<span class="is-long">Título longo: o ideal para busca e compartilhamento é até 90 caracteres · </span>' : '') + t + '/300';
        $('sub-count').innerHTML = (s > 200 ? '<span class="is-long">Resumo longo: as redes mostram cerca de 200 caracteres · </span>' : '') + s + '/600';
    }
    ['title', 'subtitle'].forEach(n => field(n).addEventListener('input', () => { grow(field(n)); counts(); $(n === 'title' ? 'title-error' : 'sub-error').hidden = true; }));
    field('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); field('subtitle').focus(); } });
    field('subtitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rte.focus(); } });

    /* ---------- Campos "a | b" (uma linha por item) ---------- */
    const parseLines = (text, a, b) => text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const i = l.indexOf('|');
        const o = {}; o[a] = (i < 0 ? l : l.slice(0, i)).trim(); o[b] = i < 0 ? '' : l.slice(i + 1).trim();
        return o;
    }).filter(o => o[a] || o[b]);
    const formatLines = (list, a, b) => (list || []).map(o => (o[a] || '') + (o[b] ? ' | ' + o[b] : '')).join('\n');
    // Aceita "14000", "14.000", "8,6", "8.6", "R$ 2,1", "15%" e "74 contratos"
    const toNumber = v => {
        const m = String(v).replace(/R\$/gi, '').match(/-?\d[\d.,]*/);
        if (!m) return NaN;
        let s = m[0].replace(/[.,]$/, '');
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        return Number(s);
    };
    function readSources() {
        return parseLines(field('sources').value, 'label', 'url').map(s => (!s.url && /^https?:\/\//i.test(s.label)) ? { label: s.label, url: s.label } : s);
    }

    /* ---------- Gráfico ---------- */
    const CHART_MAX = 12;
    function parseChartLine(line) {
        let label, value;
        const sep = ['|', '\t', ';', '=', ':'].find(s => line.includes(s));
        if (sep) { const i = line.lastIndexOf(sep); label = line.slice(0, i); value = line.slice(i + 1); }
        else { const m = line.match(/^(.*?)\s+((?:R\$\s*)?-?\d[\d.,]*\s*%?\D*)$/i); if (!m) return null; label = m[1]; value = m[2]; }
        label = label.trim().replace(/[\s|;:=–—-]+$/, '').slice(0, 80);
        value = toNumber(value);
        return label && isFinite(value) ? { label, value } : null;
    }
    // { chart, bad: [linhas inválidas], nonPositive: [linhas ≤ 0], extra, touched }
    function chartState() {
        const lines = field('chartItems').value.split('\n').map(l => l.trim()).filter(Boolean);
        const items = [], bad = [], nonPositive = [];
        lines.forEach((l, i) => { const it = parseChartLine(l); if (!it) bad.push(i + 1); else { items.push(it); if (it.value <= 0) nonPositive.push(i + 1); } });
        const meta = { type: field('chartType').value || 'bar', title: field('chartTitle').value.trim(), unit: field('chartUnit').value.trim(), source: field('chartSource').value.trim() };
        return {
            chart: items.length ? Object.assign(meta, { items: items.slice(0, CHART_MAX) }) : null,
            bad, nonPositive, extra: Math.max(0, items.length - CHART_MAX), touched: !!(lines.length || meta.title || meta.unit || meta.source)
        };
    }
    function chartProblem(st) {
        if (st.bad.length) return 'Gráfico: a(s) linha(s) ' + st.bad.join(', ') + ' não têm um número. Use “rótulo | número”, por exemplo “Sudeste | 74”.';
        if (st.extra) return 'Gráfico: no máximo ' + CHART_MAX + ' itens (há ' + (CHART_MAX + st.extra) + ').';
        if (st.touched && !st.chart) return 'Gráfico: preencha os dados (um item por linha, “rótulo | número”) ou apague o título, a unidade e a fonte.';
        if (st.chart && st.chart.type === 'donut' && st.nonPositive.length) return 'Gráfico de rosca: use só valores positivos (linha ' + st.nonPositive.join(', ') + '). Para comparar valores negativos, escolha barras ou colunas.';
        if (st.chart && (st.chart.type === 'line' || st.chart.type === 'area') && st.chart.items.length < 2) return 'Gráfico de linha/área: informe pelo menos 2 pontos.';
        return '';
    }
    function renderChartPreview() {
        const st = chartState(), problem = chartProblem(st);
        const status = $('chart-status');
        status.textContent = problem || (st.chart ? st.chart.items.length + ' item(ns). Prévia:' : '');
        status.className = 'form-text' + (problem ? ' text-danger fw-semibold' : '');
        $('chart-preview').innerHTML = st.chart && !problem ? util.chartHTML(st.chart) : '';
        field('chartItems').classList.toggle('is-invalid', !!st.bad.length || !!st.extra || (!!st.chart && !!problem));
    }
    ['chartType', 'chartTitle', 'chartUnit', 'chartSource', 'chartItems'].forEach(n => field(n).addEventListener('input', renderChartPreview));

    /* ---------- Vídeo do YouTube ---------- */
    function renderVideo() {
        const raw = field('video').value.trim(), v = util.parseVideo(raw), st = $('video-status');
        field('video').classList.toggle('is-invalid', !!raw && !v);
        st.className = 'form-text' + (raw && !v ? ' text-danger fw-semibold' : '');
        st.textContent = !raw ? '' : v ? (/^channel:/.test(v) ? 'Live do canal reconhecida.' : 'Vídeo reconhecido.') : 'Não reconhecemos esse link do YouTube. Copie o endereço do vídeo, do Short ou da live.';
        $('video-preview').innerHTML = v ? util.videoHTML({ video: v, title: field('title').value || 'Vídeo', image: field('image').value, category: field('category').value, kind: field('kind').value }) : '';
    }
    field('video').addEventListener('input', renderVideo);

    /* ---------- Tipo de conteúdo: mostra só os campos que fazem sentido ---------- */
    function syncKind() {
        const k = field('kind').value;
        $('verdict-wrap').hidden = k !== 'checagem';
        field('verdict').required = k === 'checagem';
        $('live-wrap').hidden = $('updates-box').hidden = k !== 'aovivo';
        $('body-help-qa').hidden = k !== 'entrevista';
    }
    field('kind').addEventListener('change', syncKind);

    /* ---------- Atualizações ao vivo e correções ---------- */
    let formUpdates = [], formCorrections = [];
    function renderUpdates() {
        const list = formUpdates.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        $('updates-list').innerHTML = list.map(u => '<li><span><strong>' + esc(hm(u.date)) + '</strong> ' + esc(u.text) + (u.author ? ' <small class="text-muted">— ' + esc(u.author) + '</small>' : '') + '</span>' +
            '<button type="button" class="btn btn-sm btn-outline-primary" data-uprm="' + esc(u.date + '|' + u.text) + '" aria-label="Remover atualização">×</button></li>').join('') || '<li class="text-muted small">Nenhuma atualização ainda.</li>';
    }
    function renderCorrections() {
        $('corrections-list').innerHTML = formCorrections.map((c, i) => '<li><span><strong>' + esc(hm(c.date)) + '</strong> ' + esc(c.text) + '</span>' +
            '<button type="button" class="btn btn-sm btn-outline-primary" data-corrm="' + i + '" aria-label="Remover correção">×</button></li>').join('') || '<li class="text-muted small">Nenhuma correção registrada.</li>';
    }
    // Em matéria já salva, a lista vai para o servidor na hora (é o que o leitor vê ao vivo)
    async function persistList(key, value, okText) {
        if (!currentId) { changed(); return; }
        const patch = { id: currentId }; patch[key] = value;
        News.save(patch);
        const ok = await JB.flush();
        const n = News.get(currentId);
        if (ok) note(okText); else if (n) { formUpdates = (n.updates || []).slice(); formCorrections = (n.corrections || []).slice(); renderUpdates(); renderCorrections(); }
        baselineLists();
    }
    $('add-update').addEventListener('click', () => {
        const ta = $('f-update'), text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        formUpdates.push({ date: nowIso(), text, author: me ? me.name : '' });
        ta.value = ''; renderUpdates();
        persistList('updates', formUpdates.slice(), 'Atualização publicada.');
    });
    $('updates-list').addEventListener('click', e => {
        const b = e.target.closest('[data-uprm]'); if (!b || !confirm('Remover esta atualização?')) return;
        formUpdates = formUpdates.filter(u => (u.date + '|' + u.text) !== b.dataset.uprm); renderUpdates();
        persistList('updates', formUpdates.slice(), 'Atualização removida.');
    });
    $('corrections-list').addEventListener('click', e => {
        const b = e.target.closest('[data-corrm]'); if (!b || !confirm('Remover esta correção? Pela política de correções, o ideal é mantê-la.')) return;
        formCorrections.splice(Number(b.dataset.corrm), 1); renderCorrections();
        persistList('corrections', formCorrections.slice(), 'Correção removida.');
    });

    /* ---------- Imagem: galeria local, upload ou URL ---------- */
    const preview = $('img-preview'), options = $('img-options'), warn = $('img-warn');
    options.innerHTML = '<button type="button" class="img-option auto" data-img="" title="Automática (pela editoria)">Automática</button>' +
        Object.keys(IMAGES).map(p => '<button type="button" class="img-option" data-img="' + esc(p) + '" title="' + esc(IMAGES[p]) + '"><img src="' + esc(util.root() + p) + '" alt="' + esc(IMAGES[p]) + '" loading="lazy"></button>').join('');
    function setImage(value) {
        field('image').value = value;
        warn.hidden = true;
        preview.src = util.imgSrc({ image: value, category: field('category').value });
        options.querySelectorAll('.img-option').forEach(b => b.classList.toggle('selected', b.dataset.img === value));
        if (!(value in IMAGES)) field('imageUrl').value = /^https?:/.test(value) ? value : '';
        changed();
    }
    const warnImg = (t, type) => { warn.className = 'alert alert-' + (type || 'warning') + ' py-1 px-2 small mt-2 mb-0'; warn.textContent = t; warn.hidden = false; };
    options.addEventListener('click', e => { const b = e.target.closest('.img-option'); if (b) { $('img-file').value = ''; setImage(b.dataset.img); } });
    field('category').addEventListener('change', () => { if (!field('image').value) setImage(''); });
    field('imageUrl').addEventListener('input', e => {
        const v = e.target.value.trim();
        if (v && !/^https:\/\//i.test(v)) { warnImg('Use um endereço que comece com https://'); return; }
        setImage(v);
    });
    // Reduz no navegador (lado maior ≤ max px). WebP quando o navegador gera; senão JPEG.
    function resize(file, max) {
        return new Promise((resolve, reject) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                const fail = () => reject(new Error('Não foi possível processar a imagem.'));
                c.toBlob(b => {
                    if (b && b.type === 'image/webp') resolve(b);
                    else c.toBlob(j => j ? resolve(j) : fail(), 'image/jpeg', 0.82);
                }, 'image/webp', 0.82);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esse arquivo como imagem.')); };
            img.src = url;
        });
    }
    let uploading = false;
    $('img-file').addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        if (!/^image\//.test(file.type)) { warnImg('Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).'); return; }
        uploading = true; saveBtn.disabled = true; warnImg('Enviando imagem…', 'info');
        try { setImage(await JB.Media.upload(await resize(file, 1200))); }
        catch (err) { warnImg(err.message || 'Falha ao enviar a imagem.', 'danger'); e.target.value = ''; }
        finally { uploading = false; saveBtn.disabled = false; }
    });

    /* ---------- Prévia do card ---------- */
    function renderCard() {
        const fake = util.withDefaults({
            id: currentId || 'previa', title: field('title').value.trim() || 'Título da matéria', subtitle: field('subtitle').value.trim() || 'Resumo da matéria',
            category: field('category').value, kind: field('kind').value, verdict: field('verdict').value || null, live: field('live').checked,
            video: util.parseVideo(field('video').value), image: field('image').value, author: field('author').value.trim() || 'Redação JB', coauthors: formCoauthors.slice(),
            division: field('division').value, tags: formTags.slice(), badges: formBadges.slice(), edit_credits: formEditCredits.slice(),
            date: field('pubdate').value ? new Date(field('pubdate').value).toISOString() : nowIso(), body: []
        });
        $('card-preview').innerHTML = util.newsCard(fake);
    }

    /* ---------- Estado do formulário, alterações e rascunho no navegador ---------- */
    const STATE_FIELDS = ['title', 'subtitle', 'division', 'kind', 'category', 'verdict', 'author', 'status', 'pubdate', 'image', 'video', 'sources', 'timeline', 'people', 'chartType', 'chartTitle', 'chartUnit', 'chartSource', 'chartItems', 'correction'];
    function formState() {
        const s = {};
        STATE_FIELDS.forEach(k => { s[k] = field(k).value; });
        s.live = field('live').checked; s.featured = field('featured').checked;
        s.body = readBody();
        s.coauthors = formCoauthors.slice(); s.editors = formEditors.slice();
        s.editCredits = formEditCredits.slice(); s.tags = formTags.slice(); s.badges = formBadges.slice();
        return s;
    }
    function applyState(s) {
        // A divisão vem antes: ela define as opções de editoria e de tipo
        if (s.division && divisions.includes(s.division)) field('division').value = s.division;
        syncDivision();
        STATE_FIELDS.forEach(k => { if (k in s && field(k) && k !== 'division') field(k).value = s[k]; });
        field('live').checked = !!s.live; field('featured').checked = !!s.featured;
        formCoauthors = Array.isArray(s.coauthors) ? s.coauthors.slice() : []; renderCoauthors();
        if (Array.isArray(s.editors)) formEditors = s.editors.slice();
        formEditCredits = Array.isArray(s.editCredits) ? s.editCredits.slice() : []; renderEditCredits();
        formTags = Array.isArray(s.tags) ? s.tags.slice() : []; renderTags();
        formBadges = Array.isArray(s.badges) ? s.badges.slice() : []; renderBadgePicks();
        renderCollab();
        setBody(s.body || []);
        setImage(s.image || '');
        afterFill();
    }
    let baseline = '', baseLists = '';
    const draftKey = () => 'news:' + (currentId || 'nova');
    const listsState = () => JSON.stringify([formUpdates, formCorrections]);
    function baselineLists() { baseLists = listsState(); }
    function markClean() { baseline = JSON.stringify(formState()); baselineLists(); paintDirty(); }
    const isDirty = () => !!baseline && (JSON.stringify(formState()) !== baseline || (!currentId && listsState() !== baseLists));
    let draftTimer = null, ready = false;
    function paintDirty(text) {
        const el = $('save-state'), dirty = isDirty();
        el.classList.toggle('is-dirty', dirty);
        el.textContent = text || (dirty ? 'Alterações não salvas' : (currentId ? 'Tudo salvo' : ''));
    }
    function changed() {
        if (!ready) return;
        paintDirty();
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
            renderCard();
            if (isDirty()) { Drafts.set(draftKey(), formState()); paintDirty('Alterações não salvas · cópia guardada neste navegador às ' + hhmm()); }
            else Drafts.clear(draftKey());
        }, 700);
    }
    form.addEventListener('input', e => { if (!rte.contains(e.target)) changed(); });
    form.addEventListener('change', e => { if (!rte.contains(e.target)) changed(); });
    window.addEventListener('beforeunload', e => { if (ready && isDirty()) { e.preventDefault(); e.returnValue = ''; } });
    function offerDraft() {
        const d = Drafts.get(draftKey()), box = $('draft-note');
        box.hidden = true;
        if (!d || !d.data || JSON.stringify(d.data) === baseline) return;
        box.innerHTML = '<span>Há uma versão não salva desta matéria guardada neste navegador (' + esc(hm(d.at)) + ').</span>' +
            '<span class="d-flex gap-2"><button type="button" class="btn btn-sm btn-primary" data-draft="use">Recuperar</button><button type="button" class="btn btn-sm btn-outline-dark" data-draft="drop">Descartar</button></span>';
        box.hidden = false;
    }
    $('draft-note').addEventListener('click', e => {
        const b = e.target.closest('[data-draft]'); if (!b) return;
        const d = Drafts.get(draftKey());
        if (b.dataset.draft === 'use' && d) { applyState(d.data); paintDirty(); note('Versão do navegador recuperada. Revise e salve.', 'info'); }
        else Drafts.clear(draftKey());
        $('draft-note').hidden = true;
    });

    /* ---------- Créditos: autor, coautores (assinatura) e edição ----------
       Nomes conferidos sem diferenciar maiúsculas com os autores cadastrados e a equipe: "games" vira
       "Games" (o nome da conta) e não aparece como uma pessoa a mais. Núcleos da redação ("Redação
       Investigativa JB", "Núcleo de Verificação JB") são autores oficiais ou nomes livres. A lista de
       quem pode EDITAR a matéria é outra (Colaboradores de edição): crédito não dá permissão. */
    const DESK_RE = /\b(reda[cç][aã]o|n[uú]cleo|equipe|mesa|editoria|desk|central|ag[eê]ncia)\b/i;
    function people() {
        const out = [];
        Authors.all().forEach(a => out.push({ name: a.name, official: !!a.official, author: true }));
        Members.staff().filter(p => util.isStaffRole(p.role)).forEach(p => {
            const o = out.find(x => util.sameName(x.name, p.name));
            if (o) { o.role = p.role; o.id = p.id; } else out.push({ name: p.name, role: p.role, id: p.id });
        });
        return out;
    }
    const personOf = name => people().find(p => util.sameName(p.name, name)) || null;
    const canonName = v => { const p = personOf(v); return p ? p.name : v; };
    function creditKind(name) {
        const p = personOf(name);
        if (p && p.role) return util.roleLabel(p.role) + ' ' + util.sealHTML(p.role);
        if (p && p.official) return 'Perfil oficial ' + util.officialSealHTML({ official: true });
        if (p) return 'Autor cadastrado';
        return DESK_RE.test(name) ? 'Núcleo / equipe' : 'Nome livre';
    }
    function paintAuthorKind() {
        const v = field('author').value.trim() || 'Redação JB';
        $('author-kind').innerHTML = esc('Aparece como: ') + creditKind(v);
    }
    field('author').addEventListener('change', () => {
        const v = field('author').value.replace(/\s+/g, ' ').trim();
        if (v) field('author').value = canonName(v);
        paintAuthorKind(); renderCard();
    });
    field('author').addEventListener('input', paintAuthorKind);
    function fillCreditNames() {
        $('credit-names').innerHTML = people().map(p => '<option value="' + esc(p.name) + '">' + esc(p.role ? util.roleLabel(p.role) : p.official ? 'Perfil oficial' : 'Autor') + '</option>').join('');
    }

    // Lista de "chips" com campo + botão "Adicionar" (coautores, edição, tags)
    function chipField(o) {
        const label = c => o.text ? o.text(c) : c;
        const render = () => {
            $(o.list).innerHTML = o.get().map((c, i) => '<li class="chip"><span>' + esc(label(c)) + '</span>' + (o.meta ? '<small class="chip-kind">' + o.meta(c) + '</small>' : '') +
                '<button type="button" class="chip-del" data-del="' + i + '" aria-label="Tirar ' + esc(label(c)) + ' de ' + esc(o.noun) + '">×</button></li>').join('');
        };
        let busy = false;
        async function add() {
            const inp = $(o.input), raw = inp.value.replace(/\s+/g, ' ').trim();
            if (!raw || busy) return;
            const fail = t => { note(t, 'warning'); inp.focus(); };
            const list = o.get();
            if (list.length >= o.max) return fail('No máximo ' + o.max + ' em ' + o.noun + '.');
            busy = true;
            let v;
            try { v = await o.canon(raw); } finally { busy = false; }
            if (!v) { inp.focus(); return; }
            if (list.some(x => util.sameName(x, v))) return fail(label(v) + ' já está em ' + o.noun + '.');
            const err = o.check ? o.check(v, list) : '';
            if (err) return fail(err);
            o.set(list.concat([v])); inp.value = ''; render(); changed(); renderCard();
        }
        $(o.button).addEventListener('click', add);
        $(o.input).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        $(o.list).addEventListener('click', e => {
            const b = e.target.closest('[data-del]'); if (!b) return;
            const l = o.get(); l.splice(Number(b.dataset.del), 1); o.set(l); render(); changed(); renderCard();
            $(o.input).focus();
        });
        return render;
    }
    let formCoauthors = [], formEditCredits = [], formTags = [], formBadges = [];
    const nameLimit = (list, v) => list.join('').length + v.length > 1200 ? 'Os nomes passaram do limite.' : '';
    const renderCoauthors = chipField({
        input: 'f-coauthor', button: 'coauthor-add', list: 'coauthor-chips', noun: 'coautores', max: 10,
        get: () => formCoauthors.slice(), set: l => { formCoauthors = l; }, canon: v => canonName(v), meta: creditKind,
        check: (v, list) => util.sameName(v, field('author').value.trim() || 'Redação JB') ? v + ' já é o autor principal.' : nameLimit(list, v)
    });
    const renderEditCredits = chipField({
        input: 'f-editcredit', button: 'editcredit-add', list: 'editcredit-chips', noun: 'edição', max: 10,
        get: () => formEditCredits.slice(), set: l => { formEditCredits = l; }, canon: v => canonName(v), meta: creditKind,
        check: nameLimit
    });

    /* ---------- Tags (criadas na hora) e selos da matéria ---------- */
    const fillTagList = () => { $('tags-list').innerHTML = Tags.all().map(t => '<option value="' + esc(t.name) + '">').join(''); };
    const renderTags = chipField({
        input: 'f-tag', button: 'tag-add', list: 'tag-chips', noun: 'tags', max: 10,
        get: () => formTags.slice(), set: l => { formTags = l; }, text: s => { const t = Tags.get(s); return '#' + (t ? t.name : s); },
        canon: async v => {
            const found = Tags.find(v); if (found) return found.slug;
            if (!util.slugify(v)) { note('Use letras ou números no nome da tag.', 'warning'); return ''; }
            if (!confirm('A tag “' + v + '” ainda não existe. Criar agora?')) return '';
            const r = await Tags.save({ name: v });
            if (!r.ok) { note(r.error, 'danger'); return ''; }
            fillTagList();
            if (!r.existed) note('Tag “' + r.tag.name + '” criada.', 'info');
            return r.tag.slug;
        }
    });
    function renderBadgePicks() {
        // Selos liberados para matérias + os já marcados (mesmo se a coordenação desativou depois)
        const list = Badges.forNews().concat(formBadges.filter(s => !Badges.forNews().some(b => b.slug === s) && JB.BADGES[s]).map(s => JB.BADGES[s]));
        $('badge-picks').innerHTML = list.length ? list.map(b => '<label class="form-check badge-pick"><input class="form-check-input" type="checkbox" data-badge value="' + esc(b.slug) + '"' + (formBadges.includes(b.slug) ? ' checked' : '') + '> ' +
            util.badgeSpan(b) + (b.desc ? ' <small class="text-muted">' + esc(b.desc) + '</small>' : '') + (b.forNews && b.active ? '' : ' <small class="text-danger">(não disponível: sai ao salvar)</small>') + '</label>').join('')
            : '<p class="small text-muted mb-0">Nenhum selo liberado para matérias.</p>';
    }
    $('badge-picks').addEventListener('change', e => {
        const c = e.target.closest('[data-badge]'); if (!c) return;
        formBadges = formBadges.filter(s => s !== c.value);
        if (c.checked) {
            if (formBadges.length >= 3) { c.checked = false; note('No máximo 3 selos por matéria.', 'warning'); return; }
            formBadges.push(c.value);
        }
        changed(); renderCard();
    });

    /* ---------- Colaboradores de edição (jornalistas que também editam a matéria) ---------- */
    let formEditors = [], staffReady = false;
    function renderCollab() {
        const box = $('collab-list'), n = currentId ? News.get(currentId) : null;
        const creator = n ? n.created_by : me.id, can = Auth.canManageEditors(n);
        if (!staffReady) { box.innerHTML = util.loadingHTML('Carregando a equipe…'); return; }
        const people = Members.staff().filter(p => p.role === 'jornalista' && p.id !== creator);
        // quem saiu da equipe continua na lista enquanto estiver marcado (para poder desmarcar)
        formEditors.filter(id => !people.some(p => p.id === id)).forEach(id => people.push({ id, name: 'Conta fora da equipe', role: 'leitor' }));
        if (!can) {
            const names = people.filter(p => formEditors.includes(p.id)).map(p => esc(p.name));
            box.innerHTML = '<p class="small mb-0">' + (names.length ? 'Podem editar: ' + names.join(', ') + '.' : 'Nenhum colaborador.') + ' Só quem criou a matéria ou um coordenador muda esta lista.</p>';
            return;
        }
        box.innerHTML = people.length ? people.map(p => '<label class="form-check small"><input class="form-check-input" type="checkbox" data-collab value="' + esc(p.id) + '"' + (formEditors.includes(p.id) ? ' checked' : '') + '> ' +
            esc(p.name) + ' ' + util.sealHTML(p.role) + '</label>').join('') : '<p class="small text-muted mb-0">Nenhum outro jornalista na equipe.</p>';
    }
    $('collab-list').addEventListener('change', e => {
        const c = e.target.closest('[data-collab]'); if (!c) return;
        formEditors = formEditors.filter(id => id !== c.value);
        if (c.checked) {
            if (formEditors.length >= 10) { c.checked = false; note('No máximo 10 colaboradores.', 'warning'); return; }
            formEditors.push(c.value);
        }
        changed();
    });

    /* ---------- Preenchimento ---------- */
    const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    let editingDate = null;
    function afterFill() {
        syncKind(); paintAuthorKind(); renderChartPreview(); renderVideo(); renderStats(); counts();
        grow(field('title')); grow(field('subtitle'));
        renderCard();
    }
    function fillNew() {
        form.reset();
        field('newsId').value = ''; currentId = ''; editingDate = null;
        field('status').value = defaultStatus;
        field('division').value = defaultDivision; syncDivision();
        field('chartType').value = 'bar';
        if (!editor) field('author').value = me.name;   // jornalista assina com o próprio nome (pode trocar)
        formCoauthors = []; formEditors = []; renderCoauthors(); renderCollab();
        formEditCredits = []; formTags = []; formBadges = []; renderEditCredits(); renderTags(); renderBadgePicks();
        formUpdates = []; formCorrections = []; renderUpdates(); renderCorrections();
        setBody([]); setImage('');
        const newLabel = field('division').value === 'educa' ? 'Novo material do JB Educa' : 'Nova matéria';
        $('form-title').textContent = newLabel; document.title = newLabel + ' — Jornal Brasileiro (JB)';
        $('preview-link').hidden = true;
        $('chart-box').open = false; $('extras').open = false;
        afterFill();
    }
    function fillNews(n) {
        form.reset();
        currentId = n.id; field('newsId').value = n.id;
        field('division').value = util.divisionOf(n); syncDivision();
        field('title').value = n.title; field('subtitle').value = n.subtitle; field('category').value = n.category; field('author').value = n.author;
        field('status').value = n.status || 'publicada'; field('kind').value = n.kind || 'noticia'; field('verdict').value = n.verdict || ''; field('live').checked = !!n.live;
        field('pubdate').value = toLocalInput(n.date); editingDate = n.date;
        field('featured').checked = !!n.featured;
        field('video').value = n.video ? (/^channel:/.test(n.video) ? 'https://www.youtube.com/channel/' + n.video.slice(8) + '/live' : 'https://youtu.be/' + n.video) : '';
        field('sources').value = formatLines(n.sources, 'label', 'url'); field('timeline').value = formatLines(n.timeline, 'when', 'text'); field('people').value = formatLines(n.people, 'name', 'role');
        const c = n.chart || {};
        field('chartType').value = CHART_TYPES[c.type] ? c.type : 'bar';
        field('chartTitle').value = c.title || ''; field('chartUnit').value = c.unit || ''; field('chartSource').value = c.source || '';
        // decimal com vírgula: "1.234" voltaria como mil duzentos e trinta e quatro
        field('chartItems').value = (c.items || []).map(i => i.label + ' | ' + String(i.value).replace('.', ',')).join('\n');
        $('chart-box').open = !!n.chart;
        $('extras').open = !!((n.sources || []).length || (n.timeline || []).length || (n.people || []).length);
        formUpdates = (n.updates || []).slice(); formCorrections = (n.corrections || []).slice(); renderUpdates(); renderCorrections();
        formCoauthors = (n.coauthors || []).slice(); formEditors = (n.editors || []).slice(); renderCoauthors(); renderCollab();
        formEditCredits = (n.edit_credits || []).slice(); formTags = (n.tags || []).slice(); formBadges = (n.badges || []).slice();
        renderEditCredits(); renderTags(); renderBadgePicks();
        setBody(n.body); setImage(n.image || '');
        $('form-title').textContent = 'Editar matéria'; document.title = 'Editar: ' + n.title + ' — Jornal Brasileiro (JB)';
        $('preview-link').href = util.articleUrl(n); $('preview-link').hidden = false;
        afterFill();
    }

    /* ---------- Salvar ---------- */
    function validate() {
        let first = null;
        const bad = (el, errId) => { if (errId) $(errId).hidden = false; if (!first) first = el; };
        if (!field('title').value.trim()) bad(field('title'), 'title-error');
        if (!field('subtitle').value.trim()) bad(field('subtitle'), 'sub-error');
        if (!readBody().length) { rte.classList.add('is-invalid'); bad(rte, 'body-error'); }
        if (field('kind').value === 'checagem' && !field('verdict').value) { field('verdict').classList.add('is-invalid'); bad(field('verdict')); }
        else field('verdict').classList.remove('is-invalid');
        const v = field('video').value.trim();
        if (v && !util.parseVideo(v)) bad(field('video'));
        if (first) { first.focus(); note('Confira os campos destacados antes de salvar.', 'danger'); return false; }
        const chartIssue = chartProblem(chartState());
        if (chartIssue) { $('chart-box').open = true; renderChartPreview(); note(chartIssue, 'danger'); field('chartItems').focus(); return false; }
        return true;
    }
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (uploading || saveBtn.disabled) return;
        if (!validate()) return;
        const current = currentId ? News.get(currentId) : null;
        if (current && !Auth.canEditNews(current)) { note('Você não pode editar esta matéria (só as suas e as em que é colaborador, até “Aprovada”).', 'danger'); return; }
        if (!divisions.includes(field('division').value)) { note('Seu cargo não permite publicar nessa divisão.', 'danger'); return; }
        if (!allowedStatuses.includes(field('status').value)) { note('Seu cargo não permite esse status. Jornalistas levam a matéria até “Aprovada”; quem publica é um coordenador.', 'danger'); return; }
        const kind = field('kind').value, pub = field('pubdate').value, correction = field('correction').value.trim();
        if (correction) formCorrections.push({ date: nowIso(), text: correction });
        const item = {
            id: currentId || undefined, title: field('title').value.trim(), subtitle: field('subtitle').value.trim(), category: field('category').value,
            image: field('image').value, status: field('status').value, author: field('author').value.trim() || 'Redação JB', featured: field('featured').checked,
            body: readBody(), video: util.parseVideo(field('video').value),
            kind, verdict: kind === 'checagem' ? (field('verdict').value || null) : null, live: kind === 'aovivo' && field('live').checked,
            sources: readSources(), timeline: parseLines(field('timeline').value, 'when', 'text'), people: parseLines(field('people').value, 'name', 'role'),
            chart: chartState().chart, updates: kind === 'aovivo' ? formUpdates.slice() : [], corrections: formCorrections.slice(),
            coauthors: formCoauthors.filter(c => !util.sameName(c, field('author').value.trim() || 'Redação JB')),
            edit_credits: formEditCredits.slice(), tags: formTags.slice(), badges: formBadges.slice(),
            division: divisions.includes(field('division').value) ? field('division').value : defaultDivision
        };
        // Colaboradores: só quem criou a matéria ou coordenador/admin (o banco ignora os outros)
        if (Auth.canManageEditors(current)) item.editors = formEditors.slice();
        // Data de publicação: a escolhida (agendamento) ou agora. Editando sem mexer no campo, mantém a data.
        if (pub) {
            const chosen = new Date(pub).toISOString();
            if (!item.id || toLocalInput(editingDate) !== pub) item.date = chosen;
        } else if (!item.id || item.status === 'publicada') item.date = nowIso();
        if (!editor) delete item.featured;   // manchete é decisão de quem publica
        else if (item.featured) News.everything().filter(n => n.featured && n.id !== item.id).forEach(n => News.save({ id: n.id, featured: false }));   // apenas uma manchete
        const editing = !!item.id, oldKey = draftKey();
        saveBtn.disabled = true; paintDirty('Salvando…');
        News.save(item);
        const ok = await JB.flush();
        saveBtn.disabled = false;
        if (!ok) {
            if (correction) formCorrections.pop();
            paintDirty();
            note(JB.mode === 'local' ? 'Atenção: o armazenamento do navegador está cheio; a matéria não foi salva. Use uma imagem menor ou da galeria.' : 'A matéria não foi salva. Verifique a conexão e tente de novo (o texto continua aqui e guardado neste navegador).', 'danger');
            return;
        }
        Drafts.clear(oldKey);
        const saved = News.get(item.id) || item;
        if (!editing) history.replaceState(null, '', 'editor.html?id=' + encodeURIComponent(saved.id));
        fillNews(saved); markClean(); paintDirty('Salvo às ' + hhmm());
        note((editing ? 'Matéria atualizada' : 'Matéria criada') + ' — ' + (util.isScheduled(saved) ? 'agendada para ' + util.fmtDate(saved.date) : 'status: ' + STATUS[saved.status || item.status]) + '.' +
            (!editor && item.status === 'aprovada' ? ' Um coordenador vai revisar e publicar.' : ''));
    });
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's' && !form.hidden) { e.preventDefault(); form.requestSubmit(); }
    });
    $('new-news').addEventListener('click', () => {
        if (isDirty() && !confirm('Há alterações não salvas. Começar uma matéria nova mesmo assim? (Uma cópia fica guardada neste navegador.)')) return;
        if (isDirty()) Drafts.set(draftKey(), formState());
        history.replaceState(null, '', 'editor.html');
        fillNew(); markClean(); offerDraft();
        field('title').focus();
    });
    // Gravação recusada pelo servidor: o cache já foi desfeito
    document.addEventListener('jb:sync-error', () => paintDirty());

    window.addEventListener('resize', () => { grow(field('title')); grow(field('subtitle')); });

    // Cargo trocado (ou conta removida da equipe) com o editor aberto: confere ao voltar para a aba
    // e a cada minuto. Perdeu o acesso: recarrega (o texto fica guardado neste navegador).
    const recheck = async () => {
        if (document.hidden) return;
        await Auth.refresh();
        if (Auth.isStaff()) return;
        if (ready && isDirty()) Drafts.set(draftKey(), formState());
        ready = false;   // sem o aviso de "sair da página"
        location.reload();
    };
    window.addEventListener('focus', recheck);
    setInterval(recheck, 60000);

    /* ---------- Carga ---------- */
    JB.ready.then(() => {
        $('ed-loading').hidden = true;
        if (JB.loadError) { $('ed-error').innerHTML = util.errorHTML(); return; }
        fillCreditNames(); fillTagList();
        if (currentId) {
            const n = News.get(currentId);
            if (!n) { $('ed-error').innerHTML = '<div class="alert alert-warning">Matéria não encontrada. <a href="admin.html">Voltar ao painel</a> ou <a href="editor.html">criar uma nova</a>.</div>'; return; }
            if (!Auth.canEditNews(n)) {
                $('ed-error').innerHTML = '<div class="alert alert-warning">Você não pode editar esta matéria' + (Auth.role() === 'jornalista' ? ' (jornalistas editam só as próprias e as em que são colaboradores, até “Aprovada”)' : professor ? ' (professores editam só os próprios materiais do JB Educa, até “Aprovada”)' : '') +
                    '. <a href="' + esc(util.articleUrl(n)) + '">Ler a matéria</a> · <a href="admin.html">Voltar ao painel</a></div>';
                return;
            }
            fillNews(n);
        } else fillNew();
        form.hidden = false;
        ready = true;
        markClean(); offerDraft();
        Members.loadStaff().then(() => { staffReady = true; renderCollab(); fillCreditNames(); renderCoauthors(); renderEditCredits(); paintAuthorKind(); });
        grow(field('title')); grow(field('subtitle'));
        if (!currentId) field('title').focus();
    });
});
