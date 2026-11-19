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

    const KEYS = { news: 'jb_news', users: 'jb_users', session: 'jb_session', reports: 'jb_reports', cookies: 'jb_cookies', views: 'jb_views', favs: 'jb_favs', history: 'jb_history', comments: 'jb_comments', newsletter: 'jb_newsletter', theme: 'jb_theme', authors: 'jb_authors', versions: 'jb_versions', a11y: 'jb_a11y', seed: 'jb_seed' };

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
    const PASSWORD_MIN = 6;   // igual ao mínimo do Supabase Auth (Authentication > Policies)
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
    // Agendamento: "publicada" com data no futuro só aparece quando a data chega.
    const isScheduled = n => (!n.status || n.status === 'publicada') && !!n.date && new Date(n.date) > Date.now();
    const isPublished = n => (!n.status || n.status === 'publicada') && !isScheduled(n);   // dados antigos (sem status) contam como publicados
    // Campos novos com valor padrão (matérias antigas não têm)
    const EXTRA_ARRAYS = ['sources', 'corrections', 'updates', 'timeline', 'people'];
    function withDefaults(n) {
        if (!n) return n;
        if (!n.kind) n.kind = 'noticia';
        EXTRA_ARRAYS.forEach(k => { if (!Array.isArray(n[k])) n[k] = []; });
        if (!Array.isArray(n.body)) n.body = [];
        if (n.chart === undefined) n.chart = null;
        if (n.verdict === undefined) n.verdict = null;
        if (n.updated_at === undefined) n.updated_at = null;
        n.live = !!n.live;
        return n;
    }
    // Campos cuja mudança gera uma nova versão (mesma lista do gatilho news_track_changes no banco)
    const VERSIONED = ['title', 'subtitle', 'body', 'image', 'author', 'category', 'kind', 'verdict', 'sources', 'timeline', 'people', 'chart'];
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

    // Hash simples SOMENTE para simulação (não é seguro para produção)
    function hash(text) {
        let h = 5381;
        for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
        return 'h' + h.toString(16);
    }

    /* ---------- Seed (executa só se as chaves ainda não existem) ---------- */
    function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

    /* Exemplos das seções editoriais (o mesmo conteúdo está em supabase/06_exemplos_secoes.sql) */
    const SEED_VERSION = 2;
    const SAMPLE_AUTHORS = [
        { name: 'Redação JB', role: 'Equipe de reportagem', bio: 'Equipe de reportagem geral do Jornal Brasileiro.', columnist: false },
        { name: 'Redação Investigativa JB', role: 'Núcleo de investigação', bio: 'Núcleo responsável pelas reportagens investigativas e pela análise de documentos públicos.', columnist: false },
        { name: 'Conselho Editorial JB', role: 'Editorial', bio: 'Assina os editoriais, que expressam a posição institucional do jornal.', columnist: false },
        { name: 'Núcleo de Verificação JB', role: 'Verificação de fatos', bio: 'Checa declarações públicas, conteúdos virais e dados oficiais, com metodologia publicada.', columnist: false },
        { name: 'Helena Prado', role: 'Colunista de Economia', bio: 'Personagem fictícia. Escreve às terças sobre juros, emprego e orçamento das famílias.', columnist: true },
        { name: 'Rafael Monteiro', role: 'Analista político', bio: 'Personagem fictício. Acompanha o Congresso e as negociações do governo.', columnist: true },
        { name: 'Carla Nunes', role: 'Repórter de Tecnologia & Ciência', bio: 'Personagem fictícia. Cobre dados abertos, inteligência artificial e governo digital.', columnist: false }
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
                { kind: 'checagem', verdict: 'verdadeiro', author: 'Núcleo de Verificação JB' })
        ];
    }

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
            store.set(KEYS.seed, String(SEED_VERSION));
        }
        // Demonstrações criadas antes das seções novas: acrescenta só os exemplos novos, uma vez.
        if (Number(store.get(KEYS.seed) || 1) < SEED_VERSION) {
            const list = read(KEYS.news, []);
            const titles = new Set(list.map(x => x.title));
            const add = sectionSamples((category, title, subtitle, image, minutes, body, extra) => Object.assign({ id: uid() + category.slice(0, 2), category, title, subtitle, image, author: 'Redação JB', date: minutesAgo(minutes), featured: false, body }, extra || {}));
            write(KEYS.news, list.concat(add.filter(x => !titles.has(x.title))));
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

    const News = {
        everything() { return read(KEYS.news, []).map(withDefaults).sort((a, b) => new Date(b.date) - new Date(a.date)); },   // painel: todos os status
        all() { return News.everything().filter(isPublished); },                                                      // leitores: só publicadas
        get(id) { return withDefaults(read(KEYS.news, []).find(x => x.id === id) || null); },
        save(item) {
            const list = read(KEYS.news, []);
            const i = list.findIndex(x => x.id === item.id);
            if (i >= 0) {
                const change = changeKind(withDefaults(list[i]), item);
                if (change === 'version') {   // guarda a versão anterior (20 últimas)
                    const all = read(KEYS.versions, {}), me = Auth.current();
                    all[item.id] = [{ id: uid(), replacedAt: new Date().toISOString(), replacedBy: me ? me.name : '', snapshot: snapshotOf(list[i]) }].concat(all[item.id] || []).slice(0, 20);
                    write(KEYS.versions, all);
                }
                if (change) item.updated_at = new Date().toISOString();
                list[i] = Object.assign(list[i], item);
            } else { item.id = uid(); item.date = item.date || new Date().toISOString(); item.updated_at = null; list.push(item); }
            write(KEYS.news, list);
            return item;
        },
        remove(id) {
            write(KEYS.news, read(KEYS.news, []).filter(x => x.id !== id));
            const v = read(KEYS.versions, {}); if (v[id]) { delete v[id]; write(KEYS.versions, v); }
        },
        byCategory(cat) { return News.all().filter(x => x.category === cat); },
        byKind(kinds) { kinds = [].concat(kinds); return News.all().filter(x => kinds.includes(x.kind || 'noticia')); },
        byAuthor(name) { return News.all().filter(x => x.author === name); },
        // Relê uma matéria do servidor (cobertura ao vivo). No modo local, lê de novo o navegador.
        refresh() { return Promise.resolve(true); },
        search(q) {
            q = q.toLowerCase();
            return News.all().filter(x => (x.title + ' ' + x.subtitle + ' ' + x.author + ' ' + x.body.join(' ') + ' ' + x.updates.map(u => u.text).join(' ')).toLowerCase().includes(q));
        }
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
        register({ name, email, password }) {
            email = email.trim().toLowerCase();
            const users = Auth.users();
            if (users.some(u => u.email === email)) return { ok: false, error: 'Já existe uma conta com este e-mail.' };
            const user = { id: uid(), name: name.trim(), email, pass: hash(email + 'i' + password), role: 'leitor', bio: '', city: '', interests: [], created: new Date().toISOString() };
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
        async updatePassword() { return { ok: false, error: 'A recuperação de senha por e-mail só funciona com o Supabase configurado.' }; }
    };

    /* ---------- Denúncias / pautas ---------- */
    const Reports = {
        all() { return read(KEYS.reports, []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },
        add(r) { const list = read(KEYS.reports, []); r.id = uid(); r.date = new Date().toISOString(); list.push(r); write(KEYS.reports, list); return r; },
        remove(id) { write(KEYS.reports, read(KEYS.reports, []).filter(r => r.id !== id)); },
        load() { return Promise.resolve(true); }   // no Supabase baixa as denúncias só no painel
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
    const readingTime = n => Math.max(1, Math.round(n.body.join(' ').split(/\s+/).length / 200));

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
        add(id) { write(KEYS.history, [id].concat(read(KEYS.history, []).filter(x => x !== id)).slice(0, 30)); },
        clear() { write(KEYS.history, []); }
    };
    const Comments = {
        forNews(id) { return (read(KEYS.comments, {})[id] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },
        add(id, c) { const all = read(KEYS.comments, {}); (all[id] = all[id] || []).push({ id: uid(), name: c.name, text: c.text, date: new Date().toISOString() }); write(KEYS.comments, all); },
        remove(newsId, cid) { const all = read(KEYS.comments, {}); all[newsId] = (all[newsId] || []).filter(c => c.id !== cid); write(KEYS.comments, all); },
        flat() { const all = read(KEYS.comments, {}); return Object.keys(all).flatMap(id => all[id].map(c => Object.assign({ newsId: id }, c))).sort((a, b) => new Date(b.date) - new Date(a.date)); },
        load() { return Promise.resolve(true); }   // no Supabase baixa só os comentários da matéria aberta
    };
    const Newsletter = {
        count() { return read(KEYS.newsletter, []).length; },
        add(email) { email = email.trim().toLowerCase(); const l = read(KEYS.newsletter, []); if (l.includes(email)) return false; l.push(email); write(KEYS.newsletter, l); return true; },
        load() { return Promise.resolve(true); }
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
    // Acessibilidade: tamanho do texto (0 = normal … 3 = maior) e alto contraste. Aplicado antes
    // da página aparecer pelo script inline do <head> (mesma chave jb_a11y).
    const A11y = {
        get() { const a = read(KEYS.a11y, {}) || {}; return { font: Math.max(0, Math.min(3, Number(a.font) || 0)), contrast: !!a.contrast }; },
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
        }
    };

    /* ---------- Cookies (LGPD) ---------- */
    const Cookies = {
        get() { return read(KEYS.cookies, null); },
        set(prefs) { write(KEYS.cookies, Object.assign({ essential: true, analytics: false, date: new Date().toISOString() }, prefs)); }
    };

    /* ---------- Utilitários ---------- */
    const root = () => document.body.dataset.root || '';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const imgSrc = n => { const src = n.image || FALLBACK_IMG[n.category] || ''; return /^(https?:|data:)/.test(src) ? src : root() + src; };
    function timeAgo(iso) {
        const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
        if (m < 60) return 'Há ' + m + ' min';
        const h = Math.round(m / 60); if (h < 24) return 'Há ' + h + (h === 1 ? ' hora' : ' horas');
        const d = Math.round(h / 24); return 'Há ' + d + (d === 1 ? ' dia' : ' dias');
    }
    const fmtDate = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
    const articleUrl = n => root() + 'pages/noticia.html?id=' + encodeURIComponent(n.id);
    const catLabel = c => (CATEGORIES[c] ? CATEGORIES[c].label : c);
    const catUrl = c => root() + (CATEGORIES[c] ? CATEGORIES[c].page : 'pages/noticias.html');

    // Avatar do usuário: foto (data URL) ou inicial do nome sobre fundo carmim
    const avatarHTML = (u, cls) => '<span class="avatar ' + (cls || '') + '" data-avatar>' +
        (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : esc((u.name || '?').trim().charAt(0).toUpperCase())) + '</span>';

    const kindLabel = k => KINDS[k] || KINDS.noticia;
    const authorUrl = name => root() + 'pages/autor.html?nome=' + encodeURIComponent(name || '');
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
        return parts.length ? '<div class="card-badges">' + parts.join('') + '</div>' : '';
    }
    // Data de atualização: só aparece se for depois da publicação (edição, correção ou nova atualização ao vivo).
    const wasUpdated = n => !!n.updated_at && new Date(n.updated_at) - new Date(n.date) > 60000;

    function newsCard(n) {
        const byline = OPINION_KINDS.includes(n.kind) || n.kind === 'entrevista' ? '<span class="card-author">Por ' + esc(n.author) + '</span>' : '';
        return '<article class="news-card">' +
            '<img class="card-thumb" loading="lazy" src="' + esc(imgSrc(n)) + '" alt="' + esc(n.title) + '">' +
            badgesHTML(n) +
            '<a class="category-tag" href="' + esc(catUrl(n.category)) + '">' + esc(catLabel(n.category)) + '</a>' +
            '<h3><a href="' + esc(articleUrl(n)) + '">' + esc(n.title) + '</a></h3>' +
            '<p>' + esc(n.subtitle) + '</p>' + byline + '<span class="time">' + timeAgo(n.date) + '</span></article>';
    }

    // Gráfico de barras horizontais (uma série, cor única). Valores sempre escritos ao lado da barra
    // e tabela equivalente para leitores de tela / impressão. items: [{label, value}]
    function barChartHTML(c) {
        const items = ((c && c.items) || []).filter(i => i && String(i.label || '').trim() && isFinite(Number(i.value)));
        if (!items.length) return '';
        const max = Math.max.apply(null, items.map(i => Math.abs(Number(i.value)))) || 1;
        const fmt = v => Number(v).toLocaleString('pt-BR');
        const unit = c.unit ? ' ' + esc(c.unit) : '';
        return '<figure class="jb-chart">' + (c.title ? '<figcaption class="jb-chart-title">' + esc(c.title) + '</figcaption>' : '') +
            '<div class="jb-chart-bars" aria-hidden="true">' + items.map(i => {
                const pct = Math.max(1, Math.round(Math.abs(Number(i.value)) / max * 100));
                return '<div class="jb-bar-row" title="' + esc(i.label) + ': ' + esc(fmt(i.value)) + esc(c.unit ? ' ' + c.unit : '') + '"><span class="jb-bar-label">' + esc(i.label) + '</span>' +
                    '<span class="jb-bar-track"><span class="jb-bar" style="width:' + pct + '%"></span></span><span class="jb-bar-value">' + esc(fmt(i.value)) + '</span></div>';
            }).join('') + '</div>' +
            '<details class="jb-chart-table"><summary>Ver dados em tabela</summary><table class="table table-sm mb-0"><thead><tr><th scope="col">Item</th><th scope="col" class="text-end">Valor' + unit + '</th></tr></thead><tbody>' +
            items.map(i => '<tr><td>' + esc(i.label) + '</td><td class="text-end">' + esc(fmt(i.value)) + '</td></tr>').join('') + '</tbody></table></details>' +
            (c.source ? '<p class="jb-chart-source">Fonte: ' + esc(c.source) + '</p>' : '') + '</figure>';
    }

    // Estados de carregamento e de erro padronizados (usados em todas as páginas)
    const loadingHTML = text => '<div class="jb-loading" role="status"><span class="jb-spinner" aria-hidden="true"></span>' + esc(text || 'Carregando…') + '</div>';
    const errorHTML = text => '<div class="alert alert-warning" role="alert">' + esc(text || 'Não foi possível carregar o conteúdo agora. Verifique sua conexão e tente novamente.') +
        ' <button type="button" class="btn btn-sm btn-outline-dark ms-2" data-jb-reload>Tentar de novo</button></div>';   // o clique é tratado em layout.js (CSP sem script inline)

    // Gravações: no modo local são síncronas; `flush()` devolve se a última leva foi salva de fato.
    const flush = () => Promise.resolve(storageOk);

    if (!remote) seed();   // no modo Supabase os dados vêm do servidor
    window.JB = {
        remote, mode: 'local', ready: Promise.resolve(), authReady: Promise.resolve(), loadError: null, flush, storageOk: () => storageOk, PASSWORD_MIN, KEYS,
        CATEGORIES, KINDS, VERDICTS, OPINION_KINDS, VERSIONED, IMAGES, STATUS, STATUS_FLOW, News, Authors, Versions, Auth, Reports, Cookies, Views, Favs, History, Comments, Newsletter, Theme, A11y, Media,
        util: { isPublished, isScheduled, withDefaults, changeKind, wasUpdated, avatarHTML, readingTime, root, esc, imgSrc, timeAgo, fmtDate, articleUrl, authorUrl, catLabel, catUrl, kindLabel, safeUrl, verdictBadge, liveBadge, badgesHTML, newsCard, barChartHTML, loadingHTML, errorHTML }
    };
})();
