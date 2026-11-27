-- =====================================================================
-- JB — Exemplos das seções editoriais (autores e matérias fictícias)
-- Opcional. Rode depois do 05_secoes_editoriais.sql (ou do 01_schema.sql numa instalação nova).
-- A parte 2 (JB Educa e tags, no fim) só roda se o 11_divisoes_tags_notificacoes.sql já estiver aplicado.
-- Mesmo conteúdo do modo de demonstração local (gerado a partir de assets/js/storage.js).
-- Pode ser rodado mais de uma vez: não duplica autores nem matérias (compara pelo nome/título).
-- =====================================================================

-- ---------- Autores ----------
insert into public.authors (name, role, bio, columnist) values
  ('Redação JB', 'Equipe de reportagem', 'Equipe de reportagem geral do Jornal Brasileiro.', false),
  ('Redação Investigativa JB', 'Núcleo de investigação', 'Núcleo responsável pelas reportagens investigativas e pela análise de documentos públicos.', false),
  ('Conselho Editorial JB', 'Editorial', 'Assina os editoriais, que expressam a posição institucional do jornal.', false),
  ('Núcleo de Verificação JB', 'Verificação de fatos', 'Checa declarações públicas, conteúdos virais e dados oficiais, com metodologia publicada.', false),
  ('Helena Prado', 'Colunista de Economia', 'Personagem fictícia. Escreve às terças sobre juros, emprego e orçamento das famílias.', true),
  ('Rafael Monteiro', 'Analista político', 'Personagem fictício. Acompanha o Congresso e as negociações do governo.', true),
  ('Carla Nunes', 'Repórter de Tecnologia & Ciência', 'Personagem fictícia. Cobre dados abertos, inteligência artificial e governo digital.', false)
on conflict (name) do nothing;
-- Perfis da redação com o selo do JB (coluna authors.official, de 01_schema.sql / 10_equipe_selos_lockdown.sql)
do $$
begin
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'authors' and column_name = 'official') then
        update public.authors set official = true
         where name in ('Redação JB', 'Redação Investigativa JB', 'Conselho Editorial JB', 'Núcleo de Verificação JB', 'Carla Nunes');
    end if;
end $$;

-- ---------- Reportagem do dossiê: cronologia, personagens, fontes e gráfico ----------
update public.news set
  kind = 'reportagem',
  body = '["Levantamento cruzou dados de portais de transparência e contratos emergenciais firmados nos últimos 24 meses.","A reportagem analisou 233 contratos (números fictícios) e encontrou aditivos sucessivos, prazos de vistoria vencidos e relatórios de fiscalização sem assinatura técnica.","Os órgãos citados foram procurados e terão suas respostas publicadas nesta página assim que enviadas. Esta é uma reportagem de demonstração do projeto acadêmico Jornal Brasileiro (JB); pessoas, órgãos e números são fictícios."]'::jsonb,
  timeline = '[{"when":"Março de 2025","text":"Primeira denúncia anônima chega ao canal seguro do JB."},{"when":"Junho de 2025","text":"Equipe obtém, por pedidos de acesso à informação, os contratos emergenciais de 14 estados."},{"when":"Setembro de 2025","text":"Cruzamento de dados identifica aditivos acima de 25% do valor original."},{"when":"Novembro de 2026","text":"Publicação do dossiê e envio de perguntas aos órgãos citados."}]'::jsonb,
  people = '[{"name":"Secretaria Estadual de Obras (fictícia)","role":"Contratante de 61 contratos analisados"},{"name":"Construtora Horizonte S.A. (fictícia)","role":"Empresa com mais aditivos no período"},{"name":"Tribunal de Contas Regional (fictício)","role":"Órgão de controle que acompanha o caso"}]'::jsonb,
  sources = '[{"label":"Portal da Transparência do Governo Federal","url":"https://portaldatransparencia.gov.br/"},{"label":"Lei de Acesso à Informação (Lei nº 12.527/2011)","url":"https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm"},{"label":"Planilha de contratos analisados (documento ilustrativo)","url":""}]'::jsonb,
  chart = '{"title":"Contratos emergenciais analisados, por região","unit":"contratos","source":"Levantamento JB com dados fictícios","items":[{"label":"Sudeste","value":74},{"label":"Nordeste","value":61},{"label":"Norte","value":38},{"label":"Sul","value":33},{"label":"Centro-Oeste","value":27}]}'::jsonb
where title = 'Dossiê aponta gargalos na fiscalização de obras públicas em 14 estados';

-- ---------- Ao vivo, editorial, opinião, análise, entrevista e checagens ----------
insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'politica',
       'Votação da reforma administrativa no plenário',
       'Acompanhe em tempo real a sessão que analisa o parecer final do relator.',
       'assets/img/cat-politica.svg',
       'Redação JB',
       '["A Câmara analisa nesta tarde o parecer final da reforma administrativa. Esta página reúne as atualizações da sessão em ordem cronológica.","Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '95 minutes',
       'aovivo',
       null,
       true,
       '[]'::jsonb,
       (select coalesce(jsonb_agg(jsonb_build_object('date', to_char((now() - make_interval(mins => u.m)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'author', u.a, 'text', u.t) order by u.m desc), '[]'::jsonb) from (values (90, 'Redação JB', 'Sessão aberta com 412 deputados registrados no painel.'), (70, 'Redação JB', 'Relator começa a leitura do parecer e anuncia três mudanças no texto.'), (45, 'Rafael Monteiro', 'Líderes da oposição pedem a retirada de pauta; pedido será votado primeiro.'), (20, 'Redação JB', 'Requerimento de retirada de pauta é rejeitado por 301 a 98.'), (6, 'Redação JB', 'Começa a discussão do mérito. A votação do texto-base deve ocorrer ainda hoje.')) as u(m, a, t)),
       null
where not exists (select 1 from public.news where title = 'Votação da reforma administrativa no plenário');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'politica',
       'Transparência não é favor, é dever',
       'A abertura dos contratos públicos precisa ser regra, e não resposta a escândalos.',
       'assets/img/cat-politica.svg',
       'Conselho Editorial JB',
       '["Toda vez que um contrato emergencial vem à tona por meio de uma denúncia, repete-se a promessa de mais transparência. O JB defende que a divulgação completa e em formato aberto seja obrigatória desde a assinatura.","Dados acessíveis permitem que cidadãos, imprensa e órgãos de controle acompanhem a execução das obras e identifiquem desvios a tempo de corrigi-los.","Este editorial expressa a posição institucional do jornal. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '150 minutes',
       'editorial',
       null,
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'Transparência não é favor, é dever');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'economia',
       'Juros altos por mais tempo cobram a conta de quem tem menos',
       'A cautela do Banco Central tem justificativa, mas o custo recai sobre o crédito das famílias.',
       'assets/img/cat-economia.svg',
       'Helena Prado',
       '["Manter a taxa básica elevada ajuda a conter a inflação de serviços, mas encarece o crédito justamente para quem já está endividado.","Política monetária não resolve tudo sozinha: renegociação de dívidas e educação financeira precisam andar junto.","Os artigos de opinião refletem a visão de seus autores, não necessariamente a do jornal. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '260 minutes',
       'opiniao',
       null,
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'Juros altos por mais tempo cobram a conta de quem tem menos');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'politica',
       'O que muda com o novo marco de transparência pública',
       'Análise: o texto aprovado na comissão amplia prazos de divulgação, mas deixa lacunas na fiscalização.',
       'assets/img/cat-politica.svg',
       'Rafael Monteiro',
       '["O marco aprovado obriga órgãos federais a publicar contratos em até cinco dias úteis, contra os trinta dias atuais.","A principal lacuna está na ausência de sanções claras para quem descumprir os prazos, o que pode limitar o efeito prático da lei.","Análises interpretam fatos a partir de dados e contexto, assinadas por especialistas da redação. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '330 minutes',
       'analise',
       null,
       false,
       '[{"label":"Câmara dos Deputados — tramitação de proposições","url":"https://www.camara.leg.br/"}]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'O que muda com o novo marco de transparência pública');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'tecnologia',
       '“Dados abertos economizam dinheiro público”, diz pesquisadora',
       'Entrevista exclusiva sobre como a tecnologia ajuda a fiscalizar contratos.',
       'assets/img/seguranca-digital.jpg',
       'Carla Nunes',
       '["A pesquisadora fictícia Marina Albuquerque estuda controle social de gastos públicos há uma década. Ela conversou com o JB sobre dados abertos e fiscalização.","P: Por que dados abertos ajudam a economizar?","R: Porque permitem comparar preços entre contratos parecidos. Quando a sociedade consegue ver os valores, sobrepreços aparecem mais rápido.","P: Qual é o maior obstáculo hoje?","R: A falta de padrão. Cada órgão publica de um jeito, muitas vezes em PDF escaneado, o que impede a análise automática.","P: O que o cidadão comum pode fazer?","R: Consultar os portais de transparência, usar a Lei de Acesso à Informação e compartilhar o que encontrar com a imprensa e os órgãos de controle.","Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '520 minutes',
       'entrevista',
       null,
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = '“Dados abertos economizam dinheiro público”, diz pesquisadora');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'economia',
       'É falso que nova lei proíba pagamentos em dinheiro vivo',
       'Mensagem viral afirma que o uso de cédulas será crime a partir do mês que vem. Nenhum projeto em tramitação prevê isso.',
       'assets/img/cat-economia.svg',
       'Núcleo de Verificação JB',
       '["O que circula: uma mensagem compartilhada em aplicativos afirma que “a partir do mês que vem, pagar em dinheiro vivo vai dar multa”.","O que verificamos: não há lei aprovada nem projeto em tramitação com essa previsão. O texto viral mistura regras antigas sobre registro de operações de alto valor com informações inventadas.","Conclusão: FALSO. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '610 minutes',
       'checagem',
       'falso',
       false,
       '[{"label":"Banco Central do Brasil — perguntas frequentes","url":"https://www.bcb.gov.br/"}]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'É falso que nova lei proíba pagamentos em dinheiro vivo');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'infraestrutura',
       'Post exagera número de obras paradas no país',
       'Publicação fala em 14 mil obras paralisadas; o dado oficial (fictício) mais recente aponta 8,6 mil.',
       'assets/img/ferrovia.webp',
       'Núcleo de Verificação JB',
       '["O que circula: um post afirma que “14 mil obras estão paradas no país, recorde histórico”.","O que verificamos: o número citado soma obras concluídas e canceladas. Considerando apenas as paralisadas, o painel oficial (dados fictícios) indica 8,6 mil.","Conclusão: IMPRECISO. Há de fato milhares de obras paradas, mas o número está inflado. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '700 minutes',
       'checagem',
       'impreciso',
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       '{"title":"Obras paralisadas: o post e o dado oficial","unit":"obras","source":"Painel de obras (dados fictícios)","items":[{"label":"Número citado no post","value":14000},{"label":"Dado oficial","value":8600}]}'::jsonb
where not exists (select 1 from public.news where title = 'Post exagera número de obras paradas no país');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'meioambiente',
       'Vídeo de enchente antiga circula como se fosse desta semana',
       'As imagens são reais, mas foram gravadas em 2019, em outra cidade.',
       'assets/img/cat-meioambiente.svg',
       'Núcleo de Verificação JB',
       '["O que circula: vídeo de uma rua alagada compartilhado com a legenda “agora há pouco”.","O que verificamos: a busca reversa de imagens mostra o mesmo vídeo publicado em 2019, em outro município.","Conclusão: FORA DE CONTEXTO. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '820 minutes',
       'checagem',
       'fora_de_contexto',
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'Vídeo de enchente antiga circula como se fosse desta semana');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'educacao',
       'Frequência escolar subiu em rede que testa novo painel',
       'Secretaria afirma que a presença média cresceu 4 pontos percentuais. Os dados (fictícios) confirmam.',
       'assets/img/cat-educacao.svg',
       'Núcleo de Verificação JB',
       '["O que foi dito: em entrevista, a secretária de Educação afirmou que a frequência média subiu de 87% para 91% após a adoção do painel.","O que verificamos: os boletins mensais publicados pela rede (dados fictícios) mostram exatamente esses valores.","Conclusão: VERDADEIRO. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '960 minutes',
       'checagem',
       'verdadeiro',
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'Frequência escolar subiu em rede que testa novo painel');

insert into public.news (category, title, subtitle, image, author, body, status, featured, date, kind, verdict, live, sources, updates, chart)
select 'esportes',
       'Estádios públicos passam a divulgar custos de manutenção em painel aberto',
       'Arenas administradas por governos estaduais terão gastos, receitas e contratos publicados todo mês.',
       'assets/img/cat-esportes.svg',
       'Redação JB',
       '["Os estádios administrados por governos estaduais vão publicar mensalmente, em formato aberto, os custos de manutenção, as receitas com jogos e eventos e os contratos de operação.","A medida responde a pedidos de torcidas organizadas e de pesquisadores, que apontavam dificuldade para comparar o custo das arenas construídas com dinheiro público.","O primeiro relatório deve sair no fim do mês, com dados dos últimos doze meses. Conteúdo fictício de demonstração do projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb,
       'publicada',
       false,
       now() - interval '400 minutes',
       'noticia',
       null,
       false,
       '[]'::jsonb,
       '[]'::jsonb,
       null
where not exists (select 1 from public.news where title = 'Estádios públicos passam a divulgar custos de manutenção em painel aberto');

-- =====================================================================
-- Parte 2: exemplos do JB Educa e tags (precisa do 11_divisoes_tags_notificacoes.sql ou do
-- 01_schema.sql atual). Mesmo conteúdo do modo local (educaSamples e SAMPLE_TAGS em storage.js).
-- =====================================================================
do $educa$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news' and column_name = 'division') then
        raise notice 'Parte 2 ignorada: rode antes o 11_divisoes_tags_notificacoes.sql.';
        return;
    end if;
    insert into public.authors (name, role, bio, columnist, official) values ('Equipe JB Educa', 'Professores do JB Educa', 'Professores que preparam as aulas e as listas de exercícios do JB Educa.', false, true) on conflict (name) do nothing;
    insert into public.tags (slug, name, description) values
        ('transparencia', 'Transparência', 'Acesso a dados, contratos e gastos públicos.'),
        ('contas-publicas', 'Contas públicas', 'Orçamento, contratos e fiscalização do dinheiro público.'),
        ('reforma-administrativa', 'Reforma administrativa', 'A tramitação da reforma do serviço público.'),
        ('dados-abertos', 'Dados abertos', 'Informações públicas em formato aberto.'),
        ('equacao-do-2-grau', 'Equação do 2º grau', 'Discriminante, fórmula de Bhaskara e exercícios.'),
        ('matematica-basica', 'Matemática básica', '')
    on conflict (slug) do nothing;
    update public.news set tags = array['contas-publicas', 'transparencia']::text[] where title = 'Dossiê aponta gargalos na fiscalização de obras públicas em 14 estados' and tags = '{}';
    update public.news set tags = array['reforma-administrativa']::text[] where title = 'Relator apresenta parecer final sobre reforma administrativa nesta quinta-feira' and tags = '{}';
    update public.news set tags = array['transparencia']::text[] where title = 'Comissão aprova novo marco regulatório para transparência pública' and tags = '{}';
    update public.news set tags = array['reforma-administrativa']::text[] where title = 'Votação da reforma administrativa no plenário' and tags = '{}';
    update public.news set tags = array['transparencia', 'contas-publicas']::text[] where title = 'Transparência não é favor, é dever' and tags = '{}';
    update public.news set tags = array['transparencia']::text[] where title = 'O que muda com o novo marco de transparência pública' and tags = '{}';
    update public.news set tags = array['dados-abertos', 'transparencia']::text[] where title = '“Dados abertos economizam dinheiro público”, diz pesquisadora' and tags = '{}';
    update public.news set tags = array['dados-abertos', 'contas-publicas']::text[] where title = 'Estádios públicos passam a divulgar custos de manutenção em painel aberto' and tags = '{}';
    insert into public.news (division, category, title, subtitle, image, author, body, status, featured, date, kind, tags)
    select 'educa', 'matematica', 'Equação do 2º grau: como usar a fórmula de Bhaskara', 'Passo a passo para encontrar as raízes de qualquer equação do tipo ax² + bx + c = 0.', 'assets/img/cat-educacao.svg', 'Equipe JB Educa',
           '["Uma equação do 2º grau tem a forma $$ax^2 + bx + c = 0$$, com $$a \\neq 0$$. Resolver a equação é encontrar os valores de $$x$$ que a tornam verdadeira: as **raízes**.","## 1. Calcule o discriminante","$$ \\Delta = b^2 - 4ac","- Se $$\\Delta > 0$$, há duas raízes reais diferentes.","- Se $$\\Delta = 0$$, há uma raiz real (dupla).","- Se $$\\Delta < 0$$, não há raiz real.","## 2. Aplique a fórmula","$$ x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}","## Exemplo resolvido","Resolva $$x^2 - 5x + 6 = 0$$. Aqui $$a = 1$$, $$b = -5$$ e $$c = 6$$.","$$ \\Delta = (-5)^2 - 4 \\cdot 1 \\cdot 6 = 25 - 24 = 1","$$ x = \\frac{5 \\pm 1}{2} \\Rightarrow x_1 = 3, \\quad x_2 = 2","> Confira sempre: substitua cada raiz na equação original. $$3^2 - 5 \\cdot 3 + 6 = 0$$ ✔","Material de demonstração do JB Educa, no projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb, 'publicada', false, now() - interval '140 minutes', 'aula', array['equacao-do-2-grau', 'matematica-basica']::text[]
    where not exists (select 1 from public.news where title = 'Equação do 2º grau: como usar a fórmula de Bhaskara');
    insert into public.news (division, category, title, subtitle, image, author, body, status, featured, date, kind, tags)
    select 'educa', 'matematica', 'Lista de exercícios: equação do 2º grau', 'Seis exercícios com resposta para treinar o discriminante e a fórmula de Bhaskara.', 'assets/img/cat-educacao.svg', 'Equipe JB Educa',
           '["Tente resolver antes de abrir a resposta. Use $$\\Delta = b^2 - 4ac$$ e $$x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$.","?? Calcule o discriminante de $$x^2 + 2x - 8 = 0$$.\n=> $$\\Delta = 2^2 - 4 \\cdot 1 \\cdot (-8) = 4 + 32 = 36$$","?? Encontre as raízes de $$x^2 + 2x - 8 = 0$$.\n=> $$x = \\frac{-2 \\pm 6}{2}$$, então $$x_1 = 2$$ e $$x_2 = -4$$.","?? Quantas raízes reais tem $$x^2 - 6x + 9 = 0$$?\n=> $$\\Delta = 36 - 36 = 0$$: uma raiz real dupla, $$x = 3$$.","?? Quantas raízes reais tem $$2x^2 + x + 5 = 0$$?\n=> $$\\Delta = 1 - 40 = -39 < 0$$: nenhuma raiz real.","?? Resolva $$2x^2 - 8 = 0$$.\n=> Equação incompleta: $$x^2 = 4$$, logo $$x = \\pm 2$$.","?? A área de um terreno retangular é 24 m² e um lado mede 2 m a mais que o outro. Quanto mede o lado menor?\n=> $$x(x + 2) = 24 \\Rightarrow x^2 + 2x - 24 = 0$$; $$\\Delta = 100$$; $$x = 4$$ (a raiz negativa não serve). O lado menor mede 4 m.","Material de demonstração do JB Educa, no projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb, 'publicada', false, now() - interval '135 minutes', 'exercicios', array['equacao-do-2-grau']::text[]
    where not exists (select 1 from public.news where title = 'Lista de exercícios: equação do 2º grau');
    insert into public.news (division, category, title, subtitle, image, author, body, status, featured, date, kind, tags)
    select 'educa', 'portugues', 'Crase: quando usar o acento grave', 'Três perguntas rápidas que resolvem a maioria das dúvidas sobre a crase.', 'assets/img/cat-educacao.svg', 'Equipe JB Educa',
           '["A crase é a junção da preposição **a** com o artigo **a** (ou com o \"a\" de aquele, aquela, aquilo). O acento grave marca essa junção.","## Truque da troca","Troque a palavra feminina por uma masculina. Se aparecer **ao**, há crase: \"Vou **à** escola\" → \"Vou **ao** colégio\".","## Quando não usar","- Antes de palavras masculinas: \"andar a cavalo\".","- Antes de verbos: \"começou a chover\".","- Entre palavras repetidas: \"cara a cara\".","?? Complete: \"Entreguei o livro ___ professora.\"\n=> **à** (entreguei o livro **ao** professor).","Material de demonstração do JB Educa, no projeto acadêmico Jornal Brasileiro (JB)."]'::jsonb, 'publicada', false, now() - interval '150 minutes', 'aula', '{}'::text[]
    where not exists (select 1 from public.news where title = 'Crase: quando usar o acento grave');
end $educa$;
