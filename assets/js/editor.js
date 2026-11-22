/* Editor de matérias: pages/editor.html (nova matéria) e editor.html?id=<id> (edição).
   Página inteira para escrever: título e resumo grandes, texto com formatação (negrito, itálico,
   links, intertítulos, citações e listas), mídia (imagem e vídeo do YouTube), gráfico, fontes,
   cronologia, correções e atualizações ao vivo, com prévia do card e rascunho automático no navegador.
   O texto é guardado como lista de blocos (util.blockOf/bodyHTML em storage.js): o banco continua
   recebendo uma lista de strings, sem HTML. Quem impede um jornalista de publicar ou de editar a
   matéria de outro é o banco (RLS); esconder opções aqui é só interface. */
JB.authReady.then(function () {
    'use strict';
    const { News, Authors, Auth, Drafts, CATEGORIES, KINDS, VERDICTS, IMAGES, STATUS, CHART_TYPES, util } = JB;
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
    $('status-help').textContent = editor ? 'Você pode publicar, agendar e arquivar.' : 'Jornalistas levam a matéria até “Aprovada”; quem publica é um coordenador.';
    $('feat-wrap').hidden = !editor;
    field('category').innerHTML = opts(CATEGORIES, c => c.label);
    field('kind').innerHTML = opts(KINDS);
    field('verdict').innerHTML += opts(VERDICTS, v => v.label);
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
    const URL_ESC = { '(': '%28', ')': '%29', ' ': '%20', '*': '%2A' };
    const wrapWith = (s, mark) => { const x = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return x[2] ? x[1] + mark + x[2] + mark + x[3] : s; };
    const wrapLink = (s, href) => { const x = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return x[2] && !/\n/.test(x[2]) ? x[1] + '[' + x[2] + '](' + href.replace(/[()\s*]/g, c => URL_ESC[c] || '') + ')' + x[3] : s; };
    // Conteúdo em linha de uma lista de nós → texto com marcação
    function inlineOf(nodes, st) {
        st = st || { b: false, i: false };
        let out = '';
        Array.prototype.forEach.call(nodes, c => {
            if (c.nodeType === 3) { out += escInline(c.nodeValue.replace(/[\s\u00A0]+/g, ' ')); return; }
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
    const domToBlocks = root => { const out = []; walk(root, out); return out; };
    const readBody = () => domToBlocks(rte);
    function setBody(blocks) {
        rte.innerHTML = blocks && blocks.length ? util.bodyHTML(blocks) : '<p><br></p>';
        paintEmpty();
    }
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
        undo: () => exec('undo'), redo: () => exec('redo')
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
            video: util.parseVideo(field('video').value), image: field('image').value, author: field('author').value.trim() || 'Redação JB',
            date: field('pubdate').value ? new Date(field('pubdate').value).toISOString() : nowIso(), body: []
        });
        $('card-preview').innerHTML = util.newsCard(fake);
    }

    /* ---------- Estado do formulário, alterações e rascunho no navegador ---------- */
    const STATE_FIELDS = ['title', 'subtitle', 'kind', 'category', 'verdict', 'author', 'status', 'pubdate', 'image', 'video', 'sources', 'timeline', 'people', 'chartType', 'chartTitle', 'chartUnit', 'chartSource', 'chartItems', 'correction'];
    function formState() {
        const s = {};
        STATE_FIELDS.forEach(k => { s[k] = field(k).value; });
        s.live = field('live').checked; s.featured = field('featured').checked;
        s.body = readBody();
        return s;
    }
    function applyState(s) {
        STATE_FIELDS.forEach(k => { if (k in s && field(k)) field(k).value = s[k]; });
        field('live').checked = !!s.live; field('featured').checked = !!s.featured;
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

    /* ---------- Preenchimento ---------- */
    const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    let editingDate = null;
    function afterFill() {
        syncKind(); renderChartPreview(); renderVideo(); renderStats(); counts();
        grow(field('title')); grow(field('subtitle'));
        renderCard();
    }
    function fillNew() {
        form.reset();
        field('newsId').value = ''; currentId = ''; editingDate = null;
        field('status').value = defaultStatus;
        field('chartType').value = 'bar';
        if (!editor) field('author').value = me.name;   // jornalista assina com o próprio nome (pode trocar)
        formUpdates = []; formCorrections = []; renderUpdates(); renderCorrections();
        setBody([]); setImage('');
        $('form-title').textContent = 'Nova matéria'; document.title = 'Nova matéria — Jornal Brasileiro (JB)';
        $('preview-link').hidden = true;
        $('chart-box').open = false; $('extras').open = false;
        afterFill();
    }
    function fillNews(n) {
        form.reset();
        currentId = n.id; field('newsId').value = n.id;
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
        if (current && !Auth.canEditNews(current)) { note('Você não pode editar esta matéria (só as suas, até “Aprovada”).', 'danger'); return; }
        if (!allowedStatuses.includes(field('status').value)) { note('Seu cargo não permite esse status. Jornalistas levam a matéria até “Aprovada”; quem publica é um coordenador.', 'danger'); return; }
        const kind = field('kind').value, pub = field('pubdate').value, correction = field('correction').value.trim();
        if (correction) formCorrections.push({ date: nowIso(), text: correction });
        const item = {
            id: currentId || undefined, title: field('title').value.trim(), subtitle: field('subtitle').value.trim(), category: field('category').value,
            image: field('image').value, status: field('status').value, author: field('author').value.trim() || 'Redação JB', featured: field('featured').checked,
            body: readBody(), video: util.parseVideo(field('video').value),
            kind, verdict: kind === 'checagem' ? (field('verdict').value || null) : null, live: kind === 'aovivo' && field('live').checked,
            sources: readSources(), timeline: parseLines(field('timeline').value, 'when', 'text'), people: parseLines(field('people').value, 'name', 'role'),
            chart: chartState().chart, updates: kind === 'aovivo' ? formUpdates.slice() : [], corrections: formCorrections.slice()
        };
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

    /* ---------- Carga ---------- */
    JB.ready.then(() => {
        $('ed-loading').hidden = true;
        if (JB.loadError) { $('ed-error').innerHTML = util.errorHTML(); return; }
        $('authors-list').innerHTML = Authors.all().map(a => '<option value="' + esc(a.name) + '">').join('');
        if (currentId) {
            const n = News.get(currentId);
            if (!n) { $('ed-error').innerHTML = '<div class="alert alert-warning">Matéria não encontrada. <a href="admin.html">Voltar ao painel</a> ou <a href="editor.html">criar uma nova</a>.</div>'; return; }
            if (!Auth.canEditNews(n)) {
                $('ed-error').innerHTML = '<div class="alert alert-warning">Você não pode editar esta matéria' + (Auth.role() === 'jornalista' ? ' (jornalistas editam só as próprias, até “Aprovada”)' : '') +
                    '. <a href="' + esc(util.articleUrl(n)) + '">Ler a matéria</a> · <a href="admin.html">Voltar ao painel</a></div>';
                return;
            }
            fillNews(n);
        } else fillNew();
        form.hidden = false;
        ready = true;
        markClean(); offerDraft();
        grow(field('title')); grow(field('subtitle'));
        if (!currentId) field('title').focus();
    });
});
