/* =========================================================
   JB — Camada de dados. Expõe o objeto global `JB`; todas as páginas carregam este arquivo.

   Com assets/js/config.js preenchido (situação normal do portal), supabase-backend.js,
   carregado em seguida, substitui News/Auth/Reports/Comments/... pelo Supabase e este
   arquivo só fornece utilitários e as preferências do navegador:
     jb_theme (tema), jb_cookies (consentimento), jb_history (histórico de leitura)
     e jb_favs (favoritos de quem não tem conta).

   Sem config.js preenchido, funciona como MODO DE DEMONSTRAÇÃO LOCAL (offline, abre por
   file://): tudo fica no localStorage deste navegador, com login apenas simulado.
   ========================================================= */
(function () {
    'use strict';

    const KEYS = { news: 'jb_news', users: 'jb_users', session: 'jb_session', reports: 'jb_reports', cookies: 'jb_cookies', views: 'jb_views', favs: 'jb_favs', history: 'jb_history', comments: 'jb_comments', newsletter: 'jb_newsletter', theme: 'jb_theme', authors: 'jb_authors', versions: 'jb_versions', a11y: 'jb_a11y', seed: 'jb_seed', roleLog: 'jb_role_log', drafts: 'jb_drafts', site: 'jb_site', tags: 'jb_tags', badges: 'jb_badges', follows: 'jb_follows', notifs: 'jb_notifs', visits: 'jb_visits', visitDay: 'jb_visit_day', place: 'jb_place', ext: 'jb_ext' };

    // Fallback em memória caso o localStorage esteja bloqueado
    const memory = {};
    let storageOk = true;
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return k in memory ? memory[k] : null; } },
        set(k, v) { try { localStorage.setItem(k, v); storageOk = true; } catch (e) { storageOk = false; memory[k] = v; } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { delete memory[k]; } }
    };
    const read = (k, fallback) => { const raw = store.get(k); if (raw === null) return fallback; try { return JSON.parse(raw); } catch (e) { return fallback; } };
    const write = (k, v) => store.set(k, JSON.stringify(v));
    // Modo remoto: config.js preenchido (sem "COLE_AQUI"). Não depende de o supabase-js ter
    // carregado: se ele faltar, o site mostra erro de conexão em vez de cair em dados locais falsos.
    const cfg = window.JB_CONFIG || {};
    const remote = /^https:\/\//.test(cfg.SUPABASE_URL || '') && !!cfg.SUPABASE_ANON_KEY && !/COLE_AQUI/.test(String(cfg.SUPABASE_URL) + String(cfg.SUPABASE_ANON_KEY));
    // Política de senha: a mesma configurada no Supabase Auth (Authentication > Sign In / Providers >
    // Email): mínimo de 8 caracteres com minúscula, maiúscula, número e símbolo. Quem impõe é o Supabase.
    const PASSWORD_MIN = 8;
    const PASSWORD_RULES = [
        [p => p.length >= PASSWORD_MIN, 'ao menos ' + PASSWORD_MIN + ' caracteres'],
        [p => /[a-z]/.test(p), 'uma letra minúscula'],
        [p => /[A-Z]/.test(p), 'uma letra maiúscula'],
        [p => /[0-9]/.test(p), 'um número'],
        [p => /[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/`~]/.test(p), 'um símbolo (! @ # $ % & * …)']
    ];
    // Regras que a senha ainda não cumpre (lista vazia = senha aceita)
    const passwordIssues = p => PASSWORD_RULES.filter(r => !r[0](String(p || ''))).map(r => r[1]);
    // Idade mínima para ter conta (o banco confere de novo: supabase/08_seguranca.sql, min_age())
    const MIN_AGE = 16;
    // Idade completa em anos a partir de "AAAA-MM-DD" (NaN se a data for inválida ou futura)
    function ageFrom(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        if (!m) return NaN;
        const b = new Date(+m[1], +m[2] - 1, +m[3]), now = new Date();
        if (isNaN(b) || b.getMonth() !== +m[2] - 1 || b > now || +m[1] < 1900) return NaN;
        let age = now.getFullYear() - b.getFullYear();
        if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
        return age;
    }
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    const CATEGORIES = {
        politica: { label: 'Política', page: 'pages/politica.html', desc: 'Congresso, governo, eleições e transparência pública.' },
        economia: { label: 'Economia', page: 'pages/economia.html', desc: 'Mercado, inflação, empregos, contas públicas e empresas.' },
        esportes: { label: 'Esportes', page: 'pages/esportes.html', desc: 'Futebol, competições e a gestão do esporte.' },
        investigacao: { label: 'Investigação Especial', page: 'pages/investigacao.html', desc: 'Denúncias, apurações e reportagens especiais.' },
        tecnologia: { label: 'Tecnologia & Ciência', page: 'pages/noticias.html?cat=tecnologia', desc: 'Inteligência artificial, inovação, dados e ciência.' },
        infraestrutura: { label: 'Infraestrutura', page: 'pages/noticias.html?cat=infraestrutura', desc: 'Obras, transportes, energia e saneamento.' },
        brasil: { label: 'Brasil', page: 'pages/noticias.html?cat=brasil', desc: 'Acontecimentos nacionais e regionais.' },
        mundo: { label: 'Mundo', page: 'pages/noticias.html?cat=mundo', desc: 'Notícias internacionais.' },
        educacao: { label: 'Educação', page: 'pages/noticias.html?cat=educacao', desc: 'Escolas, universidades e políticas educacionais.' },
        saude: { label: 'Saúde', page: 'pages/noticias.html?cat=saude', desc: 'Saúde pública, pesquisas e serviços.' },
        meioambiente: { label: 'Meio Ambiente', page: 'pages/noticias.html?cat=meioambiente', desc: 'Clima, sustentabilidade e desastres naturais.' },
        cultura: { label: 'Cultura', page: 'pages/noticias.html?cat=cultura', desc: 'Cinema, música, entretenimento e eventos.' }
    };
    // Tipo de conteúdo: deixa claro ao leitor o que é notícia, reportagem, análise ou opinião.
    const KINDS = {
        noticia: 'Notícia', reportagem: 'Reportagem', analise: 'Análise', opiniao: 'Opinião', editorial: 'Editorial',
        entrevista: 'Entrevista', checagem: 'Verificação de fatos', aovivo: 'Ao vivo'
    };
    /* Divisões editoriais (tabela divisions no banco). Cada divisão tem as próprias editorias e
       tipos de conteúdo; as páginas e listas do jornal (News.all) mostram só a divisão "jb".
       Divisão nova = uma entrada aqui (editorias, tipos, página inicial e tema) + uma linha em
       public.divisions + as editorias dela na restrição news_category_check do banco. */
    const SUBJECTS = {
        matematica: { label: 'Matemática', page: 'pages/educa.html?materia=matematica', desc: 'Números, álgebra, geometria e equações, com exemplos resolvidos.' },
        portugues: { label: 'Português', page: 'pages/educa.html?materia=portugues', desc: 'Gramática, interpretação de texto e literatura.' },
        redacao: { label: 'Redação', page: 'pages/educa.html?materia=redacao', desc: 'Estrutura do texto dissertativo, argumentação e revisão.' },
        ciencias: { label: 'Ciências', page: 'pages/educa.html?materia=ciencias', desc: 'Física, química e biologia do dia a dia.' },
        historia: { label: 'História', page: 'pages/educa.html?materia=historia', desc: 'Brasil e mundo, das origens aos dias de hoje.' },
        geografia: { label: 'Geografia', page: 'pages/educa.html?materia=geografia', desc: 'Território, clima, população e economia.' },
        ingles: { label: 'Inglês', page: 'pages/educa.html?materia=ingles', desc: 'Vocabulário, gramática e leitura em inglês.' }
    };
    const EDUCA_KINDS = { aula: 'Aula', exercicios: 'Lista de exercícios' };
    const DIVISIONS = {
        jb: { name: 'Jornal Brasileiro', short: 'JB', home: 'index.html', categories: CATEGORIES, kinds: KINDS, defaultCategory: 'politica', defaultKind: 'noticia',
            tagline: 'Investigação & Fatos', desc: 'Notícias, reportagens, análises e checagens.' },
        educa: { name: 'JB Educa', short: 'Educa', home: 'pages/educa.html', categories: SUBJECTS, kinds: EDUCA_KINDS, defaultCategory: 'matematica', defaultKind: 'aula', theme: 'educa', themeColor: '#1B6B45',
            tagline: 'Aprender com o Jornal Brasileiro', desc: 'Aulas, explicações e exercícios para estudantes.' }
    };
    const ALL_CATEGORIES = Object.assign({}, CATEGORIES, SUBJECTS);
    const ALL_KINDS = Object.assign({}, KINDS, EDUCA_KINDS);
    const divisionOf = n => (n && DIVISIONS[n.division]) ? n.division : 'jb';
    // Classificações da verificação de fatos
    const VERDICTS = {
        verdadeiro: { label: 'Verdadeiro', desc: 'A informação é comprovada por dados e fontes confiáveis.' },
        impreciso: { label: 'Impreciso', desc: 'Parte da informação está correta, mas há números ou detalhes errados.' },
        fora_de_contexto: { label: 'Fora de contexto', desc: 'O conteúdo é real, mas foi usado para sugerir algo que não aconteceu.' },
        falso: { label: 'Falso', desc: 'A informação não se sustenta: os dados e as fontes a contradizem.' }
    };
    // Fluxo editorial: rascunho → em revisão → aprovada → publicada → arquivada
    const STATUS = { rascunho: 'Rascunho', revisao: 'Em revisão', aprovada: 'Aprovada', publicada: 'Publicada', arquivada: 'Arquivada' };
    const STATUS_FLOW = ['rascunho', 'revisao', 'aprovada', 'publicada', 'arquivada'];
    // Hierarquia da redação. Aqui é só interface: quem impõe as regras é o banco
    // (RLS + set_member_role em supabase/07_hierarquia.sql).
    //   admin       tudo (dado só pelo SQL Editor do Supabase)
    //   coordenador publica, arquiva, exclui; denúncias, comentários, autores; coloca/tira jornalistas
    //   jornalista  cria e edita só as próprias matérias, até "Aprovada"
    //   professor   igual ao jornalista, só no JB Educa (supabase/11_divisoes_tags_notificacoes.sql)
    //   leitor      conta comum
    const ROLES = { admin: 'Administrador', coordenador: 'Coordenador', jornalista: 'Jornalista', professor: 'Professor', leitor: 'Leitor' };
    const STAFF_ROLES = ['admin', 'coordenador', 'jornalista', 'professor'];
    const EDITOR_ROLES = ['admin', 'coordenador'];
    const JOURNALIST_STATUSES = ['rascunho', 'revisao', 'aprovada'];
    const roleRank = r => { const i = STAFF_ROLES.indexOf(r); return i < 0 ? 9 : i; };
    // Catálogo de selos (tabela badges): de perfil (dados por coordenador/admin com set_member_badges)
    // e/ou de matéria (escolhidos no editor). Gerido na página "Selos e tags" do painel. BADGES é o
    // mapa vivo slug -> selo: Badges.load() o atualiza no lugar (as páginas leem JB.BADGES[slug]).
    const BADGE_COLORS = { accent: 'Vermelho JB', blue: 'Azul', green: 'Verde', orange: 'Laranja', purple: 'Roxo', gray: 'Cinza' };
    const DEFAULT_BADGES = [
        { slug: 'colaborador', label: 'Colaborador', desc: 'Colabora com conteúdo, informações ou pautas para o JB.', color: 'accent', forProfiles: true, forNews: false, active: true, sort: 1 },
        { slug: 'apoiador', label: 'Apoiador Oficial', desc: 'Apoia oficialmente o projeto do Jornal Brasileiro.', color: 'accent', forProfiles: true, forNews: false, active: true, sort: 2 },
        { slug: 'ajudante', label: 'Ajudante do Jornal', desc: 'Ajuda a redação no dia a dia do jornal.', color: 'accent', forProfiles: true, forNews: false, active: true, sort: 3 },
        { slug: 'reporter', label: 'Repórter', desc: 'Repórter que contribui com o JB.', color: 'accent', forProfiles: true, forNews: false, active: true, sort: 4 },
        { slug: 'exclusivo', label: 'Exclusivo', desc: 'Informação apurada e publicada primeiro pelo JB.', color: 'accent', forProfiles: false, forNews: true, active: true, sort: 10 },
        { slug: 'especial', label: 'Especial', desc: 'Reportagem especial, com apuração aprofundada.', color: 'purple', forProfiles: false, forNews: true, active: true, sort: 11 },
        { slug: 'dados-abertos', label: 'Dados abertos', desc: 'Matéria construída a partir de dados públicos, com as fontes indicadas.', color: 'blue', forProfiles: false, forNews: true, active: true, sort: 12 }
    ];
    const BADGES = {};
    function setBadgeCatalog(list) {
        Object.keys(BADGES).forEach(k => delete BADGES[k]);
        (list || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.label).localeCompare(String(b.label), 'pt-BR')).forEach(b => {
            BADGES[b.slug] = { slug: b.slug, label: b.label, desc: b.desc || '', color: BADGE_COLORS[b.color] ? b.color : 'accent', forProfiles: !!b.forProfiles, forNews: !!b.forNews, active: b.active !== false, sort: b.sort || 0 };
        });
    }
    setBadgeCatalog(DEFAULT_BADGES);
    const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    // Nome -> slug ("Reforma Tributária" -> "reforma-tributaria")
    const slugify = (s, max) => String(s || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max || 60).replace(/-+$/, '');
    // Agendamento: "publicada" com data no futuro só aparece quando a data chega.
    const isScheduled = n => (!n.status || n.status === 'publicada') && !!n.date && new Date(n.date) > Date.now();
    const isPublished = n => (!n.status || n.status === 'publicada') && !isScheduled(n);   // dados antigos (sem status) contam como publicados
    // Campos novos com valor padrão (matérias antigas não têm)
    const EXTRA_ARRAYS = ['sources', 'corrections', 'updates', 'timeline', 'people', 'coauthors', 'editors', 'edit_credits', 'tags', 'badges'];
    function withDefaults(n) {
        if (!n) return n;
        if (!n.kind) n.kind = 'noticia';
        EXTRA_ARRAYS.forEach(k => { if (!Array.isArray(n[k])) n[k] = []; });
        if (!Array.isArray(n.body)) n.body = [];
        if (n.chart === undefined) n.chart = null;
        if (n.verdict === undefined) n.verdict = null;
        if (n.updated_at === undefined) n.updated_at = null;
        if (typeof n.video !== 'string') n.video = '';
        n.division = divisionOf(n);
        n.live = !!n.live;
        return n;
    }
    // Campos cuja mudança gera uma nova versão (mesma lista do gatilho news_track_changes no banco)
    const VERSIONED = ['title', 'subtitle', 'body', 'image', 'author', 'category', 'kind', 'verdict', 'sources', 'timeline', 'people', 'chart', 'video', 'coauthors', 'edit_credits'];
    const TOUCHES = VERSIONED.concat(['updates', 'corrections']);   // mudam a data de atualização

    // Imagens locais disponíveis (usadas no painel e como fallback por categoria)
    const IMAGES = {
        'assets/img/obras-publicas.jpg': 'Edifício público (obras)',
        'assets/img/redes-sociais.jpg': 'Ícones de redes sociais',
        'assets/img/ferrovia.webp': 'Locomotiva em ferrovia',
        'assets/img/seguranca-digital.jpg': 'Chave sobre código digital',
        'assets/img/cat-politica.svg': 'Ilustração — Política',
        'assets/img/cat-economia.svg': 'Ilustração — Economia',
        'assets/img/cat-esportes.svg': 'Ilustração — Esportes',
        'assets/img/cat-brasil.svg': 'Ilustração — Brasil',
        'assets/img/cat-mundo.svg': 'Ilustração — Mundo',
        'assets/img/cat-educacao.svg': 'Ilustração — Educação',
        'assets/img/cat-saude.svg': 'Ilustração — Saúde',
        'assets/img/cat-meioambiente.svg': 'Ilustração — Meio Ambiente',
        'assets/img/cat-cultura.svg': 'Ilustração — Cultura'
    };
    const FALLBACK_IMG = {
        politica: 'assets/img/cat-politica.svg', economia: 'assets/img/cat-economia.svg', esportes: 'assets/img/cat-esportes.svg',
        investigacao: 'assets/img/obras-publicas.jpg', tecnologia: 'assets/img/seguranca-digital.jpg', infraestrutura: 'assets/img/ferrovia.webp',
        brasil: 'assets/img/cat-brasil.svg', mundo: 'assets/img/cat-mundo.svg', educacao: 'assets/img/cat-educacao.svg', saude: 'assets/img/cat-saude.svg', meioambiente: 'assets/img/cat-meioambiente.svg', cultura: 'assets/img/cat-cultura.svg'
    };
    Object.keys(SUBJECTS).forEach(k => { FALLBACK_IMG[k] = 'assets/img/cat-educacao.svg'; });   // JB Educa

    // Hash simples SOMENTE para simulação (não é seguro para produção)
    function hash(text) {
        let h = 5381;
        for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
        return 'h' + h.toString(16);
    }

    /* ---------- Seed (executa só se as chaves ainda não existem) ---------- */
    function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

    /* Exemplos das seções editoriais (o mesmo conteúdo está em supabase/06_exemplos_secoes.sql) */
    const SEED_VERSION = 5;
    // official: perfil oficial da redação (selo do JB). Mesmo conteúdo de supabase/06_exemplos_secoes.sql.
    const SAMPLE_AUTHORS = [
        { name: 'Redação JB', role: 'Equipe de reportagem', bio: 'Equipe de reportagem geral do Jornal Brasileiro.', columnist: false, official: true },
        { name: 'Redação Investigativa JB', role: 'Núcleo de investigação', bio: 'Núcleo responsável pelas reportagens investigativas e pela análise de documentos públicos.', columnist: false, official: true },
        { name: 'Conselho Editorial JB', role: 'Editorial', bio: 'Assina os editoriais, que expressam a posição institucional do jornal.', columnist: false, official: true },
        { name: 'Núcleo de Verificação JB', role: 'Verificação de fatos', bio: 'Checa declarações públicas, conteúdos virais e dados oficiais, com metodologia publicada.', columnist: false, official: true },
        { name: 'Helena Prado', role: 'Colunista de Economia', bio: 'Personagem fictícia. Escreve às terças sobre juros, emprego e orçamento das famílias.', columnist: true, official: false },
        { name: 'Rafael Monteiro', role: 'Analista político', bio: 'Personagem fictício. Acompanha o Congresso e as negociações do governo.', columnist: true, official: false },
        { name: 'Carla Nunes', role: 'Repórter de Tecnologia & Ciência', bio: 'Personagem fictícia. Cobre dados abertos, inteligência artificial e governo digital.', columnist: false, official: true },
        { name: 'Equipe JB Educa', role: 'Professores do JB Educa', bio: 'Professores que preparam as aulas e as listas de exercícios do JB Educa.', columnist: false, official: true }
    ];
    const DOSSIE_EXTRAS = {
        kind: 'reportagem',
        body: [
            'Levantamento cruzou dados de portais de transparência e contratos emergenciais firmados nos últimos 24 meses.',
            'A reportagem analisou 233 contratos (números fictícios) e encontrou aditivos sucessivos, prazos de vistoria vencidos e relatórios de fiscalização sem assinatura técnica.',
            'Os órgãos citados foram procurados e terão suas respostas publicadas nesta página assim que enviadas. Esta é uma reportagem de demonstração do projeto acadêmico Jornal Brasileiro (JB); pessoas, órgãos e números são fictícios.'
        ],
        timeline: [
            { when: 'Março de 2025', text: 'Primeira denúncia anônima chega ao canal seguro do JB.' },
            { when: 'Junho de 2025', text: 'Equipe obtém, por pedidos de acesso à informação, os contratos emergenciais de 14 estados.' },
            { when: 'Setembro de 2025', text: 'Cruzamento de dados identifica aditivos acima de 25% do valor original.' },
            { when: 'Novembro de 2026', text: 'Publicação do dossiê e envio de perguntas aos órgãos citados.' }
        ],
        people: [
            { name: 'Secretaria Estadual de Obras (fictícia)', role: 'Contratante de 61 contratos analisados' },
            { name: 'Construtora Horizonte S.A. (fictícia)', role: 'Empresa com mais aditivos no período' },
            { name: 'Tribunal de Contas Regional (fictício)', role: 'Órgão de controle que acompanha o caso' }
        ],
        sources: [
            { label: 'Portal da Transparência do Governo Federal', url: 'https://portaldatransparencia.gov.br/' },
            { label: 'Lei de Acesso à Informação (Lei nº 12.527/2011)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm' },
            { label: 'Planilha de contratos analisados (documento ilustrativo)', url: '' }
        ],
        chart: { title: 'Contratos emergenciais analisados, por região', unit: 'contratos', source: 'Levantamento JB com dados fictícios', items: [{ label: 'Sudeste', value: 74 }, { label: 'Nordeste', value: 61 }, { label: 'Norte', value: 38 }, { label: 'Sul', value: 33 }, { label: 'Centro-Oeste', value: 27 }] }
    };
    function sectionSamples(n) {
        const NOTE = 'Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB).';
        return [
            n('politica', 'Votação da reforma administrativa no plenário', 'Acompanhe em tempo real a sessão que analisa o parecer final do relator.', 'assets/img/cat-politica.svg', 95,
                ['A Câmara analisa nesta tarde o parecer final da reforma administrativa. Esta página reúne as atualizações da sessão em ordem cronológica.', NOTE],
                { kind: 'aovivo', live: true, author: 'Redação JB', updates: [
                    { date: minutesAgo(90), author: 'Redação JB', text: 'Sessão aberta com 412 deputados registrados no painel.' },
                    { date: minutesAgo(70), author: 'Redação JB', text: 'Relator começa a leitura do parecer e anuncia três mudanças no texto.' },
                    { date: minutesAgo(45), author: 'Rafael Monteiro', text: 'Líderes da oposição pedem a retirada de pauta; pedido será votado primeiro.' },
                    { date: minutesAgo(20), author: 'Redação JB', text: 'Requerimento de retirada de pauta é rejeitado por 301 a 98.' },
                    { date: minutesAgo(6), author: 'Redação JB', text: 'Começa a discussão do mérito. A votação do texto-base deve ocorrer ainda hoje.' }
                ] }),
            n('politica', 'Transparência não é favor, é dever', 'A abertura dos contratos públicos precisa ser regra, e não resposta a escândalos.', 'assets/img/cat-politica.svg', 150,
                ['Toda vez que um contrato emergencial vem à tona por meio de uma denúncia, repete-se a promessa de mais transparência. O JB defende que a divulgação completa e em formato aberto seja obrigatória desde a assinatura.',
                    'Dados acessíveis permitem que cidadãos, imprensa e órgãos de controle acompanhem a execução das obras e identifiquem desvios a tempo de corrigi-los.',
                    'Este editorial expressa a posição institucional do jornal. ' + NOTE],
                { kind: 'editorial', author: 'Conselho Editorial JB' }),
            n('economia', 'Juros altos por mais tempo cobram a conta de quem tem menos', 'A cautela do Banco Central tem justificativa, mas o custo recai sobre o crédito das famílias.', 'assets/img/cat-economia.svg', 260,
                ['Manter a taxa básica elevada ajuda a conter a inflação de serviços, mas encarece o crédito justamente para quem já está endividado.',
                    'Política monetária não resolve tudo sozinha: renegociação de dívidas e educação financeira precisam andar junto.',
                    'Os artigos de opinião refletem a visão de seus autores, não necessariamente a do jornal. ' + NOTE],
                { kind: 'opiniao', author: 'Helena Prado' }),
            n('politica', 'O que muda com o novo marco de transparência pública', 'Análise: o texto aprovado na comissão amplia prazos de divulgação, mas deixa lacunas na fiscalização.', 'assets/img/cat-politica.svg', 330,
                ['O marco aprovado obriga órgãos federais a publicar contratos em até cinco dias úteis, contra os trinta dias atuais.',
                    'A principal lacuna está na ausência de sanções claras para quem descumprir os prazos, o que pode limitar o efeito prático da lei.',
                    'Análises interpretam fatos a partir de dados e contexto, assinadas por especialistas da redação. ' + NOTE],
                { kind: 'analise', author: 'Rafael Monteiro', sources: [{ label: 'Câmara dos Deputados — tramitação de proposições', url: 'https://www.camara.leg.br/' }] }),
            n('tecnologia', '“Dados abertos economizam dinheiro público”, diz pesquisadora', 'Entrevista exclusiva sobre como a tecnologia ajuda a fiscalizar contratos.', 'assets/img/seguranca-digital.jpg', 520,
                ['A pesquisadora fictícia Marina Albuquerque estuda controle social de gastos públicos há uma década. Ela conversou com o JB sobre dados abertos e fiscalização.',
                    'P: Por que dados abertos ajudam a economizar?',
                    'R: Porque permitem comparar preços entre contratos parecidos. Quando a sociedade consegue ver os valores, sobrepreços aparecem mais rápido.',
                    'P: Qual é o maior obstáculo hoje?',
                    'R: A falta de padrão. Cada órgão publica de um jeito, muitas vezes em PDF escaneado, o que impede a análise automática.',
                    'P: O que o cidadão comum pode fazer?',
                    'R: Consultar os portais de transparência, usar a Lei de Acesso à Informação e compartilhar o que encontrar com a imprensa e os órgãos de controle.',
                    NOTE],
                { kind: 'entrevista', author: 'Carla Nunes' }),
            n('economia', 'É falso que nova lei proíba pagamentos em dinheiro vivo', 'Mensagem viral afirma que o uso de cédulas será crime a partir do mês que vem. Nenhum projeto em tramitação prevê isso.', 'assets/img/cat-economia.svg', 610,
                ['O que circula: uma mensagem compartilhada em aplicativos afirma que “a partir do mês que vem, pagar em dinheiro vivo vai dar multa”.',
                    'O que verificamos: não há lei aprovada nem projeto em tramitação com essa previsão. O texto viral mistura regras antigas sobre registro de operações de alto valor com informações inventadas.',
                    'Conclusão: FALSO. ' + NOTE],
                { kind: 'checagem', verdict: 'falso', author: 'Núcleo de Verificação JB', sources: [{ label: 'Banco Central do Brasil — perguntas frequentes', url: 'https://www.bcb.gov.br/' }] }),
            n('infraestrutura', 'Post exagera número de obras paradas no país', 'Publicação fala em 14 mil obras paralisadas; o dado oficial (fictício) mais recente aponta 8,6 mil.', 'assets/img/ferrovia.webp', 700,
                ['O que circula: um post afirma que “14 mil obras estão paradas no país, recorde histórico”.',
                    'O que verificamos: o número citado soma obras concluídas e canceladas. Considerando apenas as paralisadas, o painel oficial (dados fictícios) indica 8,6 mil.',
                    'Conclusão: IMPRECISO. Há de fato milhares de obras paradas, mas o número está inflado. ' + NOTE],
                { kind: 'checagem', verdict: 'impreciso', author: 'Núcleo de Verificação JB', chart: { title: 'Obras paralisadas: o post e o dado oficial', unit: 'obras', source: 'Painel de obras (dados fictícios)', items: [{ label: 'Número citado no post', value: 14000 }, { label: 'Dado oficial', value: 8600 }] } }),
            n('meioambiente', 'Vídeo de enchente antiga circula como se fosse desta semana', 'As imagens são reais, mas foram gravadas em 2019, em outra cidade.', 'assets/img/cat-meioambiente.svg', 820,
                ['O que circula: vídeo de uma rua alagada compartilhado com a legenda “agora há pouco”.',
                    'O que verificamos: a busca reversa de imagens mostra o mesmo vídeo publicado em 2019, em outro município.',
                    'Conclusão: FORA DE CONTEXTO. ' + NOTE],
                { kind: 'checagem', verdict: 'fora_de_contexto', author: 'Núcleo de Verificação JB' }),
            n('educacao', 'Frequência escolar subiu em rede que testa novo painel', 'Secretaria afirma que a presença média cresceu 4 pontos percentuais. Os dados (fictícios) confirmam.', 'assets/img/cat-educacao.svg', 960,
                ['O que foi dito: em entrevista, a secretária de Educação afirmou que a frequência média subiu de 87% para 91% após a adoção do painel.',
                    'O que verificamos: os boletins mensais publicados pela rede (dados fictícios) mostram exatamente esses valores.',
                    'Conclusão: VERDADEIRO. ' + NOTE],
                { kind: 'checagem', verdict: 'verdadeiro', author: 'Núcleo de Verificação JB' }),
            n('esportes', 'Estádios públicos passam a divulgar custos de manutenção em painel aberto', 'Arenas administradas por governos estaduais terão gastos, receitas e contratos publicados todo mês.', 'assets/img/cat-esportes.svg', 400,
                ['Os estádios administrados por governos estaduais vão publicar mensalmente, em formato aberto, os custos de manutenção, as receitas com jogos e eventos e os contratos de operação.',
                    'A medida responde a pedidos de torcidas organizadas e de pesquisadores, que apontavam dificuldade para comparar o custo das arenas construídas com dinheiro público.',
                    'O primeiro relatório deve sair no fim do mês, com dados dos últimos doze meses. ' + NOTE])
        ];
    }

    /* Exemplos do JB Educa (o mesmo conteúdo está em supabase/06_exemplos_secoes.sql, parte 2) */
    function educaSamples(n) {
        const NOTE = 'Material de demonstração do JB Educa, no projeto acadêmico Jornal Brasileiro (JB).';
        return [
            n('matematica', 'Equação do 2º grau: como usar a fórmula de Bhaskara', 'Passo a passo para encontrar as raízes de qualquer equação do tipo ax² + bx + c = 0.', 'assets/img/cat-educacao.svg', 140,
                ['Uma equação do 2º grau tem a forma $$ax^2 + bx + c = 0$$, com $$a \\neq 0$$. Resolver a equação é encontrar os valores de $$x$$ que a tornam verdadeira: as **raízes**.',
                    '## 1. Calcule o discriminante',
                    '$$ \\Delta = b^2 - 4ac',
                    '- Se $$\\Delta > 0$$, há duas raízes reais diferentes.',
                    '- Se $$\\Delta = 0$$, há uma raiz real (dupla).',
                    '- Se $$\\Delta < 0$$, não há raiz real.',
                    '## 2. Aplique a fórmula',
                    '$$ x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}',
                    '## Exemplo resolvido',
                    'Resolva $$x^2 - 5x + 6 = 0$$. Aqui $$a = 1$$, $$b = -5$$ e $$c = 6$$.',
                    '$$ \\Delta = (-5)^2 - 4 \\cdot 1 \\cdot 6 = 25 - 24 = 1',
                    '$$ x = \\frac{5 \\pm 1}{2} \\Rightarrow x_1 = 3, \\quad x_2 = 2',
                    '> Confira sempre: substitua cada raiz na equação original. $$3^2 - 5 \\cdot 3 + 6 = 0$$ ✔',
                    NOTE],
                { division: 'educa', kind: 'aula', author: 'Equipe JB Educa', tags: ['equacao-do-2-grau', 'matematica-basica'] }),
            n('matematica', 'Lista de exercícios: equação do 2º grau', 'Seis exercícios com resposta para treinar o discriminante e a fórmula de Bhaskara.', 'assets/img/cat-educacao.svg', 135,
                ['Tente resolver antes de abrir a resposta. Use $$\\Delta = b^2 - 4ac$$ e $$x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$.',
                    '?? Calcule o discriminante de $$x^2 + 2x - 8 = 0$$.\n=> $$\\Delta = 2^2 - 4 \\cdot 1 \\cdot (-8) = 4 + 32 = 36$$',
                    '?? Encontre as raízes de $$x^2 + 2x - 8 = 0$$.\n=> $$x = \\frac{-2 \\pm 6}{2}$$, então $$x_1 = 2$$ e $$x_2 = -4$$.',
                    '?? Quantas raízes reais tem $$x^2 - 6x + 9 = 0$$?\n=> $$\\Delta = 36 - 36 = 0$$: uma raiz real dupla, $$x = 3$$.',
                    '?? Quantas raízes reais tem $$2x^2 + x + 5 = 0$$?\n=> $$\\Delta = 1 - 40 = -39 < 0$$: nenhuma raiz real.',
                    '?? Resolva $$2x^2 - 8 = 0$$.\n=> Equação incompleta: $$x^2 = 4$$, logo $$x = \\pm 2$$.',
                    '?? A área de um terreno retangular é 24 m² e um lado mede 2 m a mais que o outro. Quanto mede o lado menor?\n=> $$x(x + 2) = 24 \\Rightarrow x^2 + 2x - 24 = 0$$; $$\\Delta = 100$$; $$x = 4$$ (a raiz negativa não serve). O lado menor mede 4 m.',
                    NOTE],
                { division: 'educa', kind: 'exercicios', author: 'Equipe JB Educa', tags: ['equacao-do-2-grau'] }),
            n('portugues', 'Crase: quando usar o acento grave', 'Três perguntas rápidas que resolvem a maioria das dúvidas sobre a crase.', 'assets/img/cat-educacao.svg', 150,
                ['A crase é a junção da preposição **a** com o artigo **a** (ou com o "a" de aquele, aquela, aquilo). O acento grave marca essa junção.',
                    '## Truque da troca',
                    'Troque a palavra feminina por uma masculina. Se aparecer **ao**, há crase: "Vou **à** escola" → "Vou **ao** colégio".',
                    '## Quando não usar',
                    '- Antes de palavras masculinas: "andar a cavalo".',
                    '- Antes de verbos: "começou a chover".',
                    '- Entre palavras repetidas: "cara a cara".',
                    '?? Complete: "Entreguei o livro ___ professora."\n=> **à** (entreguei o livro **ao** professor).',
                    NOTE],
                { division: 'educa', kind: 'aula', author: 'Equipe JB Educa' })
        ];
    }
    const SAMPLE_TAGS = [
        { slug: 'transparencia', name: 'Transparência', description: 'Acesso a dados, contratos e gastos públicos.' },
        { slug: 'contas-publicas', name: 'Contas públicas', description: 'Orçamento, contratos e fiscalização do dinheiro público.' },
        { slug: 'reforma-administrativa', name: 'Reforma administrativa', description: 'A tramitação da reforma do serviço público.' },
        { slug: 'dados-abertos', name: 'Dados abertos', description: 'Informações públicas em formato aberto.' },
        { slug: 'equacao-do-2-grau', name: 'Equação do 2º grau', description: 'Discriminante, fórmula de Bhaskara e exercícios.' },
        { slug: 'matematica-basica', name: 'Matemática básica', description: '' }
    ];
    // Tags dos exemplos do jornal (pelo título)
    const SAMPLE_NEWS_TAGS = {
        'Votação da reforma administrativa no plenário': ['reforma-administrativa'],
        'Relator apresenta parecer final sobre reforma administrativa nesta quinta-feira': ['reforma-administrativa'],
        'Transparência não é favor, é dever': ['transparencia', 'contas-publicas'],
        'O que muda com o novo marco de transparência pública': ['transparencia'],
        'Comissão aprova novo marco regulatório para transparência pública': ['transparencia'],
        'Dossiê aponta gargalos na fiscalização de obras públicas em 14 estados': ['contas-publicas', 'transparencia'],
        '“Dados abertos economizam dinheiro público”, diz pesquisadora': ['dados-abertos', 'transparencia'],
        'Estádios públicos passam a divulgar custos de manutenção em painel aberto': ['dados-abertos', 'contas-publicas']
    };

    function seed() {
        if (store.get(KEYS.news) === null) {
            const n = (category, title, subtitle, image, minutes, body, extra) => Object.assign({
                id: uid() + category.slice(0, 2), category, title, subtitle, image, author: 'Redação JB', date: minutesAgo(minutes), featured: false,
                body: body || [subtitle, 'Esta é uma matéria de demonstração do projeto acadêmico Jornal Brasileiro (JB). O conteúdo é fictício e serve para exercitar as funcionalidades do portal.', 'Novas notícias podem ser criadas, editadas e excluídas no Painel Administrativo e aparecem automaticamente nas páginas correspondentes.']
            }, extra || {});
            write(KEYS.news, [
                n('investigacao', 'Dossiê aponta gargalos na fiscalização de obras públicas em 14 estados', 'Levantamento cruzou dados de portais de transparência e contratos emergenciais firmados nos últimos 24 meses.', 'assets/img/obras-publicas.jpg', 18, null, Object.assign({ featured: true, author: 'Redação Investigativa JB' }, DOSSIE_EXTRAS)),
                n('economia', 'Banco Central sinaliza cautela com juros diante de pressão inflacionária no setor de serviços', 'Analistas avaliam que a trajetória de queda da taxa básica pode ser mais lenta que o previsto.', 'assets/img/cat-economia.svg', 42),
                n('politica', 'Relator apresenta parecer final sobre reforma administrativa nesta quinta-feira', 'Texto deve ser votado em plenário na semana seguinte, segundo a liderança.', 'assets/img/cat-politica.svg', 60),
                n('esportes', 'Confederação divulga calendário ajustado para as fases finais do campeonato nacional', 'Mudança busca reduzir o intervalo entre jogos decisivos.', 'assets/img/cat-esportes.svg', 120),
                n('tecnologia', 'Novas diretrizes de proteção de dados exigem auditoria em algoritmos públicos', 'Especialistas explicam como a fiscalização vai afetar sistemas automatizados de atendimento ao cidadão.', 'assets/img/seguranca-digital.jpg', 180),
                n('infraestrutura', 'Malha ferroviária regional recebe novo plano de concessão para transporte de cargas', 'Projeto prevê integração entre polos agrícolas e terminais portuários do Sudeste.', 'assets/img/ferrovia.webp', 240),
                n('politica', 'Comissão aprova novo marco regulatório para transparência pública', 'Proposta amplia a divulgação de contratos e gastos de órgãos federais.', 'assets/img/cat-politica.svg', 300),
                n('economia', 'Mercado financeiro reage às novas projeções fiscais', 'Bolsa e câmbio oscilam após divulgação do relatório bimestral.', 'assets/img/cat-economia.svg', 360),
                n('investigacao', 'Exclusivo JB: documentos revelam falhas em contratos de infraestrutura', 'Análise de aditivos contratuais aponta reajustes acima da média de mercado.', 'assets/img/obras-publicas.jpg', 420),
                n('tecnologia', 'Plataformas digitais terão de ampliar transparência sobre moderação de conteúdo', 'Debate sobre regras para redes sociais avança entre especialistas e legisladores.', 'assets/img/redes-sociais.jpg', 500),
                n('esportes', 'Clubes discutem regras de equilíbrio financeiro para a próxima temporada', 'Proposta prevê limites de endividamento e relatórios públicos.', 'assets/img/cat-esportes.svg', 600),
                n('brasil', 'Estados ampliam cooperação para monitorar obras de grande porte', 'Consórcio regional pretende unificar dados de acompanhamento.', 'assets/img/cat-brasil.svg', 700),
                n('mundo', 'Cúpula internacional discute metas comuns de transparência fiscal', 'Países-membros avaliam padrões de divulgação de contas públicas.', 'assets/img/cat-mundo.svg', 800),
                n('educacao', 'Rede pública testa novo modelo de acompanhamento da frequência escolar', 'Painel reúne dados de presença para identificar risco de evasão.', 'assets/img/cat-educacao.svg', 900),
                n('saude', 'Municípios divulgam painel de tempo de espera em unidades básicas', 'Indicadores ajudam a planejar a distribuição de equipes.', 'assets/img/cat-saude.svg', 1000),
                n('meioambiente', 'Relatório aponta avanço de programas de recuperação de áreas degradadas', 'Dados fictícios de demonstração indicam aumento da área monitorada.', 'assets/img/cat-meioambiente.svg', 1100),
                n('cultura', 'Festival regional anuncia programação gratuita de cinema e música', 'Evento ocupará espaços públicos durante o fim de semana.', 'assets/img/cat-cultura.svg', 1200)
            ].concat(sectionSamples(n)));
            store.set(KEYS.seed, '4');   // o passo da versão 5 (Educa e tags) roda logo abaixo
        }
        // Demonstrações criadas antes do selo dos perfis da redação: autores de exemplo ganham o selo, uma vez.
        if (Number(store.get(KEYS.seed) || 1) < 4 && store.get(KEYS.authors) !== null) {
            const sample = SAMPLE_AUTHORS.reduce((o, a) => { o[a.name] = a.official; return o; }, {});
            write(KEYS.authors, read(KEYS.authors, []).map(a => 'official' in a ? a : Object.assign(a, { official: a.name in sample ? sample[a.name] : !a.columnist })));
        }
        // Demonstrações criadas antes das seções novas: acrescenta só os exemplos novos, uma vez.
        const mk = (category, title, subtitle, image, minutes, body, extra) => Object.assign({ id: uid() + category.slice(0, 2), category, title, subtitle, image, author: 'Redação JB', date: minutesAgo(minutes), featured: false, body }, extra || {});
        if (Number(store.get(KEYS.seed) || 1) < 4) {
            const list = read(KEYS.news, []);
            const titles = new Set(list.map(x => x.title));
            write(KEYS.news, list.concat(sectionSamples(mk).filter(x => !titles.has(x.title))));
            store.set(KEYS.seed, '4');
        }
        // Versão 5: exemplos do JB Educa e tags (uma vez, sem mexer no que a pessoa criou)
        if (Number(store.get(KEYS.seed) || 1) < SEED_VERSION) {
            if (store.get(KEYS.tags) === null) write(KEYS.tags, SAMPLE_TAGS.map(t => Object.assign({ created: new Date().toISOString() }, t)));
            const authors = read(KEYS.authors, null), educa = SAMPLE_AUTHORS[SAMPLE_AUTHORS.length - 1];
            if (authors && !authors.some(a => a.name === educa.name)) write(KEYS.authors, authors.concat([Object.assign({ id: uid(), avatar: '', created: new Date().toISOString() }, educa)]));
            const list = read(KEYS.news, []).map(x => SAMPLE_NEWS_TAGS[x.title] && !(x.tags || []).length ? Object.assign(x, { tags: SAMPLE_NEWS_TAGS[x.title].slice() }) : x);
            const titles = new Set(list.map(x => x.title));
            write(KEYS.news, list.concat(educaSamples(mk).filter(x => !titles.has(x.title))));
            store.set(KEYS.seed, String(SEED_VERSION));
        }
        if (store.get(KEYS.authors) === null) write(KEYS.authors, SAMPLE_AUTHORS.map(a => Object.assign({ id: uid(), avatar: '', created: new Date().toISOString() }, a)));
        if (store.get(KEYS.users) === null) {
            // Conta de editor para demonstração (simulada)
            write(KEYS.users, [{ id: 'admin', name: 'Editor JB', email: 'admin@jb.com.br', pass: hash('admin@jb.com.briadmin123'), role: 'admin', bio: '', city: '', interests: [], created: new Date().toISOString() }]);
        }
        if (store.get(KEYS.reports) === null) write(KEYS.reports, []);
    }

    /* ---------- Notícias ---------- */
    const sameValue = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
    // Mesma regra do gatilho do banco: devolve 'version' (conteúdo mudou), 'touch' (só ao vivo/correções) ou ''.
    function changeKind(before, patch) {
        if (VERSIONED.some(k => k in patch && !sameValue(before[k], patch[k]))) return 'version';
        if (TOUCHES.some(k => k in patch && !sameValue(before[k], patch[k]))) return 'touch';
        return '';
    }
    const snapshotOf = n => VERSIONED.reduce((o, k) => { o[k] = n[k] === undefined ? null : n[k]; return o; }, {});

    // Mesma limpeza do gatilho news_clean_labels: só tags que existem e selos de matéria ativos, sem repetir
    function cleanLabels(item) {
        if ('tags' in item) item.tags = [...new Set((item.tags || []).filter(t => Tags.get(t)))].slice(0, 10);
        if ('badges' in item) item.badges = [...new Set((item.badges || []).filter(b => BADGES[b] && BADGES[b].forNews && BADGES[b].active))].slice(0, 3);
        if ('edit_credits' in item) item.edit_credits = [...new Set((item.edit_credits || []).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 10);
        return item;
    }
    const News = {
        everything() { return read(KEYS.news, []).map(withDefaults).sort((a, b) => new Date(b.date) - new Date(a.date)); },   // painel: todos os status
        published() { return News.everything().filter(isPublished); },                                                // todas as divisões
        all() { return News.published().filter(n => n.division === 'jb'); },                                         // o jornal (leitores: só publicadas)
        byDivision(d) { return News.published().filter(n => n.division === d); },
        get(id) { return withDefaults(read(KEYS.news, []).find(x => x.id === id) || null); },
        save(item) {
            const list = read(KEYS.news, []);
            const i = list.findIndex(x => x.id === item.id);
            cleanLabels(item);
            // Colaboradores de edição: só quem criou ou coordenador/admin mudam (gatilho news_set_editors)
            if ('editors' in item) {
                const old = i >= 0 ? list[i] : null, me = Auth.current();
                if (old && !Auth.isEditor() && (!me || old.created_by !== me.id)) item.editors = (old.editors || []).slice();
                const creator = old ? old.created_by : me && me.id;
                item.editors = [...new Set((item.editors || []).filter(e => e && e !== creator))].slice(0, 10);
            }
            if (i >= 0) {
                const before = withDefaults(JSON.parse(JSON.stringify(list[i])));
                const change = changeKind(before, item);
                if (change === 'version') {   // guarda a versão anterior (20 últimas)
                    const all = read(KEYS.versions, {}), me = Auth.current();
                    all[item.id] = [{ id: uid(), replacedAt: new Date().toISOString(), replacedBy: me ? me.name : '', snapshot: snapshotOf(list[i]) }].concat(all[item.id] || []).slice(0, 20);
                    write(KEYS.versions, all);
                }
                if (change) item.updated_at = new Date().toISOString();
                list[i] = Object.assign(list[i], item);
                notifyFollowers(before, withDefaults(Object.assign({}, list[i])));
            } else {
                const me = Auth.current();
                item.id = uid(); item.date = item.date || new Date().toISOString(); item.updated_at = null; item.created_by = me ? me.id : null;
                list.push(item);
            }
            write(KEYS.news, list);
            return item;
        },
        remove(id) {
            write(KEYS.news, read(KEYS.news, []).filter(x => x.id !== id));
            const v = read(KEYS.versions, {}); if (v[id]) { delete v[id]; write(KEYS.versions, v); }
        },
        byCategory(cat) { return (SUBJECTS[cat] ? News.byDivision('educa') : News.all()).filter(x => x.category === cat); },
        byKind(kinds) { kinds = [].concat(kinds); return News.all().filter(x => kinds.includes(x.kind || 'noticia')); },
        // Assinaturas (autor e coautores) e créditos de edição, em todas as divisões
        // Sem diferenciar maiúsculas ("games" e "Games" são a mesma assinatura)
        byAuthor(name) { return News.published().filter(x => sameName(x.author, name) || (x.coauthors || []).some(c => sameName(c, name))); },
        byCredit(name) { return News.published().filter(x => (x.edit_credits || []).some(c => sameName(c, name))); },
        byTag(slug) { return News.published().filter(x => (x.tags || []).includes(slug)); },
        // Relê uma matéria do servidor (cobertura ao vivo). No modo local, lê de novo o navegador.
        refresh() { return Promise.resolve(true); },
        search(q) {
            q = q.toLowerCase();
            return News.published().filter(x => (x.title + ' ' + x.subtitle + ' ' + x.author + ' ' + x.coauthors.join(' ') + ' ' + x.tags.map(t => (Tags.get(t) || { name: t }).name).join(' ') + ' ' +
                x.body.map(plainText).join(' ') + ' ' + x.updates.map(u => u.text).join(' ')).toLowerCase().includes(q));
        }
    };

    /* ---------- Tags (navegação entre matérias relacionadas) ----------
       Qualquer pessoa da equipe cria uma tag ao escrever; editar e excluir é da coordenação
       (no Supabase o banco confere: tabela tags). Excluir uma tag a tira das matérias. */
    const tagSort = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    const Tags = {
        all() { return (read(KEYS.tags, []) || []).slice().sort(tagSort); },
        get(slug) { return Tags.all().find(t => t.slug === slug) || null; },
        find(name) { const s = slugify(name); return s ? Tags.get(s) : null; },
        count(slug) { return News.byTag(slug).length; },
        load() { return Promise.resolve(true); },
        // {slug?, name, description}. Sem slug = tag nova (o slug sai do nome).
        save(t) {
            const isNew = !t.slug, name = String(t.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            const slug = isNew ? slugify(name) : t.slug;
            if (!name || !SLUG_RE.test(slug)) return Promise.resolve({ ok: false, error: 'Dê um nome à tag (letras ou números).' });
            if (isNew ? !Auth.isStaff() : !Auth.isEditor()) return Promise.resolve({ ok: false, error: 'Você não tem permissão para isso.' });
            const list = read(KEYS.tags, []) || [], i = list.findIndex(x => x.slug === slug);
            if (isNew && i >= 0) return Promise.resolve({ ok: true, tag: list[i], existed: true });
            const tag = { slug, name, description: String(t.description || '').trim().slice(0, 300), created: i >= 0 ? list[i].created : new Date().toISOString() };
            if (i >= 0) list[i] = tag; else list.push(tag);
            write(KEYS.tags, list);
            return Promise.resolve({ ok: true, tag });
        },
        remove(slug) {
            if (!Auth.isEditor()) return Promise.resolve({ ok: false, error: 'Só a coordenação exclui tags.' });
            write(KEYS.tags, (read(KEYS.tags, []) || []).filter(t => t.slug !== slug));
            write(KEYS.news, read(KEYS.news, []).map(n => (n.tags || []).includes(slug) ? Object.assign(n, { tags: n.tags.filter(x => x !== slug) }) : n));
            return Promise.resolve({ ok: true });
        }
    };

    /* ---------- Catálogo de selos ----------
       Coordenação e administração criam, editam, desativam e excluem; "Em matérias" / "Em perfis"
       definem onde cada selo pode ser usado. Excluir um selo o tira das matérias e dos perfis. */
    const Badges = {
        all() { return Object.keys(BADGES).map(k => BADGES[k]); },
        forProfiles() { return Badges.all().filter(b => b.forProfiles && b.active); },
        forNews() { return Badges.all().filter(b => b.forNews && b.active); },
        load() { const saved = read(KEYS.badges, null); if (Array.isArray(saved)) setBadgeCatalog(saved); return Promise.resolve(true); },
        save(b, isNew) {
            if (!Auth.isEditor()) return Promise.resolve({ ok: false, error: 'Só a coordenação gerencia os selos.' });
            const slug = isNew ? slugify(b.slug || b.label, 30) : b.slug, label = String(b.label || '').trim().slice(0, 40);
            if (!label || !SLUG_RE.test(slug)) return Promise.resolve({ ok: false, error: 'Dê um nome ao selo.' });
            if (isNew && BADGES[slug]) return Promise.resolve({ ok: false, error: 'Já existe um selo com esse identificador.' });
            const list = Badges.all().filter(x => x.slug !== slug).concat([{ slug, label, desc: String(b.desc || '').trim().slice(0, 200), color: b.color, forProfiles: !!b.forProfiles, forNews: !!b.forNews, active: b.active !== false, sort: Number(b.sort) || 0 }]);
            write(KEYS.badges, list); setBadgeCatalog(list);
            return Promise.resolve({ ok: true, badge: BADGES[slug] });
        },
        remove(slug) {
            if (!Auth.isEditor()) return Promise.resolve({ ok: false, error: 'Só a coordenação gerencia os selos.' });
            const list = Badges.all().filter(x => x.slug !== slug);
            write(KEYS.badges, list); setBadgeCatalog(list);
            write(KEYS.news, read(KEYS.news, []).map(n => (n.badges || []).includes(slug) ? Object.assign(n, { badges: n.badges.filter(x => x !== slug) }) : n));
            write(KEYS.users, read(KEYS.users, []).map(u => (u.badges || []).includes(slug) ? Object.assign(u, { badges: u.badges.filter(x => x !== slug) }) : u));
            return Promise.resolve({ ok: true });
        }
    };

    /* ---------- Seguir matérias e notificações ----------
       Quem segue uma matéria é avisado quando ela é atualizada (correção, nova versão) e, na cobertura
       ao vivo, a cada atualização. Administradores recebem os alertas de segurança. No Supabase os
       avisos são criados pelo banco (gatilhos) e podem chegar também por push com o site fechado.
       No modo local, valem entre as contas de demonstração deste navegador. */
    const Follows = {
        ids() { const me = Auth.current(); return me ? ((read(KEYS.follows, {}) || {})[me.id] || []).slice() : []; },
        has(id) { return Follows.ids().includes(id); },
        // true = passou a seguir, false = deixou de seguir, null = precisa de conta liberada
        toggle(id) {
            const me = Auth.current();
            if (!me || !Auth.accountOk()) return Promise.resolve(null);
            const all = read(KEYS.follows, {}) || {}, l = all[me.id] || [], had = l.includes(id);
            all[me.id] = had ? l.filter(x => x !== id) : [id].concat(l).slice(0, 500);
            write(KEYS.follows, all);
            return Promise.resolve(!had);
        },
        load() { return Promise.resolve(true); }
    };
    function notifyLocal(users, kind, title, body, url, newsId) {
        const all = read(KEYS.notifs, {}) || {}, now = new Date().toISOString(), me = Auth.current();
        [...new Set(users)].filter(u => u && (!me || u !== me.id)).forEach(u => {
            const l = all[u] || [];
            const same = newsId && l.find(x => x.newsId === newsId && x.kind === kind && !x.readAt && Date.now() - new Date(x.date) < 15 * 60000);
            if (same) Object.assign(same, { title, body, date: now });
            else l.unshift({ id: uid(), kind, title, body, url, newsId: newsId || null, date: now, readAt: null });
            all[u] = l.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
        });
        write(KEYS.notifs, all);
    }
    // Mesmas regras do gatilho news_notify
    function notifyFollowers(before, after) {
        if (!isPublished(before) || !isPublished(after) || (read(KEYS.site, {}) || {}).lockdown) return;
        const follows = read(KEYS.follows, {}) || {};
        const followers = Object.keys(follows).filter(u => follows[u].includes(after.id));
        const url = 'pages/noticia.html?id=' + encodeURIComponent(after.id);
        if (after.updates.length > before.updates.length) {
            const last = after.updates.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0] || {};
            const live = after.kind === 'aovivo' ? Auth.users().filter(u => u.notifyLive).map(u => u.id) : [];
            notifyLocal(followers.concat(live), 'live', 'Ao vivo: ' + after.title, last.text || 'Nova atualização na cobertura.', url, after.id);
        } else if (VERSIONED.concat(['corrections']).some(k => !sameValue(before[k], after[k]))) {
            notifyLocal(followers, 'follow', 'Atualizada: ' + after.title, after.corrections.length > before.corrections.length ?
                'Uma correção foi publicada na matéria que você segue.' : 'A matéria que você segue foi atualizada.', url, after.id);
        }
    }
    const Notifications = {
        list() { const me = Auth.current(); return me ? ((read(KEYS.notifs, {}) || {})[me.id] || []).slice() : []; },
        unread() { return Notifications.list().filter(n => !n.readAt).length; },
        load() { return Promise.resolve(true); },
        markRead(ids) {
            const me = Auth.current(); if (!me) return Promise.resolve(false);
            const all = read(KEYS.notifs, {}) || {}, now = new Date().toISOString();
            (all[me.id] || []).forEach(n => { if (!n.readAt && (!ids || ids.includes(n.id))) n.readAt = now; });
            write(KEYS.notifs, all);
            return Promise.resolve(true);
        },
        remove(id) {
            const me = Auth.current(); if (!me) return Promise.resolve(false);
            const all = read(KEYS.notifs, {}) || {};
            all[me.id] = (all[me.id] || []).filter(n => id !== undefined && n.id !== id);
            write(KEYS.notifs, all);
            return Promise.resolve(true);
        }
    };
    // Push com o site fechado: só no modo Supabase (supabase-backend.js).
    const Push = {
        supported: () => false,
        state: () => Promise.resolve('unsupported'),
        enable: () => Promise.resolve({ ok: false, error: 'As notificações com o site fechado só funcionam no site publicado.' }),
        disable: () => Promise.resolve({ ok: true })
    };

    /* ---------- Visitas do site (estatísticas do painel) ----------
       Página vista: sempre conta (só um número por dia). Visitante diferente: só com o consentimento
       de "Estatísticas", guardando neste navegador apenas a data da última visita (jb_visit_day). */
    const todaySP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    function newVisitorToday() {
        if (!Cookies.allows('statistics')) return false;
        const day = todaySP();
        if (store.get(KEYS.visitDay) === day) return false;
        store.set(KEYS.visitDay, day);
        return true;
    }
    const lastDays = (days, rows) => {
        const map = {}; (rows || []).forEach(r => { map[r.day] = r; });
        const out = [], base = new Date(todaySP() + 'T12:00:00');
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(base - i * 86400000).toISOString().slice(0, 10);
            out.push({ day: d, views: map[d] ? map[d].views : 0, visitors: map[d] ? map[d].visitors : 0 });
        }
        return out;
    };
    let visitsHit = false;
    const Visits = {
        hit() {
            if (visitsHit || (read(KEYS.site, {}) || {}).lockdown) return;
            visitsHit = true;
            const all = read(KEYS.visits, {}) || {}, day = todaySP(), row = all[day] || { views: 0, visitors: 0 };
            row.views++; if (newVisitorToday()) row.visitors++;
            all[day] = row;
            write(KEYS.visits, Object.keys(all).sort().slice(-400).reduce((o, k) => { o[k] = all[k]; return o; }, {}));
        },
        load() { return Promise.resolve(true); },
        list(days) { const all = read(KEYS.visits, {}) || {}; return lastDays(days || 30, Object.keys(all).map(d => Object.assign({ day: d }, all[d]))); }
    };

    /* ---------- Autores (jornalistas e colunistas) ---------- */
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    const Authors = {
        all() { return read(KEYS.authors, []).slice().sort(byName); },
        get(name) { return Authors.all().find(a => a.name === name) || null; },
        columnists() { return Authors.all().filter(a => a.columnist); },
        save(a) {
            const list = read(KEYS.authors, []);
            const clash = list.find(x => x.name.toLowerCase() === a.name.trim().toLowerCase() && x.id !== a.id);
            if (clash) return { ok: false, error: 'Já existe um autor com esse nome.' };
            const i = list.findIndex(x => x.id === a.id);
            if (i >= 0) list[i] = Object.assign(list[i], a); else { a.id = uid(); a.created = new Date().toISOString(); list.push(a); }
            write(KEYS.authors, list);
            return { ok: true, author: a };
        },
        remove(id) { write(KEYS.authors, read(KEYS.authors, []).filter(a => a.id !== id)); },
        load() { return Promise.resolve(true); }
    };

    /* ---------- Versões das matérias (só o editor vê) ---------- */
    const Versions = {
        forNews(id) { return (read(KEYS.versions, {})[id] || []).slice(); },
        load() { return Promise.resolve(true); }
    };

    /* ---------- Usuários e sessão ---------- */
    const Auth = {
        users() { return read(KEYS.users, []); },
        current() { const id = read(KEYS.session, null); return id ? Auth.users().find(u => u.id === id) || null : null; },
        isAdmin() { const u = Auth.current(); return !!u && u.role === 'admin'; },
        register({ name, email, password, birthDate }) {
            email = email.trim().toLowerCase();
            const users = Auth.users();
            if (!(ageFrom(birthDate) >= MIN_AGE)) return { ok: false, error: 'O JB aceita cadastros a partir de ' + MIN_AGE + ' anos.' };
            if (users.some(u => u.email === email)) return { ok: false, error: 'Já existe uma conta com este e-mail.' };
            const user = { id: uid(), name: name.trim(), email, pass: hash(email + 'i' + password), role: 'leitor', bio: '', city: '', interests: [], created: new Date().toISOString(), ageVerified: new Date().toISOString() };
            users.push(user); write(KEYS.users, users); write(KEYS.session, user.id);
            return { ok: true, user };
        },
        login(email, password) {
            email = email.trim().toLowerCase();
            const user = Auth.users().find(u => u.email === email && u.pass === hash(email + 'i' + password));
            if (!user) return { ok: false, error: 'E-mail ou senha incorretos.' };
            write(KEYS.session, user.id);
            return { ok: true, user };
        },
        logout() { store.del(KEYS.session); },
        update(patch) {
            const users = Auth.users(); const me = Auth.current();
            if (!me) return null;
            const i = users.findIndex(u => u.id === me.id);
            users[i] = Object.assign(users[i], patch);
            write(KEYS.users, users);
            return users[i];
        },
        changePassword(current, next) {
            const me = Auth.current();
            if (!me || me.pass !== hash(me.email + 'i' + current)) return false;
            Auth.update({ pass: hash(me.email + 'i' + next) });
            return true;
        },
        deleteAccount() {
            const me = Auth.current(); if (!me) return;
            write(KEYS.users, Auth.users().filter(u => u.id !== me.id));
            Auth.logout();
        },
        // Recuperação de senha exige envio de e-mail: só existe no modo Supabase.
        async requestPasswordReset() { return { ok: false, error: 'A recuperação de senha por e-mail só funciona com o Supabase configurado.' }; },
        async verifyRecoveryCode() { return { ok: false, error: 'A recuperação de senha por e-mail só funciona com o Supabase configurado.' }; },
        async recoveryState() { return 'unsupported'; },
        async updatePassword() { return { ok: false, error: 'A recuperação de senha por e-mail só funciona com o Supabase configurado.' }; },
        // Segurança da conta. No modo local (login simulado) não há MFA, Google nem confirmação de
        // idade no servidor: a conta já nasce liberada. supabase-backend.js troca tudo isto.
        ageOk() { return !!Auth.current(); },
        mfaState() { return Auth.current() ? 'ok' : null; },          // 'ok' | 'challenge' | 'enroll' | null
        accountOk() { return Auth.ageOk() && Auth.mfaState() === 'ok'; },
        async googleAvailable() { return false; },
        async loginWithGoogle() { return { ok: false, error: 'O login com o Google só funciona com o Supabase configurado.' }; },
        async confirmAge() { return { ok: true }; },
        async mfaFactors() { return []; },
        async mfaEnroll() { return { ok: false, error: 'A verificação em duas etapas só funciona com o Supabase configurado.' }; },
        async mfaVerify() { return { ok: false, error: 'A verificação em duas etapas só funciona com o Supabase configurado.' }; },
        async mfaRemove() { return { ok: false, error: 'A verificação em duas etapas só funciona com o Supabase configurado.' }; },
        logEvent() { },
        // Relê o perfil do servidor (cargo trocado por outra pessoa). No modo local nada muda.
        refresh() { return Promise.resolve(true); }
    };

    // Permissões derivadas do cargo (usam Auth.current(), então valem também no modo Supabase,
    // onde supabase-backend.js troca só current()/isAdmin()). Só decidem o que a tela mostra.
    Object.assign(Auth, {
        // Cargo no perfil (o que aparece no selo, no perfil e no menu)
        realRole() { const u = Auth.current(); return u ? (u.role || 'leitor') : null; },
        // Cargo que vale nesta sessão: null enquanto a conta não está liberada (idade não confirmada
        // ou verificação em duas etapas pendente), igual a my_role() no banco.
        role() { return Auth.accountOk() ? Auth.realRole() : null; },
        isStaff() { return STAFF_ROLES.includes(Auth.role()); },
        isEditor() { return EDITOR_ROLES.includes(Auth.role()); },
        // Status que o usuário pode dar a uma matéria (jornalista: só até "Aprovada")
        allowedStatuses() { return Auth.isEditor() ? STATUS_FLOW.slice() : Auth.isStaff() ? JOURNALIST_STATUSES.slice() : []; },
        isOwnNews(n) { const u = Auth.current(); return !!u && !!n && n.created_by === u.id; },
        // Jornalista colaborador de edição da matéria (news.editors)
        isCollaborator(n) { const u = Auth.current(); return !!u && !!n && (n.editors || []).includes(u.id); },
        canEditNews(n) {
            if (!n) return false;
            if (Auth.isEditor()) return true;
            const r = Auth.role();
            return (r === 'jornalista' || (r === 'professor' && divisionOf(n) === 'educa')) &&
                (Auth.isOwnNews(n) || Auth.isCollaborator(n)) && JOURNALIST_STATUSES.includes(n.status || 'publicada');
        },
        // Divisões em que o usuário escreve (professor: só o JB Educa)
        divisions() { const r = Auth.role(); return !STAFF_ROLES.includes(r) ? [] : r === 'professor' ? ['educa'] : Object.keys(DIVISIONS); },
        // Quem muda a lista de colaboradores: quem criou a matéria ou coordenador/admin (gatilho news_set_editors)
        canManageEditors(n) { return Auth.isEditor() || (Auth.isStaff() && (!n || !n.id || Auth.isOwnNews(n))); },
        // Cargos que o usuário logado pode dar a `target` ({id, role}); [] = não pode mexer.
        assignableRoles(target) {
            const me = Auth.current(), r = Auth.role();
            if (!me || !target || target.id === me.id || target.role === 'admin') return [];
            if (r === 'admin') return ['leitor', 'jornalista', 'professor', 'coordenador'];
            if (r === 'coordenador' && ['leitor', 'jornalista', 'professor'].includes(target.role || 'leitor')) return ['leitor', 'jornalista', 'professor'];
            return [];
        },
        // Pode dar/tirar selos de `target`? (mesmas regras de set_member_badges no banco)
        canGiveBadges(target) {
            const me = Auth.current(), r = Auth.role();
            if (!me || !target || target.id === me.id || target.role === 'admin') return false;
            if (r === 'admin') return true;
            return r === 'coordenador' && ['leitor', 'jornalista', 'professor'].includes(target.role || 'leitor');
        },
        // Avisar de todas as coberturas ao vivo (profiles.notify_live)
        notifyLive() { const u = Auth.current(); return !!(u && u.notifyLive); },
        setNotifyLive(on) { if (!Auth.current()) return Promise.resolve(false); Auth.update({ notifyLive: !!on }); return Promise.resolve(true); }
    });

    /* ---------- Membros: cargos (painel) e perfis públicos ---------- */
    // Perfil público: nunca inclui e-mail, cidade nem interesses.
    const publicOf = u => ({ id: u.id, name: u.name, role: u.role || 'leitor', bio: u.bio || '', avatar: u.avatar || '', created: u.created, badges: (u.badges || []).slice() });
    const cleanBadges = list => [...new Set((list || []).filter(b => BADGES[b] && BADGES[b].forProfiles && BADGES[b].active))].sort();
    let memberList = [];
    const Members = {
        // Painel (coordenador/admin): busca contas por nome ou e-mail
        load(q) {
            if (!Auth.isEditor()) { memberList = []; return Promise.resolve(true); }
            q = String(q || '').trim().toLowerCase();
            memberList = Auth.users().filter(u => !q || (u.name + ' ' + u.email).toLowerCase().includes(q))
                .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'leitor', created: u.created, badges: (u.badges || []).slice() }))
                .sort((a, b) => roleRank(a.role) - roleRank(b.role) || b.badges.length - a.badges.length || byName(a, b));
            return Promise.resolve(true);
        },
        list() { return memberList.slice(); },
        // Mesmas regras de set_member_role no banco
        setRole(id, role) {
            const users = Auth.users(), t = users.find(u => u.id === id), me = Auth.current();
            if (!t) return Promise.resolve({ ok: false, error: 'Conta não encontrada.' });
            if (!Auth.assignableRoles(t).includes(role)) return Promise.resolve({ ok: false, error: 'Você não tem permissão para essa mudança de cargo.' });
            const old = t.role || 'leitor';
            if (old === role) return Promise.resolve({ ok: true });
            t.role = role; write(KEYS.users, users);
            const m = memberList.find(x => x.id === id); if (m) m.role = role;
            write(KEYS.roleLog, [{ targetId: id, targetName: t.name, oldRole: old, newRole: role, byName: me ? me.name : '', date: new Date().toISOString() }].concat(read(KEYS.roleLog, [])).slice(0, 50));
            return Promise.resolve({ ok: true });
        },
        // Selos de perfil (mesmas regras de set_member_badges no banco)
        setBadges(id, badges) {
            const users = Auth.users(), t = users.find(u => u.id === id);
            if (!t) return Promise.resolve({ ok: false, error: 'Conta não encontrada.' });
            if (!Auth.canGiveBadges(t)) return Promise.resolve({ ok: false, error: 'Você não tem permissão para mudar os selos desta conta.' });
            t.badges = cleanBadges(badges); write(KEYS.users, users);
            const m = memberList.find(x => x.id === id); if (m) m.badges = t.badges.slice();
            return Promise.resolve({ ok: true });
        },
        loadLog() { return Promise.resolve(true); },
        log() { return Auth.isEditor() ? read(KEYS.roleLog, []) : []; },
        // Equipe da redação (selo do JB) e contas com selo de perfil, públicas
        loadStaff() { return Promise.resolve(true); },
        staff() { return Auth.users().filter(u => STAFF_ROLES.includes(u.role) || (u.badges || []).length).map(publicOf).sort((a, b) => roleRank(a.role) - roleRank(b.role) || byName(a, b)); },
        staffById(id) { return Members.staff().find(p => p.id === id) || null; },
        staffByName(name) { return Members.staff().find(p => sameName(p.name, name)) || null; },
        // Perfil público de qualquer conta: objeto, null (não existe) ou undefined (falha de conexão)
        profile(id) { const u = Auth.users().find(x => x.id === id); return Promise.resolve(u ? publicOf(u) : null); }
    };

    /* ---------- Denúncias / pautas ---------- */
    const Reports = {
        all() { return read(KEYS.reports, []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },
        // Só quem tem conta denuncia (no Supabase o banco confere). null = sem conta liberada.
        add(r) {
            if (!Auth.current() || !Auth.accountOk()) return null;
            const list = read(KEYS.reports, []); r.id = uid(); r.date = new Date().toISOString(); r.attachments = r.attachments || []; list.push(r); write(KEYS.reports, list); return r;
        },
        remove(id) { write(KEYS.reports, read(KEYS.reports, []).filter(r => r.id !== id)); },
        load() { return Promise.resolve(true); },   // no Supabase baixa as denúncias só no painel
        // Anexos (imagens já reduzidas no navegador, ou PDF). No modo local ficam como data URL neste
        // navegador; no Supabase vão para o bucket privado report-files.
        upload(blob, name) {
            return new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve({ path: 'local:' + uid(), name: String(name || 'anexo').slice(0, 200), size: blob.size, type: blob.type, data: fr.result });
                fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob);
            });
        },
        // { path: url } para abrir no painel (no Supabase: links temporários, só coordenador/admin)
        newFolder: () => uid(),
        fileUrls(list) { const o = {}; (list || []).forEach(a => { if (a && a.data) o[a.path] = a.data; }); return Promise.resolve(o); },
        removeFiles() { return Promise.resolve(true); }
    };

    /* ---------- Visualizações (ranking "Mais lidas") ---------- */
    const Views = {
        hit(id) { const v = read(KEYS.views, {}); v[id] = (v[id] || 0) + 1; write(KEYS.views, v); },
        count(id) { return read(KEYS.views, {})[id] || 0; },
        total() { const v = read(KEYS.views, {}); return Object.keys(v).reduce((s, k) => s + v[k], 0); },
        top(n) {
            const v = read(KEYS.views, {});
            return News.all().filter(x => v[x.id]).sort((a, b) => v[b.id] - v[a.id]).slice(0, n);
        }
    };
    const readingTime = n => Math.max(1, Math.round(n.body.map(plainText).join(' ').split(/\s+/).length / 200));

    /* ---------- Favoritos, histórico, comentários, newsletter e tema ---------- */
    const Favs = {
        all() { return read(KEYS.favs, []).map(News.get).filter(n => n && isPublished(n)); },
        has(id) { return read(KEYS.favs, []).includes(id); },
        toggle(id) { let l = read(KEYS.favs, []); const had = l.includes(id); l = had ? l.filter(x => x !== id) : [id].concat(l); write(KEYS.favs, l); return !had; },
        ids() { return read(KEYS.favs, []); },
        clear() { store.del(KEYS.favs); }
    };
    const History = {
        all() { return read(KEYS.history, []).map(News.get).filter(n => n && isPublished(n)); },
        // Só com o consentimento de "Preferências" (cookies)
        add(id) { if (Cookies.allows('preferences')) write(KEYS.history, [id].concat(read(KEYS.history, []).filter(x => x !== id)).slice(0, 30)); },
        clear() { write(KEYS.history, []); }
    };
    const Comments = {
        forNews(id) { return (read(KEYS.comments, {})[id] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },
        // Só quem tem conta comenta (no Supabase o banco confere): sempre no nome da conta
        add(id, c) {
            const all = read(KEYS.comments, {}), me = Auth.current();
            if (!me || !Auth.accountOk()) return false;
            (all[id] = all[id] || []).push({ id: uid(), userId: me.id, name: me.name, text: c.text, date: new Date().toISOString() });
            write(KEYS.comments, all);
            return true;
        },
        // Comentários de uma conta (perfil público), só em matérias publicadas
        byUser(userId) { return Promise.resolve(Comments.flat().filter(c => c.userId === userId && News.all().some(n => n.id === c.newsId)).slice(0, 30)); },
        canEdit() { return true; },
        // O próprio autor edita o texto (no Supabase o banco confere: só quem escreveu, só o texto)
        update(newsId, cid, text) {
            const all = read(KEYS.comments, {}), me = Auth.current();
            const c = (all[newsId] || []).find(x => x.id === cid);
            if (!c || !me || c.userId !== me.id) return false;
            c.text = text; c.editedAt = new Date().toISOString();
            write(KEYS.comments, all);
            return true;
        },
        remove(newsId, cid) { const all = read(KEYS.comments, {}); all[newsId] = (all[newsId] || []).filter(c => c.id !== cid); write(KEYS.comments, all); },
        flat() { const all = read(KEYS.comments, {}); return Object.keys(all).flatMap(id => all[id].map(c => Object.assign({ newsId: id }, c))).sort((a, b) => new Date(b.date) - new Date(a.date)); },
        load() { return Promise.resolve(true); }   // no Supabase baixa só os comentários da matéria aberta
    };
    const Newsletter = {
        count() { return read(KEYS.newsletter, []).length; },
        add(email) { email = email.trim().toLowerCase(); const l = read(KEYS.newsletter, []); if (l.includes(email)) return false; l.push(email); write(KEYS.newsletter, l); return true; },
        load() { return Promise.resolve(true); }
    };
    // Modo lockdown (aba Segurança do painel). No modo local fica só neste navegador (simulado);
    // no Supabase, o banco fecha o site para quem não é da equipe (site_status / set_lockdown).
    const Site = {
        status() { const s = read(KEYS.site, null) || {}; return Promise.resolve({ lockdown: !!s.lockdown, message: s.lockdown ? String(s.message || '') : '', since: s.lockdown ? s.since || null : null }); },
        setLockdown(on, message) {
            if (!Auth.isEditor()) return Promise.resolve({ ok: false, error: 'Só coordenadores e administradores ligam o modo lockdown.' });
            write(KEYS.site, { lockdown: !!on, message: String(message || '').slice(0, 500), since: new Date().toISOString() });
            const me = Auth.current();
            notifyLocal(Auth.users().filter(u => u.role === 'admin').map(u => u.id), 'security', on ? 'Modo lockdown LIGADO' : 'Modo lockdown desligado',
                'Por ' + (me ? me.name : '') + (on && message ? ': ' + String(message).slice(0, 200) : '.'), 'pages/admin-seguranca.html', null);
            return Promise.resolve({ ok: true });
        }
    };
    // Rascunhos do editor de matérias guardados só neste navegador (protege contra fechar a aba sem
    // salvar). Conveniência de quem escreve: a matéria de verdade continua no banco. Até 10 rascunhos.
    const Drafts = {
        get(key) { const all = read(KEYS.drafts, {}) || {}; return all[key] || null; },
        set(key, data) {
            const all = read(KEYS.drafts, {}) || {};
            all[key] = { data, at: new Date().toISOString() };
            const keep = Object.keys(all).sort((a, b) => new Date(all[b].at) - new Date(all[a].at)).slice(0, 10);
            write(KEYS.drafts, keep.reduce((o, k) => { o[k] = all[k]; return o; }, {}));
        },
        clear(key) { const all = read(KEYS.drafts, {}) || {}; if (key in all) { delete all[key]; write(KEYS.drafts, all); } }
    };
    // Imagens enviadas pelo painel: no modo local viram data URL; no Supabase vão para o Storage.
    const Media = {
        upload(blob) {
            return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
        }
    };
    const Theme = {
        get() { return store.get(KEYS.theme) === 'dark' ? 'dark' : 'light'; },
        set(t) { store.set(KEYS.theme, t); if (t === 'dark') document.documentElement.setAttribute('data-bs-theme', 'dark'); else document.documentElement.removeAttribute('data-bs-theme'); },
        toggle() { Theme.set(Theme.get() === 'dark' ? 'light' : 'dark'); return Theme.get(); }
    };
    // Acessibilidade: tamanho do texto (0 = normal … 3 = maior), alto contraste e "menos animação".
    // Texto e contraste são aplicados antes da página aparecer pelo script inline do <head> (mesma
    // chave jb_a11y); "menos animação" é aplicado aqui mesmo, antes do layout.js desenhar o cabeçalho.
    const A11y = {
        get() { const a = read(KEYS.a11y, {}) || {}; return { font: Math.max(0, Math.min(3, Number(a.font) || 0)), contrast: !!a.contrast, motion: !!a.motion }; },
        set(patch) {
            const a = Object.assign(A11y.get(), patch);
            a.font = Math.max(0, Math.min(3, Number(a.font) || 0));
            write(KEYS.a11y, a);
            A11y.apply();
            return a;
        },
        apply() {
            const a = A11y.get(), d = document.documentElement;
            if (a.font) d.setAttribute('data-font', a.font); else d.removeAttribute('data-font');
            if (a.contrast) d.setAttribute('data-contrast', 'high'); else d.removeAttribute('data-contrast');
            if (a.motion) d.setAttribute('data-motion', 'reduce'); else d.removeAttribute('data-motion');
        }
    };
    try { if (A11y.get().motion) document.documentElement.setAttribute('data-motion', 'reduce'); } catch (e) { /* sem DOM */ }

    /* ---------- Cookies e armazenamento no navegador (LGPD) ----------
       O JB não usa cookies de publicidade nem rastreadores. O que fica no navegador está listado em
       COOKIE_CATEGORIES (a mesma lista aparece na janela de preferências e na Política de Privacidade).
       Consentimento versão 2: quem respondeu à versão antiga vê o aviso de novo. */
    const COOKIE_CATEGORIES = [
        { key: 'necessary', label: 'Necessários', locked: true,
            desc: 'Fazem o site funcionar e protegem a sua conta. Não podem ser desligados.',
            items: ['Sessão de login e verificação em duas etapas (Supabase Auth)', 'Proteção contra robôs no login e no cadastro (Cloudflare Turnstile)', 'Tema claro/escuro, tamanho do texto, alto contraste e menos animação', 'Favoritos de quem navega sem conta e rascunhos do editor', 'Estas escolhas de cookies e uma cópia das páginas públicas já abertas, para ler sem internet'] },
        { key: 'preferences', label: 'Preferências',
            desc: 'Lembram o que você fez para personalizar o site.',
            items: ['Histórico de leitura (últimas 30 matérias) e as recomendações da Minha Central', 'Cidade escolhida para a previsão do tempo'] },
        { key: 'statistics', label: 'Estatísticas',
            desc: 'Ajudam a redação a saber quantas pessoas leem o JB. Sem perfil e sem identificar você.',
            items: ['Contagem de visitantes diferentes por dia: guarda só a data da sua última visita neste navegador', 'Páginas vistas e leituras de cada matéria são sempre contadas apenas como números totais'] },
        { key: 'location', label: 'Localização aproximada',
            desc: 'Mostra o tempo da sua cidade sem você precisar escolher.',
            items: ['A cidade é estimada pela sua conexão (Cloudflare), sem GPS; nada é guardado no servidor'] },
        { key: 'external', label: 'Conteúdo de terceiros',
            desc: 'Carrega imagens hospedadas por outros serviços, que recebem o seu endereço IP.',
            items: ['Capas de vídeos do YouTube', 'Escudos dos times (TheSportsDB) e fotos da Wikipédia'] }
    ];
    const Cookies = {
        VERSION: 2,
        CATEGORIES: COOKIE_CATEGORIES,
        get() { const c = read(KEYS.cookies, null); return c && c.v === 2 ? c : null; },
        // Sem resposta ainda: só os necessários
        allows(k) { if (k === 'necessary') return true; const c = Cookies.get(); return !!(c && c[k]); },
        set(prefs) {
            const c = { v: 2, necessary: true, date: new Date().toISOString() };
            COOKIE_CATEGORIES.forEach(cat => { if (!cat.locked) c[cat.key] = !!(prefs && prefs[cat.key]); });
            write(KEYS.cookies, c);
            // Retirou o consentimento: apaga o que dependia dele
            if (!c.preferences) { store.del(KEYS.history); store.del(KEYS.place); }
            if (!c.statistics) store.del(KEYS.visitDay);
            try { document.dispatchEvent(new CustomEvent('jb:consent', { detail: c })); } catch (e) { }
            return c;
        }
    };

    /* ---------- Serviços externos (tempo, cotações, futebol, Hoje na História) ----------
       No site publicado, o navegador chama só o próprio JB (/api/ext, Cloudflare Pages Function), que
       consulta o serviço e guarda a resposta no cache da Cloudflare: o seu IP não chega ao serviço e
       muitos leitores reaproveitam a mesma consulta. Aqui ainda fica uma cópia (jb_ext) por alguns
       minutos, para não repetir pedidos ao trocar de página. Abrindo por file:// (ou num servidor sem
       as Functions) o navegador chama o serviço direto. Fontes e limites: functions/api/ext.js. */
    const EXT_TTL = { weather: 15, capitals: 15, geocode: 1440, cep: 10080, rates: 5, football: 10, table: 60, league: 1440, history: 720 };   // minutos
    const LEAGUES = {
        4351: { name: 'Brasileirão Série A', short: 'Série A' },
        4404: { name: 'Brasileirão Série B', short: 'Série B' },
        4725: { name: 'Copa do Brasil', short: 'Copa do Brasil' },
        4501: { name: 'Copa Libertadores', short: 'Libertadores' },
        4724: { name: 'Copa Sul-Americana', short: 'Sul-Americana' }
    };
    // Capitais do "tempo agora" (mesma ordem de functions/api/ext.js)
    const CAPITALS = [['São Paulo', 'SP', -23.55, -46.63], ['Rio de Janeiro', 'RJ', -22.91, -43.17], ['Brasília', 'DF', -15.78, -47.93], ['Salvador', 'BA', -12.97, -38.5],
        ['Fortaleza', 'CE', -3.72, -38.54], ['Belo Horizonte', 'MG', -19.92, -43.94], ['Manaus', 'AM', -3.12, -60.02], ['Curitiba', 'PR', -25.43, -49.27],
        ['Recife', 'PE', -8.05, -34.88], ['Porto Alegre', 'RS', -30.03, -51.23], ['Belém', 'PA', -1.46, -48.49], ['Goiânia', 'GO', -16.69, -49.25]]
        .map(c => ({ name: c[0], uf: c[1], lat: c[2], lon: c[3] }));
    const RATE_PAIRS = ['USD-BRL', 'EUR-BRL', 'GBP-BRL', 'ARS-BRL', 'JPY-BRL', 'CNY-BRL', 'CAD-BRL', 'CHF-BRL', 'BTC-BRL', 'ETH-BRL', 'LTC-BRL', 'XRP-BRL', 'DOGE-BRL'];
    // Endereço do serviço (modo direto). Mesmas regras de functions/api/ext.js.
    function extDirect(src, p) {
        const num = (v, lo, hi) => { if (v === undefined || String(v).trim() === '') return null; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null; };
        if (src === 'weather') {
            const lat = num(p.lat, -90, 90), lon = num(p.lon, -180, 180);
            return lat === null || lon === null ? '' : 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=6';
        }
        if (src === 'capitals') return 'https://api.open-meteo.com/v1/forecast?latitude=' + CAPITALS.map(c => c.lat).join(',') + '&longitude=' + CAPITALS.map(c => c.lon).join(',') +
            '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto';
        if (src === 'geocode') { const q = String(p.q || '').trim().slice(0, 60); return q.length < 2 ? '' : 'https://geocoding-api.open-meteo.com/v1/search?count=8&language=pt&format=json&name=' + encodeURIComponent(q); }
        if (src === 'cep') { const c = String(p.cep || '').replace(/\D/g, ''); return c.length === 8 ? 'https://viacep.com.br/ws/' + c + '/json/' : ''; }
        if (src === 'rates') return 'https://economia.awesomeapi.com.br/json/last/' + RATE_PAIRS.join(',');
        if (src === 'football' || src === 'table' || src === 'league') {
            const id = String(p.league || ''); if (!LEAGUES[id]) return '';
            const base = 'https://www.thesportsdb.com/api/v1/json/123/';
            if (src === 'table') return base + 'lookuptable.php?l=' + id + '&s=' + encodeURIComponent(String(p.season || new Date().getFullYear()).replace(/[^0-9-]/g, ''));
            if (src === 'league') return base + 'lookupleague.php?id=' + id;
            return base + (p.when === 'next' ? 'eventsnextleague.php' : 'eventspastleague.php') + '?id=' + id;
        }
        if (src === 'history') {
            const m = /^(\d{2})-(\d{2})$/.exec(String(p.day || ''));
            return m ? 'https://pt.wikipedia.org/api/rest_v1/feed/onthisday/events/' + m[1] + '/' + m[2] : '';
        }
        return '';
    }
    const extCache = () => read(KEYS.ext, {}) || {};
    const Ext = {
        LEAGUES, RATE_PAIRS, CAPITALS,
        // Promise<{data, at, stale}> ou null (sem conexão e sem cópia). at = quando o dado foi obtido.
        get(src, params, opts) {
            params = params || {}; opts = opts || {};
            const qs = Object.keys(params).sort().filter(k => params[k] !== undefined && params[k] !== '').map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
            const key = src + '?' + qs, ttl = (EXT_TTL[src] || 10) * 60000, now = Date.now();
            const hit = extCache()[key];
            if (hit && now - hit.t < ttl && !opts.force) return Promise.resolve({ data: hit.d, at: hit.at || hit.t, stale: false });
            // Mesma consulta já em andamento (dois widgets pedindo a mesma previsão): espera a mesma resposta
            if (Ext._flight[key]) return Ext._flight[key];
            const timeout = (p, ms) => Promise.race([p, new Promise((res, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
            const viaFn = /^https?:$/.test(location.protocol) ? fetch(root() + 'api/ext?src=' + encodeURIComponent(src) + (qs ? '&' + qs : ''), { headers: { Accept: 'application/json' } })
                .then(r => { if (r.status === 404 && !/json/.test(r.headers.get('content-type') || '')) throw new Error('nofn'); if (!r.ok) throw new Error('http ' + r.status); return r.json().then(d => ({ d, at: Date.parse(r.headers.get('X-JB-Fetched') || '') || now })); })
                : Promise.reject(new Error('nofn'));
            const direct = () => { const url = extDirect(src, params); if (!url) return Promise.reject(new Error('bad')); return fetch(url).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.text().then(t => ({ d: JSON.parse(t.trim() || '{}'), at: now })); }); };
            const flight = Ext._flight[key] = timeout(viaFn.catch(e => { if (e.message === 'nofn') return direct(); throw e; }), 15000).then(res => {
                const all = extCache();
                all[key] = { t: now, at: res.at, d: res.d };
                // Guarda só as 40 consultas mais recentes
                const keep = Object.keys(all).sort((a, b) => all[b].t - all[a].t).slice(0, 40);
                write(KEYS.ext, keep.reduce((o, k) => { o[k] = all[k]; return o; }, {}));
                return { data: res.d, at: res.at, stale: false };
            }).catch(() => hit ? { data: hit.d, at: hit.at || hit.t, stale: true } : null);
            flight.then(() => { delete Ext._flight[key]; });
            return flight;
        },
        _flight: {},
        // Cidade aproximada pela conexão (Cloudflare), só com o consentimento de "Localização aproximada"
        locate() {
            if (!Cookies.allows('location') || !/^https?:$/.test(location.protocol)) return Promise.resolve(null);
            if (Ext._loc) return Ext._loc;   // uma consulta por página
            return Ext._loc = fetch(root() + 'api/local', { headers: { Accept: 'application/json' }, cache: 'no-store' })
                .then(r => r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null)
                .then(d => d && isFinite(d.lat) && isFinite(d.lon) && d.city ? { name: String(d.city), region: String(d.region || ''), lat: Number(d.lat), lon: Number(d.lon), auto: true } : null)
                .catch(() => null)
                .then(p => { if (!p) Ext._loc = null; return p; });
        },
        // Cidade escolhida pelo leitor (só com o consentimento de "Preferências"; senão vale só nesta visita)
        place() { const p = read(KEYS.place, null); return p && isFinite(p.lat) && isFinite(p.lon) ? p : (Ext._session || null); },
        setPlace(p) {
            const v = { name: String(p.name).slice(0, 80), region: String(p.region || '').slice(0, 80), uf: String(p.uf || '').slice(0, 2), lat: Number(p.lat), lon: Number(p.lon) };
            Ext._session = v;
            if (Cookies.allows('preferences')) write(KEYS.place, v);
            return v;
        },
        clearPlace() { Ext._session = null; store.del(KEYS.place); }
    };
    // Cidade padrão quando não há escolha nem localização: Brasília
    const DEFAULT_PLACE = { name: 'Brasília', region: 'Distrito Federal', lat: -15.78, lon: -47.93, fallback: true };

    /* ---------- Utilitários ---------- */
    const root = () => document.body.dataset.root || '';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // Só https://, data URL de imagem (legado) ou caminho local; qualquer outra coisa vira a imagem padrão.
    const safeImg = src => /^https:\/\//i.test(src) || /^data:image\/(jpeg|png|webp|gif);base64,/i.test(src) || /^assets\/img\/[\w.-]+$/.test(src);
    const imgSrc = n => {
        let src = String(n.image || '');
        if (!safeImg(src)) src = FALLBACK_IMG[n.category] || '';
        return /^(https:|data:)/i.test(src) ? src : root() + src;
    };
    function timeAgo(iso) {
        const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
        if (m < 60) return 'Há ' + m + ' min';
        const h = Math.round(m / 60); if (h < 24) return 'Há ' + h + (h === 1 ? ' hora' : ' horas');
        const d = Math.round(h / 24); return 'Há ' + d + (d === 1 ? ' dia' : ' dias');
    }
    const fmtDate = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
    const articleUrl = n => root() + 'pages/noticia.html?id=' + encodeURIComponent(n.id);
    const catLabel = c => (ALL_CATEGORIES[c] ? ALL_CATEGORIES[c].label : c);
    const catUrl = c => root() + (ALL_CATEGORIES[c] ? ALL_CATEGORIES[c].page : 'pages/noticias.html');
    const tagUrl = slug => root() + 'pages/tag.html?t=' + encodeURIComponent(slug || '');

    // Avatar do usuário: foto (data URL) ou inicial do nome sobre fundo carmim
    const avatarHTML = (u, cls) => '<span class="avatar ' + (cls || '') + '" data-avatar>' +
        (u.avatar && safeImg(String(u.avatar)) ? '<img src="' + esc(u.avatar) + '" alt="">' : esc((u.name || '?').trim().charAt(0).toUpperCase())) + '</span>';

    const kindLabel = k => ALL_KINDS[k] || KINDS.noticia;
    const authorUrl = name => root() + 'pages/autor.html?nome=' + encodeURIComponent(name || '');
    // Cargos e selo do JB (só para a equipe da redação)
    const roleLabel = r => ROLES[r] || ROLES.leitor;
    const isStaffRole = r => STAFF_ROLES.includes(r);
    const sealSpan = (title, cls) => {
        const t = esc(title);
        return '<span class="jb-seal' + (cls ? ' ' + cls : '') + '" title="' + t + '"><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false"><path d="M6.4 11.6 2.8 8l1.1-1.1 2.5 2.5 5.7-5.7L13.2 4.8z" fill="currentColor"/></svg><span aria-hidden="true">JB</span><span class="visually-hidden">' + t + '</span></span>';
    };
    // Professor: selo verde do JB Educa
    const sealHTML = role => !isStaffRole(role) ? '' : role === 'professor' ? sealSpan('Professor do JB Educa', 'jb-seal-educa') : sealSpan(roleLabel(role) + ' do Jornal Brasileiro');
    // Perfis oficiais da redação (autores com official = true): mesmo selo do JB
    const officialSealHTML = a => a && a.official ? sealSpan('Perfil oficial da redação do Jornal Brasileiro') : '';
    // Selos de perfil (Colaborador, Apoiador Oficial…): contorno, para não confundir com o selo da equipe
    const STAR = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false"><path d="M8 1.2l1.9 4 4.4.5-3.3 3 .9 4.3L8 10.8 4.1 13l.9-4.3-3.3-3 4.4-.5z" fill="currentColor"/></svg>';
    const badgeSpan = b => '<span class="jb-badge jb-badge-c-' + esc(b.color) + '" title="' + esc(b.desc) + '">' + STAR + esc(b.label) + '</span>';
    const profileBadgesHTML = list => (list || []).filter(b => BADGES[b] && BADGES[b].forProfiles && BADGES[b].active).map(b => badgeSpan(BADGES[b])).join(' ');
    // Selos da matéria (Exclusivo, Especial…), escolhidos no editor
    const newsBadgesHTML = n => (n.badges || []).filter(b => BADGES[b] && BADGES[b].forNews && BADGES[b].active).map(b => badgeSpan(BADGES[b])).join(' ');
    const profileUrl = id => root() + 'pages/perfil-publico.html?id=' + encodeURIComponent(id || '');
    // Assinatura com coautores: "A", "A e B", "A, B e C". link(name) devolve o HTML de cada nome.
    const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    const bylineNames = n => {
        const out = [];
        [n.author || 'Redação JB'].concat(n.coauthors || []).forEach(x => { x = String(x || '').trim(); if (x && !out.some(y => sameName(x, y))) out.push(x); });
        return out;
    };
    const joinNames = parts => parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1];
    const bylineHTML = (n, link) => joinNames(bylineNames(n).map(nm => link ? link(nm) : esc(nm)));
    // Créditos de edição ("Edição: Núcleo de Verificação JB e Ana Souza")
    const creditNames = n => { const out = []; (n.edit_credits || []).forEach(x => { x = String(x || '').trim(); if (x && !out.some(y => sameName(x, y))) out.push(x); }); return out; };
    const creditsHTML = (n, link) => joinNames(creditNames(n).map(nm => link ? link(nm) : esc(nm)));
    // Tags da matéria (só as que existem no catálogo)
    const tagsHTML = n => {
        const list = (n.tags || []).map(t => Tags.get(t)).filter(Boolean);
        return list.length ? '<ul class="tag-list" aria-label="Tags">' + list.map(t => '<li><a class="tag-chip" href="' + esc(tagUrl(t.slug)) + '">#' + esc(t.name) + '</a></li>').join('') + '</ul>' : '';
    };
    // Saudação conforme a hora (horário de Brasília)
    function greeting(d) {
        const h = Number(new Date(d || Date.now()).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24;
        return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
    }
    const OPINION_KINDS = ['opiniao', 'analise', 'editorial'];
    // Só links http(s) viram <a>; qualquer outra coisa (javascript:, data:) é ignorada.
    const safeUrl = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
    const verdictBadge = v => VERDICTS[v] ? '<span class="verdict-badge verdict-' + esc(v) + '">' + esc(VERDICTS[v].label) + '</span>' : '';
    const liveBadge = () => '<span class="live-badge"><span class="live-dot" aria-hidden="true"></span>AO VIVO</span>';
    // Selos do card: tipo de conteúdo (quando não é notícia comum), ao vivo e veredito da checagem
    function badgesHTML(n) {
        const k = n.kind || 'noticia';
        const parts = [];
        if (k === 'aovivo' && n.live) parts.push(liveBadge());
        else if (k !== 'noticia') parts.push('<span class="kind-badge kind-' + esc(k) + '">' + esc(kindLabel(k)) + '</span>');
        if (k === 'checagem' && n.verdict) parts.push(verdictBadge(n.verdict));
        if (n.video) parts.push('<span class="kind-badge kind-video"><svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg> Vídeo</span>');
        const nb = newsBadgesHTML(n); if (nb) parts.push(nb);
        return parts.length ? '<div class="card-badges">' + parts.join('') + '</div>' : '';
    }
    // Data de atualização: só aparece se for depois da publicação (edição, correção ou nova atualização ao vivo).
    const wasUpdated = n => !!n.updated_at && new Date(n.updated_at) - new Date(n.date) > 60000;
    // Rótulo da editoria com a cor dela (classes cat-* em style.css)
    const catTag = c => '<a class="category-tag cat-' + esc(c) + '" href="' + esc(catUrl(c)) + '">' + esc(catLabel(c)) + '</a>';

    function newsCard(n) {
        const byline = OPINION_KINDS.includes(n.kind) || n.kind === 'entrevista' ? '<span class="card-author">Por ' + bylineHTML(n) + '</span>' : '';
        return '<article class="news-card cat-' + esc(n.category) + '">' +
            '<a class="card-media" href="' + esc(articleUrl(n)) + '" tabindex="-1" aria-hidden="true"><img class="card-thumb" loading="lazy" decoding="async" src="' + esc(imgSrc(n)) + '" alt=""></a>' +
            '<div class="news-card-body">' + badgesHTML(n) + catTag(n.category) +
            '<h3><a href="' + esc(articleUrl(n)) + '">' + esc(n.title) + '</a></h3>' +
            '<p>' + esc(n.subtitle) + '</p>' + byline + '<span class="time">' + timeAgo(n.date) + '</span></div></article>';
    }

    /* ---------- Vídeos do YouTube ----------
       No banco fica só o identificador: o ID do vídeo (11 caracteres; serve também para lives) ou
       "channel:UC…" (a live atual de um canal). O player usa youtube-nocookie.com e só carrega
       quando o leitor clica (até lá nenhum dado vai para o YouTube). */
    const YT_ID = /^[A-Za-z0-9_-]{11}$/, YT_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
    function parseVideo(input) {
        const s = String(input || '').trim();
        if (!s) return '';
        if (YT_ID.test(s)) return s;
        if (/^channel:/.test(s)) return YT_CHANNEL.test(s.slice(8)) ? s : '';
        let u;
        try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return ''; }
        const host = u.hostname.replace(/^(www|m|music)\./, '');
        const parts = u.pathname.split('/').filter(Boolean);
        let id = '';
        if (host === 'youtu.be') id = parts[0] || '';
        else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
            else if (['embed', 'shorts', 'live', 'v'].includes(parts[0]) && parts[1] !== 'live_stream') id = parts[1] || '';
            else if (parts[0] === 'embed' && parts[1] === 'live_stream') { const ch = u.searchParams.get('channel') || ''; return YT_CHANNEL.test(ch) ? 'channel:' + ch : ''; }
            else if (parts[0] === 'channel' && YT_CHANNEL.test(parts[1] || '')) return 'channel:' + parts[1];
        }
        return YT_ID.test(id) ? id : '';
    }
    const isChannel = v => /^channel:/.test(v);
    const videoEmbedUrl = v => isChannel(v) ? 'https://www.youtube-nocookie.com/embed/live_stream?channel=' + v.slice(8) + '&autoplay=1'
        : 'https://www.youtube-nocookie.com/embed/' + v + '?autoplay=1&rel=0';
    const videoPageUrl = v => isChannel(v) ? 'https://www.youtube.com/channel/' + v.slice(8) + '/live' : 'https://www.youtube.com/watch?v=' + v;
    // Player "clique para carregar": capa + botão. O clique é tratado em layout.js (CSP sem script inline).
    function videoHTML(n) {
        const v = parseVideo(n && n.video);
        if (!v) return '';
        // Capa do YouTube só com o consentimento de "Conteúdo de terceiros"; senão, a imagem da matéria
        const poster = isChannel(v) || !Cookies.allows('external') ? imgSrc(n) : 'https://i.ytimg.com/vi/' + v + '/hqdefault.jpg';
        const label = (n.kind === 'aovivo' ? 'Assistir à transmissão: ' : 'Assistir ao vídeo: ') + (n.title || '');
        return '<figure class="jb-video" data-video-embed="' + esc(videoEmbedUrl(v)) + '" data-video-title="' + esc(n.title || 'Vídeo') + '">' +
            '<button type="button" class="jb-video-play" aria-label="' + esc(label) + '"><img src="' + esc(poster) + '" alt="" loading="lazy" decoding="async">' +
            '<span class="jb-video-icon" aria-hidden="true"><svg viewBox="0 0 68 48" width="68" height="48" focusable="false"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3S12.8.3 7.5 1.7a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="currentColor"/><path d="M45 24 27 14v20z" fill="#fff"/></svg></span></button>' +
            '<figcaption class="jb-video-note">Vídeo do YouTube. Ao reproduzir, o YouTube pode registrar dados da sua visita. <a href="' + esc(videoPageUrl(v)) + '" target="_blank" rel="noopener noreferrer">Abrir no YouTube</a></figcaption></figure>';
    }

    /* ---------- Fórmulas (JB Educa) ----------
       Um subconjunto de LaTeX vira MathML, que o próprio navegador desenha (sem biblioteca externa):
       \frac{a}{b}, \sqrt{x}, \sqrt[n]{x}, x^2, x_1, x^{n+1}, \pm, \times, \cdot, \le, \ge, \neq,
       \Delta e outras letras gregas, \text{…}, \left( \right), \sin, \log… Tudo é escapado; o que
       não for reconhecido aparece como texto. No texto da matéria:
         bloco "$$ fórmula"  -> fórmula em destaque (linha própria)
         "$$fórmula$$"       -> fórmula no meio da frase
         bloco "?? enunciado\n=> resposta" -> exercício numerado com a resposta escondida */
    const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω',
        Delta: 'Δ', Gamma: 'Γ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω' };
    const MATH_OPS = { pm: '±', mp: '∓', times: '×', cdot: '·', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', infty: '∞',
        to: '→', rightarrow: '→', Rightarrow: '⇒', Leftrightarrow: '⇔', iff: '⇔', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
        circ: '∘', degree: '°', angle: '∠', perp: '⊥', parallel: '∥', ldots: '…', cdots: '⋯', sum: '∑', prod: '∏', int: '∫', partial: '∂', percent: '%' };
    const MATH_FUNCS = ['sin', 'cos', 'tan', 'sen', 'tg', 'cotg', 'sec', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'mdc', 'mmc'];
    function texToMathML(tex, display) {
        const src = String(tex == null ? '' : tex).slice(0, 2000);
        let i = 0, depth = 0;
        const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
        const wrap = x => x || '<mrow></mrow>';
        function rawArg() {
            ws();
            if (src[i] !== '{') return src[i++] || '';
            let d = 0, s = ''; i++;
            while (i < src.length) { const ch = src[i++]; if (ch === '{') d++; else if (ch === '}') { if (!d) break; d--; } s += ch; }
            return s;
        }
        function arg() {
            ws();
            if (src[i] === '{') { i++; const s = seq('}'); if (src[i] === '}') i++; return '<mrow>' + s + '</mrow>'; }
            return wrap(atom());
        }
        function atom() {
            ws();
            const c = src[i];
            if (c === undefined) return '';
            if (c === '{') { i++; const s = seq('}'); if (src[i] === '}') i++; return '<mrow>' + s + '</mrow>'; }
            if (c === '}') { i++; return ''; }
            if (c === '\\') {
                i++;
                const m = /^[A-Za-z]+/.exec(src.slice(i));
                if (!m) {
                    const ch = src[i++] || '';
                    if (',;: '.includes(ch)) return '<mspace width="0.25em"></mspace>';
                    if (ch === '!' || ch === '') return '';
                    if (ch === '\\') return '<mspace linebreak="newline"></mspace>';
                    return '<mo>' + esc(ch) + '</mo>';
                }
                const name = m[0]; i += name.length;
                if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = arg(), b = arg(); return '<mfrac>' + a + b + '</mfrac>'; }
                if (name === 'sqrt') {
                    ws();
                    if (src[i] === '[') { i++; const n = seq(']'); if (src[i] === ']') i++; const b = arg(); return '<mroot>' + b + '<mrow>' + n + '</mrow></mroot>'; }
                    return '<msqrt>' + arg() + '</msqrt>';
                }
                if (name === 'text' || name === 'mathrm' || name === 'textrm' || name === 'textbf') return '<mtext>' + esc(rawArg()) + '</mtext>';
                if (name === 'left' || name === 'right') { ws(); let d = src[i++] || ''; if (d === '\\') d = src[i++] || ''; return d === '.' ? '' : '<mo>' + esc(d) + '</mo>'; }
                if (name === 'overline' || name === 'bar') return '<mover accent="true">' + arg() + '<mo>‾</mo></mover>';
                if (name === 'vec') return '<mover accent="true">' + arg() + '<mo>→</mo></mover>';
                if (name === 'quad') return '<mspace width="1em"></mspace>';
                if (name === 'qquad') return '<mspace width="2em"></mspace>';
                if (GREEK[name]) return '<mi>' + GREEK[name] + '</mi>';
                if (MATH_OPS[name]) return '<mo>' + MATH_OPS[name] + '</mo>';
                if (MATH_FUNCS.includes(name)) return '<mi>' + name + '</mi>';
                return '<mtext>' + esc('\\' + name) + '</mtext>';
            }
            const num = /^[0-9]+(?:[.,][0-9]+)*/.exec(src.slice(i));
            if (num) { i += num[0].length; return '<mn>' + esc(num[0]) + '</mn>'; }
            i++;
            if (/[A-Za-z]/.test(c)) return '<mi>' + c + '</mi>';
            if (c === '-') return '<mo>−</mo>';
            if (c === '*') return '<mo>·</mo>';
            if (c === "'") return '<mo>′</mo>';
            return /\p{L}/u.test(c) ? '<mi>' + esc(c) + '</mi>' : '<mo>' + esc(c) + '</mo>';
        }
        function seq(end) {
            let out = '';
            if (++depth > 40) { depth--; i = src.length; return ''; }
            while (i < src.length) {
                ws();
                if (i >= src.length || (end && src[i] === end)) break;
                let base = atom(), sub = null, sup = null;
                for (; ;) {
                    ws();
                    if (src[i] === '^' && sup === null) { i++; sup = arg(); }
                    else if (src[i] === '_' && sub === null) { i++; sub = arg(); }
                    else break;
                }
                if (sub !== null && sup !== null) base = '<msubsup>' + wrap(base) + sub + sup + '</msubsup>';
                else if (sup !== null) base = '<msup>' + wrap(base) + sup + '</msup>';
                else if (sub !== null) base = '<msub>' + wrap(base) + sub + '</msub>';
                out += base;
            }
            depth--;
            return out;
        }
        const body = seq('');
        return '<math' + (display ? ' display="block"' : '') + '><semantics><mrow>' + body + '</mrow><annotation encoding="application/x-tex">' + esc(src) + '</annotation></semantics></math>';
    }
    // O editor guarda a fórmula com as barras escapadas ("\\frac"), como o resto do texto
    const unescTex = s => String(s || '').replace(/\\([\\*[\]()#>.$?-])/g, '$1');
    const MATH_MARK = String.fromCharCode(0xE010);
    const INLINE_MATH = /\$\$([^$\n]{1,500}?)\$\$/g;

    /* ---------- Texto da matéria com formatação ----------
       Cada item de `body` é um bloco de texto (o banco continua com uma lista de strings):
         "## Intertítulo", "### Subtítulo menor", "> Citação", "- item" (lista), "1. item" (lista numerada)
         ou um parágrafo. Dentro do bloco: **negrito**, *itálico*, [texto](https://link). "\*" = asterisco literal.
       Tudo é escapado antes de virar HTML; links só http/https. Matérias antigas (texto puro) aparecem iguais. */
    const MD_ESC = { '\\': '\uE000', '*': '\uE001', '[': '\uE002', ']': '\uE003', '(': '\uE004', ')': '\uE005', '#': '\uE006', '>': '\uE007', '-': '\uE008', '.': '\uE009', '$': '\uE00A', '?': '\uE00B' };
    const MD_UNESC = Object.keys(MD_ESC).reduce((o, k) => { o[MD_ESC[k]] = k; return o; }, {});
    const hideEscapes = s => s.replace(/\\([\\*[\]()#>.$?-])/g, (m, c) => MD_ESC[c]);
    const showEscapes = s => s.replace(/[\uE000-\uE00B]/g, c => MD_UNESC[c]);
    function inlineHTML(text) {
        const maths = [];
        let s = String(text == null ? '' : text).replace(INLINE_MATH, (m, t) => { maths.push(texToMathML(unescTex(t), false)); return MATH_MARK + (maths.length - 1) + MATH_MARK; });
        s = esc(hideEscapes(s));
        s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)*]+)\)/g, (m, t, u) => '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + t + '</a>');
        s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>');
        s = s.replace(/\*(?=[^\s*])([^*\s])\*/g, '<em>$1</em>');
        s = showEscapes(s).replace(/\n/g, '<br>');   // quebra de linha dentro do bloco (Shift+Enter no editor)
        return maths.length ? s.replace(new RegExp(MATH_MARK + '(\\d+)' + MATH_MARK, 'g'), (m, k) => maths[k] || '') : s;
    }
    // Imagem no meio do texto: bloco "![legenda](endereço)". Só https://, imagem da galeria do site
    // ou data URL de imagem (modo local). A legenda é texto puro (colchetes escapados com \).
    const IMG_BLOCK = /^!\[((?:\\[\s\S]|[^\]\\\n])*)\]\((https:\/\/[^\s()]+|assets\/img\/[\w.-]+|data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+)\)$/;
    const imgBlock = (src, caption) => '![' + String(caption || '').replace(/\s+/g, ' ').trim().replace(/([\\\]\[])/g, '\\$1') + '](' + src + ')';
    // Tipo do bloco: {type: 'p'|'h2'|'h3'|'quote'|'ul'|'ol'|'img', text (, src)}
    function blockOf(raw) {
        const s = String(raw == null ? '' : raw);
        let m;
        if ((m = IMG_BLOCK.exec(s)) && safeImg(m[2])) return { type: 'img', src: m[2], text: m[1].replace(/\\([\s\S])/g, '$1') };
        if ((m = /^\$\$\s+([\s\S]+)$/.exec(s)) && !/\$\$/.test(m[1].replace(/\s*\$\$\s*$/, ''))) return { type: 'math', text: unescTex(m[1].replace(/\s*\$\$\s*$/, '')) };
        if ((m = /^\?\?\s+([\s\S]+)$/.exec(s))) { const k = m[1].search(/\n=>\s?/); return { type: 'exercise', text: k < 0 ? m[1] : m[1].slice(0, k), answer: k < 0 ? '' : m[1].slice(k).replace(/^\n=>\s?/, '') }; }
        if ((m = /^###\s+([\s\S]+)$/.exec(s))) return { type: 'h3', text: m[1] };
        if ((m = /^##\s+([\s\S]+)$/.exec(s))) return { type: 'h2', text: m[1] };
        if ((m = /^>\s?([\s\S]+)$/.exec(s))) return { type: 'quote', text: m[1] };
        if ((m = /^[-•]\s+([\s\S]+)$/.exec(s))) return { type: 'ul', text: m[1] };
        if ((m = /^\d{1,3}[.)]\s+([\s\S]+)$/.exec(s))) return { type: 'ol', text: m[1] };
        return { type: 'p', text: s };
    }
    // Texto sem marcação (busca, tempo de leitura, resumos)
    const plainText = raw => blockOf(raw).type === 'img' || blockOf(raw).type === 'math' ? blockOf(raw).text : showEscapes(hideEscapes(blockOf(raw).text.replace(INLINE_MATH, '$1')).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)*]+)\)/g, '$1').replace(/\*\*|\*/g, '').replace(/\n/g, ' '));
    // opts.interview: parágrafos "P:" / "R:" viram pergunta e resposta (entrevistas)
    function bodyHTML(blocks, opts) {
        opts = opts || {};
        let html = '', list = null, exN = 0;
        const close = () => { if (list) { html += '</' + list + '>'; list = null; } };
        (blocks || []).forEach(raw => {
            const b = blockOf(raw);
            if (b.type === 'ul' || b.type === 'ol') {
                if (list !== b.type) { close(); html += '<' + b.type + '>'; list = b.type; }
                html += '<li>' + inlineHTML(b.text) + '</li>';
                return;
            }
            close();
            if (b.type === 'img') {
                const src = /^(https:|data:)/i.test(b.src) ? b.src : root() + b.src;
                html += '<figure class="body-figure" data-src="' + esc(b.src) + '"><img src="' + esc(src) + '" alt="' + esc(b.text) + '" loading="lazy" decoding="async">' +
                    (b.text ? '<figcaption>' + esc(b.text) + '</figcaption>' : '') + '</figure>';
                return;
            }
            if (b.type === 'math') { html += '<div class="body-math">' + texToMathML(b.text, true) + '</div>'; return; }
            if (b.type === 'exercise') {
                exN++;
                html += '<div class="body-exercise"><p class="exercise-q"><span class="exercise-n">Exercício ' + exN + '</span> ' + inlineHTML(b.text) + '</p>' +
                    (b.answer ? '<details class="exercise-a"><summary>Ver resposta</summary><div>' + inlineHTML(b.answer) + '</div></details>' : '') + '</div>';
                return;
            }
            const qa = opts.interview && b.type === 'p' &&/^\s*([PR])\s*[:\-–—]\s*([\s\S]*)$/.exec(b.text);
            if (qa) html += qa[1] === 'P' ? '<p class="qa-q"><span class="qa-tag">JB</span><span>' + inlineHTML(qa[2]) + '</span></p>' : '<p class="qa-a">' + inlineHTML(qa[2]) + '</p>';
            else if (b.type === 'h2' || b.type === 'h3') html += '<' + b.type + '>' + inlineHTML(b.text) + '</' + b.type + '>';
            else if (b.type === 'quote') html += '<blockquote><p>' + inlineHTML(b.text) + '</p></blockquote>';
            else html += '<p>' + inlineHTML(b.text) + '</p>';
        });
        close();
        return html;
    }

    /* ---------- Gráficos ----------
       chart: {type, title, unit, source, items:[{label, value}]}. Uma série. Os valores sempre aparecem
       escritos (não dependem da cor) e há uma tabela equivalente para leitor de tela e impressão. */
    const CHART_TYPES = { bar: 'Barras horizontais', column: 'Colunas', line: 'Linha', area: 'Área', donut: 'Rosca (partes de um todo)' };
    const CHART_COLORS = 12;   // cores --chart-1 … --chart-12 em style.css (rosca)
    const fmtNum = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    function chartItems(c) {
        const items = ((c && c.items) || []).filter(i => i && String(i.label || '').trim() && isFinite(Number(i.value)) && String(i.value) !== '');
        return (c && c.type === 'donut') ? items.filter(i => Number(i.value) > 0) : items;
    }
    function barsHTML(c, items) {
        const max = Math.max.apply(null, items.map(i => Math.abs(Number(i.value)))) || 1;
        return '<div class="jb-chart-bars">' + items.map(i => {
            const pct = Math.max(1, Math.round(Math.abs(Number(i.value)) / max * 100));
            return '<div class="jb-bar-row"><span class="jb-bar-label">' + esc(i.label) + '</span>' +
                '<span class="jb-bar-track"><span class="jb-bar' + (Number(i.value) < 0 ? ' is-negative' : '') + '" style="width:' + pct + '%"></span></span><span class="jb-bar-value">' + esc(fmtNum(i.value)) + '</span></div>';
        }).join('') + '</div>';
    }
    // Escala vertical comum a colunas, linha e área (inclui o zero)
    function scaleOf(items) {
        const vals = items.map(i => Number(i.value));
        let min = Math.min(0, Math.min.apply(null, vals)), max = Math.max(0, Math.max.apply(null, vals));
        if (max === min) max = min + 1;
        return v => (Number(v) - min) / (max - min);   // 0 (base) … 1 (topo)
    }
    function columnsHTML(c, items) {
        const s = scaleOf(items), zero = s(0);
        return '<div class="jb-cols" style="--n:' + items.length + ';--zero:' + (zero * 100).toFixed(2) + '%">' + items.map(i => {
            const a = s(i.value), lo = Math.min(a, zero), hi = Math.max(a, zero);
            return '<div class="jb-col"><span class="jb-col-plot"><span class="jb-col-bar' + (Number(i.value) < 0 ? ' is-negative' : '') + '" style="bottom:' + (lo * 100).toFixed(2) + '%;height:' + Math.max(0.6, (hi - lo) * 100).toFixed(2) + '%">' +
                '<span class="jb-col-value">' + esc(fmtNum(i.value)) + '</span></span></span><span class="jb-col-label">' + esc(i.label) + '</span></div>';
        }).join('') + '</div>';
    }
    // Linha/área: o traço é um SVG esticado (preserveAspectRatio none); pontos e textos são HTML,
    // posicionados em %, para não encolherem no celular.
    function lineHTML(c, items, area) {
        const s = scaleOf(items), n = items.length;
        const x = i => (i + 0.5) / n * 100, y = v => 92 - s(v) * 84;
        const pts = items.map((it, i) => x(i).toFixed(2) + ',' + y(it.value).toFixed(2));
        const base = y(0).toFixed(2);
        const shape = area ? '<polygon class="jb-area" points="' + x(0).toFixed(2) + ',' + base + ' ' + pts.join(' ') + ' ' + x(n - 1).toFixed(2) + ',' + base + '"/>' : '';
        return '<div class="jb-line' + (area ? ' is-area' : '') + '" style="--n:' + n + '"><div class="jb-line-plot">' +
            '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><line class="jb-line-zero" x1="0" x2="100" y1="' + base + '" y2="' + base + '" vector-effect="non-scaling-stroke"/>' +
            shape + '<polyline class="jb-line-path" points="' + pts.join(' ') + '" vector-effect="non-scaling-stroke"/></svg>' +
            items.map((it, i) => '<span class="jb-pt" style="left:' + x(i).toFixed(2) + '%;top:' + y(it.value).toFixed(2) + '%"><span class="jb-pt-value">' + esc(fmtNum(it.value)) + '</span></span>').join('') +
            '</div><div class="jb-line-labels">' + items.map(it => '<span>' + esc(it.label) + '</span>').join('') + '</div></div>';
    }
    // Rosca: conic-gradient com um pequeno vão entre as fatias; legenda com valor e porcentagem.
    function donutHTML(c, items) {
        const total = items.reduce((t, i) => t + Number(i.value), 0) || 1;
        let acc = 0;
        const gap = items.length > 1 ? 0.6 : 0;   // graus
        const stops = items.map((it, i) => {
            const a = acc / total * 360, b = (acc += Number(it.value)) / total * 360, col = 'var(--chart-' + (i % CHART_COLORS + 1) + ')';
            return 'transparent ' + a.toFixed(2) + 'deg ' + (a + gap).toFixed(2) + 'deg,' + col + ' ' + (a + gap).toFixed(2) + 'deg ' + Math.max(a + gap, b - gap).toFixed(2) + 'deg,transparent ' + Math.max(a + gap, b - gap).toFixed(2) + 'deg ' + b.toFixed(2) + 'deg';
        });
        const pct = v => (Number(v) / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
        return '<div class="jb-donut"><div class="jb-donut-figure"><span class="jb-donut-ring" style="background:conic-gradient(' + stops.join(',') + ')"></span>' +
            '<span class="jb-donut-total"><strong>' + esc(fmtNum(total)) + '</strong>' + (c.unit ? '<small>' + esc(c.unit) + '</small>' : '<small>total</small>') + '</span></div>' +
            '<ul class="jb-donut-legend">' + items.map((it, i) => '<li><span class="jb-swatch" style="background:var(--chart-' + (i % CHART_COLORS + 1) + ')"></span><span class="jb-donut-label">' + esc(it.label) + '</span>' +
                '<span class="jb-donut-value">' + esc(fmtNum(it.value)) + ' <small>(' + pct(it.value) + ')</small></span></li>').join('') + '</ul></div>';
    }
    function chartHTML(c) {
        const items = chartItems(c);
        if (!items.length) return '';
        const type = CHART_TYPES[c.type] ? c.type : 'bar';
        const unit = c.unit ? ' ' + esc(c.unit) : '';
        const visual = type === 'column' ? columnsHTML(c, items) : type === 'line' ? lineHTML(c, items) : type === 'area' ? lineHTML(c, items, true) : type === 'donut' ? donutHTML(c, items) : barsHTML(c, items);
        return '<figure class="jb-chart jb-chart-' + type + '">' + (c.title ? '<figcaption class="jb-chart-title">' + esc(c.title) + (c.unit ? ' <span class="jb-chart-unit">(' + esc(c.unit) + ')</span>' : '') + '</figcaption>' : '') +
            '<div class="jb-chart-visual" aria-hidden="true">' + visual + '</div>' +
            '<details class="jb-chart-table"><summary>Ver dados em tabela</summary><table class="table table-sm mb-0"><thead><tr><th scope="col">Item</th><th scope="col" class="text-end">Valor' + unit + '</th></tr></thead><tbody>' +
            items.map(i => '<tr><td>' + esc(i.label) + '</td><td class="text-end">' + esc(fmtNum(i.value)) + '</td></tr>').join('') + '</tbody></table></details>' +
            (c.source ? '<p class="jb-chart-source">Fonte: ' + esc(c.source) + '</p>' : '') + '</figure>';
    }
    const barChartHTML = c => chartHTML(Object.assign({}, c, { type: 'bar' }));   // painel (Audiência)

    // Estados de carregamento e de erro padronizados (usados em todas as páginas)
    const loadingHTML = text => '<div class="jb-loading" role="status"><span class="jb-spinner" aria-hidden="true"></span>' + esc(text || 'Carregando…') + '</div>';
    const errorHTML = text => '<div class="alert alert-warning" role="alert">' + esc(text || 'Não foi possível carregar o conteúdo agora. Verifique sua conexão e tente novamente.') +
        ' <button type="button" class="btn btn-sm btn-outline-dark ms-2" data-jb-reload>Tentar de novo</button></div>';   // o clique é tratado em layout.js (CSP sem script inline)

    // Gravações: no modo local são síncronas; `flush()` devolve se a última leva foi salva de fato.
    const flush = () => Promise.resolve(storageOk);

    // CAPTCHA (Cloudflare Turnstile): só existe no modo Supabase (supabase-backend.js). Aqui não faz nada.
    const Captcha = { enabled: false, mount() { return { token: () => Promise.resolve(''), reset() { } }; } };
    // Central de Segurança do painel: só no modo Supabase.
    const Security = { overview: () => Promise.resolve(null), audit: () => Promise.resolve(null) };

    if (!remote) { seed(); Badges.load(); }   // no modo Supabase os dados vêm do servidor
    window.JB = {
        remote, mode: 'local', ready: Promise.resolve(), authReady: Promise.resolve(), loadError: null, flush, storageOk: () => storageOk, PASSWORD_MIN, MIN_AGE, KEYS, Captcha, Security,
        CATEGORIES, KINDS, SUBJECTS, EDUCA_KINDS, ALL_CATEGORIES, ALL_KINDS, DIVISIONS, VERDICTS, OPINION_KINDS, VERSIONED, IMAGES, STATUS, STATUS_FLOW, ROLES, STAFF_ROLES, JOURNALIST_STATUSES,
        BADGES, BADGE_COLORS, DEFAULT_PLACE,
        CHART_TYPES, News, Authors, Versions, Auth, Members, Reports, Cookies, Views, Favs, History, Comments, Newsletter, Theme, A11y, Media, Drafts, Site,
        Tags, Badges, Follows, Notifications, Push, Visits, Ext,
        _internal: { setBadgeCatalog, lastDays, newVisitorToday, todaySP },
        util: { isPublished, isScheduled, withDefaults, changeKind, wasUpdated, avatarHTML, readingTime, root, esc, imgSrc, safeImg, timeAgo, fmtDate, articleUrl, authorUrl, profileUrl, roleLabel, isStaffRole, sealHTML, officialSealHTML, badgeSpan, profileBadgesHTML, newsBadgesHTML, catLabel, catUrl, catTag, kindLabel, safeUrl, verdictBadge, liveBadge, badgesHTML, newsCard,
            bylineNames, bylineHTML, creditNames, creditsHTML, sameName, tagsHTML, tagUrl, slugify, greeting, divisionOf, texToMathML, chartHTML, barChartHTML, chartItems, parseVideo, videoHTML, videoPageUrl, inlineHTML, blockOf, imgBlock, bodyHTML, plainText, loadingHTML, errorHTML, passwordIssues, ageFrom }
    };
})();
