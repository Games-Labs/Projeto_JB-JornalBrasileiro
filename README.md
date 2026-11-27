# 📰 Jornal Brasileiro (JB)

> **Portal de Notícias** — Webjornalismo Informativo e Investigativo
> Projeto acadêmico · front-end estático (HTML/CSS/JS) · banco, login e imagens no **Supabase** · hospedagem no **Cloudflare Pages**.

![Página inicial do Jornal Brasileiro](docs/screenshot-home.png)

## 📌 Proposta do Projeto

| Item | Descrição |
|------|-----------|
| **Título do projeto** | Portal de Notícias |
| **Tema** | Webjornalismo Informativo e Investigativo |
| **Nome do jornal** | Jornal Brasileiro (JB) |
| **Equipe / Responsável** | Mathias Silva Cunha |
| **Desenvolvimento** | GamesYutuber |
| **Licença** | [PolyForm Noncommercial 1.0.0](LICENSE) — uso não comercial |

### A) Arquitetura de Execução

Aplicação **Multi-Page** com front-end estático (**HTML5, CSS3 e JavaScript nativo**, Bootstrap 5 para a interface), sem etapa de build, hospedada no **Cloudflare Pages** (*Pages Functions* completam o HTML com a prévia de cada página e matéria ao compartilhar o link, o `sitemap.xml` e o `robots.txt`). Os dados ficam no **Supabase**: banco Postgres (notícias, autores, versões das matérias, perfis, comentários, denúncias, favoritos, newsletter e contagem de leituras), **Supabase Auth** (contas, login e recuperação de senha) e **Supabase Storage** (imagens enviadas pelo painel, público, e anexos das denúncias, privado). A segurança é garantida no banco, por **políticas RLS** e privilégios mínimos ([`supabase/01_schema.sql`](supabase/01_schema.sql)); o navegador usa apenas a chave pública (*anon/publishable*).

**Público-alvo:** leitores em geral, avaliadores do projeto acadêmico e cidadãos interessados em simulações de portais de notícias e jornalismo investigativo.

**Fluxo principal:** o leitor navega pelas páginas (Início, Notícias, editorias, Ao vivo, Central de Investigações, Verificação de fatos, Opinião, Entrevistas, Arquivo, Equipe, Denúncias, Institucional), vê o ticker de últimas notícias, filtra e busca matérias, comenta, salva favoritos e envia denúncias. A redação trabalha pelo Painel Administrativo conforme o cargo: jornalistas escrevem e levam as matérias até a aprovação; coordenadores e o administrador publicam, agendam, corrigem e moderam. Tudo é gravado no Supabase e aparece para todos os visitantes.

> **Modo de demonstração local (opcional):** se `assets/js/config.js` não tiver as chaves do Supabase, o site roda offline (até por `file://`) guardando tudo no `localStorage` do navegador, com login apenas simulado. Serve para apresentar o projeto sem internet; o rodapé avisa quando esse modo está ativo.

### B) Requisitos Funcionais

1. Front-end estático publicado no Cloudflare Pages, com dados e autenticação no Supabase.
2. Ticker rotativo no topo com as notícias mais recentes.
3. Navegação entre **páginas HTML independentes**.
4. Filtro de notícias por 12 editorias (Política, Economia, Esportes, Investigação, Tecnologia, Infraestrutura, Brasil, Mundo, Educação, Saúde, Meio Ambiente, Cultura), cada uma com página própria (destaque + descrição), busca por texto e **busca avançada** (autor, tipo de conteúdo, período e editoria).
5. Formulário de denúncias / envio de pautas (com conta) com opção de anonimato e até **6 anexos** (imagens redesenhadas no navegador, sem metadados, e PDFs), guardados num bucket privado; só coordenadores e o administrador leem as denúncias e abrem os anexos.
6. Cadastro, login (e-mail e senha ou **conta do Google**) e **recuperação de senha por e-mail** (Supabase Auth): o leitor digita o **código de verificação** que o Supabase envia e confere, ou abre o link do mesmo e-mail. Contas a partir de **16 anos**; senhas com 8+ caracteres, minúscula, maiúscula, número e símbolo; **CAPTCHA** (Cloudflare Turnstile) no login, cadastro e recuperação.
7. Salvamento e edição do perfil, com página de **perfil público** (nome, foto e minibiografia).
8. Área **Minhas Informações** para usuários autenticados.
9. Painel Administrativo dividido em **páginas próprias com menu lateral** (Visão geral, Matérias, Autores, Selos e tags, Audiência e visitas, Comentários, Denúncias, Equipe e cargos, Segurança), cada uma visível só para o cargo que a usa, com **estatísticas de visitantes do site** (páginas vistas e visitantes diferentes por dia, em 7, 14, 30 ou 90 dias), e **CRUD** de notícias (escritas no **editor de matérias** em página inteira: texto com negrito, itálico, links, intertítulos, citações e listas; vídeo ou live do YouTube; cinco tipos de gráfico; prévia do card e cópia automática no navegador), **fluxo editorial** (rascunho → em revisão → aprovada → publicada → arquivada), **agendamento**, **histórico de versões** com restauração, cadastro de **autores**, relatórios de **audiência**, dashboard, caixa de denúncias e moderação de comentários.
10. **Hierarquia da redação** (administrador → coordenador → jornalista → leitor), com aba **Equipe e cargos** no painel, regras impostas pelo banco e registro de cada mudança de cargo.
11. **Perfis públicos** (nome, foto, minibiografia e comentários) com **selo do JB** para a equipe da redação e para os **perfis oficiais** da redação (autores marcados no painel), e **selos de perfil** dados pela coordenação: Colaborador, Apoiador Oficial, Ajudante do Jornal e Repórter.
12. **Segurança da conta** (`seguranca.html`): **verificação em duas etapas** com app autenticador (obrigatória para a equipe da redação, opcional para leitores) e confirmação de idade; aba **Segurança** no painel com o estado das proteções, a equipe sem MFA e a **auditoria** (gravada pelo banco).
13. **Cookies transparentes (LGPD)**: aviso com “Só o necessário”, “Permitir tudo” ou “Escolher”; cinco categorias (Necessários, Preferências, Estatísticas, Localização aproximada e Conteúdo de terceiros), cada uma dizendo exatamente o que guarda; nada além do necessário funciona antes da escolha, e desligar uma opção apaga na hora o que dependia dela. A mesma lista, com o estado atual, fica em `institucional.html#cookies`.
14. Comentários **só com conta**: quem comentou **edita ou exclui o próprio comentário** (fica marcado “editado”); a coordenação continua moderando pelo painel e pela matéria.
15. **Prévia ao compartilhar e SEO**: links de matéria mostram título, resumo e imagem da própria matéria no WhatsApp, X, Facebook e afins (e dados `NewsArticle` para buscadores); as demais páginas mostram o nome e a descrição da seção. O site tem `sitemap.xml` com todas as matérias publicadas, `robots.txt`, endereço canônico, dados da organização com as redes sociais, página 404 de verdade e `noindex` nas páginas de conta e do painel.
15. **Modo lockdown** (aba Segurança do painel): numa emergência, a coordenação fecha o site; o banco passa a entregar o conteúdo só para a equipe logada (com a verificação em duas etapas), suspende comentários, denúncias, newsletter, favoritos, edição de perfil, cadastros e a contagem de leituras, e os outros visitantes veem uma tela de “site temporariamente fechado” com o login da equipe.
16. **App instalável (PWA)**: o JB pode ser instalado no celular ou no computador e as matérias já abertas continuam legíveis sem internet (com internet, tudo vem sempre da rede). Ao voltar ao app depois de 5 minutos ou mais em segundo plano, as páginas de leitura se atualizam sozinhas (nunca com um comentário ou formulário sendo digitado).
17. Redes sociais do JB (Instagram, TikTok e YouTube) no rodapé e **feed RSS** (`/rss.xml`) com as 40 publicações mais recentes.
19. **Divisões**: o Jornal Brasileiro e o **JB Educa** (`educa.html`, tema verde), com aulas e listas de exercícios por disciplina, **fórmulas matemáticas** (equações, frações, raízes) e **exercícios com resposta escondida** no texto, e uma calculadora da **fórmula de Bhaskara** com o passo a passo. O cargo **Professor** escreve os materiais do Educa. Uma divisão nova é uma linha no banco (`divisions`) e uma entrada em `JB.DIVISIONS`.
20. **Tags e selos**: cada matéria tem até 10 **tags** (assuntos) que levam às matérias relacionadas (`tag.html`) e até 3 **selos de matéria** (Exclusivo, Especial…); o catálogo de selos (de perfil e de matéria) e de tags é gerido pela coordenação no painel.
21. **Notificações**: o leitor **segue uma matéria** e recebe aviso quando ela é atualizada ou corrigida, e pode pedir aviso de toda cobertura **ao vivo**; administradores recebem **alertas de segurança** (modo lockdown, cargos de coordenação). Os avisos aparecem no **sino** do cabeçalho e na Minha Central e, se o leitor ativar, chegam também com o **site fechado** (Web Push).
22. **Serviços** com dados de fontes abertas, sempre com cache e com a hora da última atualização: **previsão do tempo** (Open-Meteo; cidade pelo nome, pelo CEP ou, com consentimento, estimada pela conexão; capitais), **cotações** (AwesomeAPI: moedas e criptomoedas contra o real, com conversor), **futebol** (TheSportsDB: jogos, resultados e classificação do Brasileirão, Copa do Brasil, Libertadores e Sul-Americana, com identidade visual própria) e **Hoje na História** (Wikipédia). A capa ganhou saudação conforme a hora (Bom dia, Boa tarde, Boa noite) e uma faixa com os quatro serviços.
23. **Créditos completos**: assinatura com autor e coautores (pessoas, núcleos ou equipes) e linha **“Edição:”** com quem editou, cada nome reconhecido como autor cadastrado, conta da equipe (com selo) ou nome livre.
24. **Animações discretas**: cabeçalho, manchete e cards aparecem com um leve deslizar, um depois do outro, conforme entram na tela (cada um uma vez só); cards sobem um pouco ao passar o mouse e respondem ao toque no celular; seguir, favoritar e ligar notificações dão um retorno visual; **barra de progresso de leitura** nas matérias longas. Tudo respeita o “reduzir movimento” do sistema e o botão **“Menos animação”** dos controles de acessibilidade, e nada fica escondido se o JavaScript falhar. O JB Educa tem o próprio ritmo (tokens em `motion.css`).
18. Interface responsiva para celulares e desktops.

**Seções jornalísticas:**

| Seção | O que tem |
|-------|-----------|
| **Página inicial** | Manchete (com prévia do texto que ocupa a altura ao lado das últimas publicações), últimas publicações, faixa de *Mais lidas*, *Em andamento* (coberturas ao vivo; uma só vira cartão largo com as últimas atualizações), *Resumo do dia*, *Especial da semana*, blocos de Política/Economia, Investigação, Esportes/Tecnologia (colunas com a mesma quantidade de matérias, a primeira com imagem e resumo), *Editorial e Opinião* (colunas na altura do editorial), *Verificação de fatos* e mais notícias |
| **Tipos de conteúdo** | Cada matéria é Notícia, Reportagem, Análise, Opinião, Editorial, Entrevista, Verificação de fatos ou Ao vivo, com selo visível para o leitor separar informação de opinião |
| **Ao vivo** (`ao-vivo.html`) | Cobertura em tempo real: atualizações com horário e autor; a página do leitor se atualiza sozinha a cada 30 s |
| **Central de Investigações** (`investigacao.html`) | Reportagens com **cronologia**, **personagens envolvidos**, **fontes/documentos** e **gráfico** |
| **Verificação de fatos** (`verificacao.html`) | Checagens classificadas como *Verdadeiro*, *Impreciso*, *Fora de contexto* ou *Falso*, com filtro e metodologia |
| **Opinião e análise** (`opiniao.html`) | Editoriais, colunas e análises, com a lista de **colunistas** |
| **Entrevistas** (`entrevistas.html`) | Perguntas e respostas (linhas `P:` / `R:` no texto) |
| **Arquivo** (`arquivo.html`) | Todas as publicações agrupadas por mês, com filtro por tipo e editoria |
| **Equipe / autor** (`autor.html`) | Coordenação e jornalistas do JB em seções separadas (contas com selo), colaboradores e apoiadores (selos de perfil), colunistas e assinaturas; `autor.html?nome=...` mostra perfil e matérias (inclusive em coautoria) de cada autor |
| **Perfil público** (`perfil-publico.html?id=...`) | Nome, foto, minibiografia, cargo e comentários de qualquer conta; a equipe da redação ganha o selo do JB e a lista de matérias publicadas |
| **Sobre o JB** (`sobre.html`, aberta pelo logotipo) | Página institucional: missão, números do portal, as divisões, valores, como uma matéria é feita |
| **JB Educa** (`educa.html`) | Aulas e listas de exercícios por disciplina (Matemática, Português, Redação, Ciências, História, Geografia, Inglês) e calculadora de Bhaskara |
| **Assuntos** (`tag.html`) | Todas as tags; `tag.html?t=...` mostra as matérias da tag e os assuntos relacionados |
| **Serviços** (`tempo.html`, `cotacoes.html`, `futebol.html`, `hoje-na-historia.html`) | Previsão do tempo, cotações, futebol e Hoje na História |
| **Institucional** | Política editorial, política de correções, transparência e metodologia, expediente, termos e LGPD |

**Em cada matéria:** texto com intertítulos, citações, listas, negrito, itálico, links e **imagens com legenda no meio do texto**; assinatura com **coautores** (“Por Redação Investigativa JB e Núcleo de Verificação JB”); **vídeo ou live do YouTube** no topo (o player só carrega quando o leitor clica, pelo domínio `youtube-nocookie.com`); autor (com link para o perfil e **selo do JB** quando a assinatura é de alguém da redação), data de publicação e de **atualização**, tempo de leitura, leituras, fontes e referências, quadro de **correções**, gráfico (barras, colunas, linha, área ou rosca) sempre com os valores escritos e tabela equivalente, *Leia também*, comentários (o autor edita ou exclui o próprio), favoritar, compartilhar, imprimir e **modo leitura**.

**Extras para o leitor:** **perfil público** com os próprios comentários, **Modo escuro**, **acessibilidade** (tamanho do texto e alto contraste, no rodapé e no menu lateral; link "Pular para o conteúdo"), **Minha Central** (favoritos, histórico e recomendações), ranking **Mais lidas**, newsletter demonstrativa e foto de perfil.
**Extras para a redação:** **editor de matérias** em página inteira (`editor.html`: barra de formatação, imagens no meio do texto (texto, foto, mais texto), coautores na assinatura, **colaboradores de edição** (jornalistas que também podem editar a matéria; quem escolhe é quem criou ou a coordenação), atalhos Ctrl+B/I/K/S, colar do Word ou Google Docs mantendo a formatação, contador de palavras e tempo de leitura, aviso de título longo, prévia do card, cópia do texto guardada no navegador até salvar e aviso antes de sair sem salvar), seletor de imagem (galeria local, envio do computador com redução automática para WebP e envio ao Supabase Storage, ou URL), vídeo do YouTube, visualização prévia de matérias não publicadas ou agendadas, filtros da tabela por status/tipo e **“Só as minhas”**, selo **“Sua”** nas próprias matérias, publicação de atualizações ao vivo na hora, registro de correções, manchete da capa (coordenação), aba **Equipe e cargos** (mostra a equipe e quem tem selo; busca qualquer conta; botão **Remover da equipe**; selos de perfil) com histórico das mudanças e **modo lockdown** na aba Segurança. Quem perde o cargo com o painel ou o editor aberto perde o acesso em até 1 minuto (ou ao voltar para a aba).

### C) Usuários

| Perfil | O que pode fazer |
|--------|------------------|
| **Visitante** | Navegar, ler notícias, filtrar, buscar e salvar favoritos no próprio navegador. Para comentar ou enviar denúncia, precisa entrar numa conta. |
| **Leitor** (conta comum, 16+ anos) | Tudo acima + entrar (senha ou Google), editar perfil e foto, ter perfil público, favoritos na conta, **seguir matérias e receber notificações**, comentar, enviar denúncias com anexos, recuperar a senha e, se quiser, ativar a verificação em duas etapas (depois de ativada, o código é pedido em todo login, qualquer que seja o cargo). |
| **Professor** ✓JB Educa | Igual ao jornalista, mas só no **JB Educa**: cria e edita os próprios materiais (aulas e exercícios) até “Aprovada”. |
| **Jornalista** ✓JB | Tudo do leitor + painel: cria e edita **as próprias** matérias (e aquelas em que foi marcado como **colaborador**) e as leva até **“Aprovada”**; vê as matérias da redação só para leitura; audiência. Quem publica é o coordenador. |
| **Coordenador** ✓JB | Publica, agenda, arquiva, corrige e exclui qualquer matéria; restaura versões; autores; denúncias; moderação de comentários; **coloca e tira jornalistas**; selos de perfil de leitores e jornalistas; **modo lockdown**. |
| **Administrador** ✓JB | Tudo + **nomeia coordenadores** e dá selos a qualquer conta (menos administradores). |

A equipe (jornalista, professor, coordenador e administrador) só usa o painel com a **verificação em duas etapas** ativa e confirmada na sessão: sem ela, o banco trata a conta como se não tivesse cargo (função `my_role()` em [`supabase/08_seguranca.sql`](supabase/08_seguranca.sql)).

Na aba **Equipe e cargos** do painel, o administrador coloca qualquer conta como leitor, jornalista, professor ou coordenador; o coordenador só coloca ou tira jornalistas e professores. Ninguém muda o próprio cargo, e cada mudança fica registrada. **Administradores são promovidos apenas pelo SQL Editor do Supabase** ([`supabase/03_promover_admin.sql`](supabase/03_promover_admin.sql)); no site publicado não existe conta ou senha padrão. As regras são do banco (RLS + função `set_member_role`, em [`supabase/07_hierarquia.sql`](supabase/07_hierarquia.sql)), não só da tela.

## 🚀 Como executar

**Publicado:** siga o passo a passo de **[docs/DEPLOY.md](docs/DEPLOY.md)** (Supabase + Cloudflare Pages). Em resumo:

1. Rode [`supabase/01_schema.sql`](supabase/01_schema.sql) (e, opcionalmente, `02_seed.sql` e `06_exemplos_secoes.sql`) no SQL Editor do Supabase. Projetos criados com versões anteriores rodam só as atualizações que faltam: [`04_auditoria_seguranca.sql`](supabase/04_auditoria_seguranca.sql), [`05_secoes_editoriais.sql`](supabase/05_secoes_editoriais.sql) e [`07_hierarquia.sql`](supabase/07_hierarquia.sql), [`08_seguranca.sql`](supabase/08_seguranca.sql), [`09_editor_video_comentarios.sql`](supabase/09_editor_video_comentarios.sql), [`10_equipe_selos_lockdown.sql`](supabase/10_equipe_selos_lockdown.sql) e [`11_divisoes_tags_notificacoes.sql`](supabase/11_divisoes_tags_notificacoes.sql). O banco do JB publicado já está com todas elas (a 11 foi aplicada em 27/11/2026).
2. Cole a **Project URL**, a chave **anon/publishable** e a chave **do site** do Turnstile em [`assets/js/config.js`](assets/js/config.js). Nunca use a `service_role`. As demais credenciais (SMTP, Google, chave secreta do Turnstile e as variáveis opcionais do Cloudflare) têm um modelo em [`exemplosecret.env`](exemplosecret.env): copie-o para `.env` (ignorado pelo git), preencha a cópia e cadastre cada valor onde o arquivo indica.
3. Publique a pasta no Cloudflare Pages (sem build), configure no Supabase as URLs de redirecionamento, o SMTP, o CAPTCHA, o MFA, o login com o Google e a política de senha, e crie o primeiro administrador.

**Teste local:** sirva a pasta por HTTP (`npx serve .` ou Live Server); o login do Supabase não é confiável em `file://`.

## 🗂️ Estrutura do projeto

```
JB/
├── index.html                 # Homepage
├── 404.html                   # Página não encontrada (o Cloudflare a entrega com status 404)
├── sw.js                      # Service worker do PWA: rede primeiro, cópia só para quando a rede falha
├── _headers                   # Cabeçalhos de segurança (CSP, HSTS...) do Cloudflare Pages
├── pages/
│   ├── noticias.html          # Listagem + filtros + busca avançada (?cat= vira a página da editoria)
│   ├── politica.html · economia.html · esportes.html   # Editorias com destaque
│   ├── investigacao.html      # Central de Investigações
│   ├── ao-vivo.html           # Coberturas em tempo real
│   ├── verificacao.html       # Verificação de fatos (filtro por classificação)
│   ├── opiniao.html           # Editoriais, opinião, análises e colunistas
│   ├── entrevistas.html       # Entrevistas
│   ├── arquivo.html           # Arquivo por mês
│   ├── autor.html             # Equipe e colunistas / perfil de autor (?nome=)
│   ├── noticia.html           # Leitura de uma matéria (?id=), favoritos e comentários
│   ├── central.html           # Minha Central: notificações, matérias seguidas, favoritos, histórico, recomendações
│   ├── denuncias.html         # Denuncie / Envie uma Pauta
│   ├── institucional.html     # Quem somos, políticas editorial e de correções, metodologia, expediente, termos, LGPD
│   ├── login.html · cadastro.html · perfil.html
│   ├── perfil-publico.html    # Perfil público de uma conta (?id=), com selo do JB para a equipe
│   ├── recuperar-senha.html   # Pedir a recuperação e confirmar o código do e-mail com a nova senha
│   ├── redefinir-senha.html   # Aberta pelo link do e-mail: define a nova senha
│   ├── seguranca.html         # Segurança da conta: idade, código do app autenticador, ativar/remover MFA
│   ├── sobre.html             # Sobre o JB (aberta pelo logotipo)
│   ├── educa.html             # JB Educa: materiais por disciplina e calculadora de Bhaskara
│   ├── tag.html               # Assuntos (?t= uma tag)
│   ├── tempo.html · cotacoes.html · futebol.html · hoje-na-historia.html   # Serviços
│   ├── admin.html             # Painel: visão geral e visitantes do site
│   ├── admin-*.html           # Painel: matérias, autores, selos e tags, audiência, comentários, denúncias, equipe, segurança
│   ├── editor.html            # Editor de matérias em página inteira (?id= para editar)
│   └── offline.html           # Aviso de sem conexão (entregue pelo sw.js)
├── assets/
│   ├── css/style.css          # Tema do JB sobre o Bootstrap (paleta, editorias, modo escuro e alto contraste)
│   ├── css/motion.css         # Animações: tokens de velocidade/intensidade por divisão, entrada, hover, barra de leitura
│   ├── fonts/                 # Source Serif 4 e Inter (licença SIL OFL), servidas pelo próprio site
│   ├── js/
│   │   ├── config.js          # URL e chave pública do Supabase (única configuração)
│   │   ├── storage.js         # Objeto JB, utilitários, preferências e modo de demonstração local
│   │   ├── supabase-backend.js# Dados, login e imagens no Supabase (assume quando config.js está preenchido)
│   │   ├── layout.js          # Ticker, cabeçalho, rodapé e cookies
│   │   ├── services.js        # Tempo, cotações, futebol e Hoje na História (widgets da capa e páginas)
│   │   ├── motion.js          # Revela blocos ao rolar, retorno visual das ações, barra de progresso de leitura
│   │   └── home · news-list · article · arquivo · autor · central · denuncias · auth · perfil · perfil-publico · seguranca · admin · editor · educa · tag · sobre .js
│   ├── favicon/               # Ícones do site e site.webmanifest (PWA)
│   ├── img/                   # Imagens locais e ilustrações SVG
│   └── vendor/                # Bootstrap 5.3.3 e supabase-js 2.45.4 (cópias locais)
├── functions/                 # Cloudflare Pages Functions (SEO e prévia de links)
│   ├── pages/noticia.js       # Título, resumo e imagem da matéria
│   ├── pages/[[path]].js · index.js # Prévia das demais páginas e da capa (dados da organização)
│   ├── sitemap.xml.js · robots.txt.js · rss.xml.js
│   ├── api/ext.js             # Proxy com cache (lista fixa de fontes) para tempo, cotações, futebol e Wikipédia
│   ├── api/local.js           # Cidade aproximada pela conexão (só com consentimento; nada é guardado)
│   ├── api/push.js            # Envia as notificações push (chamada só pelo banco, com segredo)
│   └── _lib/seo.js            # Peças comuns (não é rota)
├── supabase/                  # Schema + RLS, seed, promoção de admin, atualizações (04, 05, 07, 08, 09, 10, 11) e exemplos (06)
├── docs/                      # DEPLOY.md e capturas de tela
├── exemplosecret.env          # Modelo das credenciais (sem segredos); a cópia preenchida é o .env
├── LICENSE
└── README.md
```

### Onde ficam os dados

| Onde | O quê |
|------|-------|
| **Supabase (banco)** | Notícias (com tipo, veredito, texto com formatação, vídeo do YouTube (só o identificador), fontes, correções, atualizações ao vivo, cronologia, personagens, gráfico e quem criou), autores, versões anteriores das matérias (só a redação lê), perfis (nome, foto, bio, cargo e selos são públicos; e-mail, cidade e interesses, não), coautores e colaboradores de edição das matérias, estado do modo lockdown, registro de mudanças de cargo e **auditoria** (só coordenação), data em que a idade foi confirmada (a data de nascimento não é guardada), comentários (com a data da última edição pelo autor), denúncias (com a lista dos anexos), favoritos de quem tem conta, newsletter e contagem de leituras; **divisões**, créditos de edição, tags e selos das matérias e o catálogo de **selos** e **tags**; matérias **seguidas**, **notificações** de cada conta e os endereços de entrega do **push** (só de quem ativou); **visitas por dia** (só números: páginas vistas e visitantes diferentes) |
| **Cloudflare (Functions)** | `/api/ext` busca tempo, cotações, futebol e a Wikipédia para o leitor (os serviços não recebem o IP de quem lê) e guarda as respostas em cache por alguns minutos; `/api/local` estima a cidade pela conexão (só com o consentimento “Localização aproximada”, sem guardar nada); `/api/push` entrega as notificações push |
| **Supabase Auth** | Contas e senhas (o Supabase guarda a senha apenas como hash), vínculo com a conta do Google e os apps autenticadores da verificação em duas etapas |
| **Cloudflare Turnstile** | Verificação anti-robô nas páginas de login, cadastro, recuperação e troca de senha (o token vai para o Supabase, que confere com a chave secreta) |
| **YouTube** | Só quando o leitor clica para assistir a um vídeo: o player vem de `youtube-nocookie.com`. Antes do clique, a página carrega apenas a imagem de capa do vídeo |
| **Supabase Storage** | Imagens enviadas pelo painel (bucket público `news-images`; só a redação envia; trocar ou apagar só a coordenação ou quem enviou) |
| **Navegador — `localStorage`** | Sessão de login (gerenciada pelo supabase-js), `jb_theme` (tema), `jb_a11y` (tamanho do texto e alto contraste), `jb_cookies` (consentimento), `jb_history` (histórico de leitura), `jb_favs` (favoritos de visitantes, que vão para a conta no login) e `jb_drafts` (só para a redação: cópia das matérias que estão sendo escritas no editor, apagada ao salvar; até 10), `jb_ext` (cópia das últimas respostas dos serviços, para não pedir de novo a cada página), `jb_place` (cidade escolhida para a previsão, só com “Preferências”) e `jb_visit_day` (data da última visita, só com “Estatísticas”) |
| **Navegador — Cache Storage (PWA)** | Cópia das páginas, estilos e scripts do site já visitados e da lista **pública** de matérias e autores (só de pedidos feitos sem login), usada apenas quando não há internet. Nada de conta, perfil, rascunho ou painel fica guardado |
| **Navegador — `sessionStorage`** | `jb_recovery`: marca temporária de que a aba confirmou um código ou abriu um link de recuperação de senha (sem senha nem token); `jb_login_guard`: quantas senhas erradas seguidas nesta aba e até quando esperar |

> Senhas **nunca** são guardadas no navegador. No modo Supabase, dados antigos do modo de demonstração (contas, sessão, denúncias) são apagados do navegador na primeira visita.
> No **modo de demonstração local** tudo fica no `localStorage` (`jb_news`, `jb_authors`, `jb_versions`, `jb_users`, `jb_session`, `jb_reports`, `jb_comments`, `jb_views`, `jb_newsletter`...), com login **simulado** (hash simples, sem segurança real). Para reiniciar, limpe o armazenamento do site.

## 🔎 Relatório de auditoria (novembro de 2026)

Auditoria técnica de carregamento, segurança, armazenamento, desempenho, compatibilidade com celulares e recuperação de senha, feita sobre o projeto já funcional (sem reconstruí-lo).

### Resultado medido

| Situação | Antes | Depois |
|---|---|---|
| Cabeçalho e rodapé aparecem (rede normal) | 0,75 – 1,6 s | 10 – 100 ms |
| Supabase sem responder | página **sem cabeçalho, rodapé nem conteúdo**, indefinidamente (inclusive no login) | cabeçalho na hora; aviso de erro com "Tentar de novo" em 15 s |
| Supabase fora do ar | "Nenhuma notícia publicada" (falso) | aviso de falha de conexão |
| Avisos de desempenho do Supabase | 8 | 0 |

### Problemas encontrados

| # | Problema | Onde | Gravidade |
|---|---|---|---|
| 1 | Cabeçalho, rodapé e conteúdo só apareciam depois de **todos** os dados chegarem | `layout.js` | Alta |
| 2 | Requisições sem tempo limite: com rede ruim, a página ficava em branco para sempre | `supabase-backend.js` | Alta |
| 3 | Denúncia, perfil e painel diziam "salvo" mesmo quando o servidor recusava (a denúncia podia se perder) | backend e páginas | Alta |
| 4 | Login, cadastro e denúncia enviados antes do JavaScript carregar iam pela URL (senha ou relato visíveis no endereço) | `auth.js`, `denuncias.js` | Alta |
| 5 | Celular: o menu do usuário abria para fora da tela (itens cortados, "Sair" invisível) | `layout.js`, `style.css` | Alta |
| 6 | Celular: busca do menu espremida pela metade; no iPhone, tocar na busca ou na newsletter dava zoom na página (fonte < 16 px) | `style.css` | Média |
| 7 | Celular (320 px): o segundo botão de menu caía para outra linha; o aviso de cookies cobria os formulários | `style.css`, `layout.js` | Baixa |
| 8 | Visitantes e usuários tinham **todos** os privilégios nas tabelas (inclusive TRUNCATE, que o RLS não filtra) | banco | Média |
| 9 | O cliente podia escolher a data de comentários e denúncias; usuário logado podia comentar com o nome de outra pessoa | banco | Média |
| 10 | Anexo de denúncia sem limite de tamanho | banco | Média |
| 11 | Imagens das notícias salvas como texto (data URL) no banco e baixadas em todas as páginas; todos os comentários do site também | backend | Média |
| 12 | Textos de Termos, Privacidade (LGPD), cadastro, denúncia, comentários, Minha Central, perfil e painel diziam que os dados ficavam só no navegador | 9 arquivos | Média |
| 13 | Dados antigos do modo local (contas com hash fraco, sessão, denúncias) continuavam no navegador | navegador | Média |
| 14 | Sem Content-Security-Policy; link de confirmação de cadastro sem endereço de retorno; newsletter revelava quem já era inscrito | `_headers`, backend | Média / Baixa |
| 15 | Políticas RLS reavaliadas linha a linha e chaves estrangeiras sem índice | banco | Baixa |

Não foram encontradas falhas de XSS (todo HTML dinâmico passa por `JB.util.esc`) nem chaves secretas no código: o navegador usa só a chave pública, e a proteção real está no RLS.

### Correções e melhorias

- **Carregamento:** cabeçalho, rodapé e cookies são montados imediatamente; só a área do usuário e o ticker esperam dados. Consultas em paralelo, comentários/denúncias/newsletter baixados apenas na página que os usa, tempo limite em todas as requisições e estados padronizados de "Carregando…" e de erro.
- **Gravações confiáveis:** se o servidor recusar, a tela volta ao estado anterior e um aviso aparece; "salvo" só é exibido após a confirmação do servidor.
- **Segurança no banco** ([`supabase/04_auditoria_seguranca.sql`](supabase/04_auditoria_seguranca.sql), já incorporado ao `01_schema.sql`): privilégios mínimos por coluna, datas e papéis definidos só pelo banco, comentário de usuário logado sempre no nome da conta, limites de tamanho, RLS otimizado e índices. Permissões testadas para visitante, leitor e administrador.
- **Segurança no navegador:** cabeçalhos HTTP com CSP, HSTS e proteção contra *clickjacking* (`_headers`); formulários sensíveis nunca enviam dados pela URL; dados legados do modo local são apagados.
- **Imagens:** envios do painel vão para o **Supabase Storage** (bucket `news-images`, escrita só para editores), e a imagem antiga é apagada ao trocar ou excluir a notícia.
- **Recuperação de senha:** "Esqueci minha senha" com o fluxo oficial do Supabase Auth (`resetPasswordForEmail` → e-mail com código e link → `verifyOtp` do código ou abertura do link → `updateUser`). Resposta igual exista ou não a conta (e para qualquer código recusado), confirmação de senha, telas de link inválido/expirado e de sucesso, e encerramento de todas as sessões após a troca. O código funciona mesmo sem as Redirect URLs configuradas.
- **Armazenamento local:** cada uso foi avaliado; ficam no navegador apenas tema, preferências de acessibilidade, consentimento de cookies, histórico de leitura e favoritos de visitantes (que passam para a conta no login). Documentação e textos da interface corrigidos.
- **Celular:** menu do usuário dentro da tela, busca ocupando a largura toda, campos sem zoom automático no iPhone, cabeçalho em uma linha até 320 px e aviso de cookies sem cobrir o conteúdo.

### Validação

- Não há etapa de build, lint nem suíte de testes no projeto; todos os scripts passaram por verificação de sintaxe (`node --check`).
- **Testes automatizados com Chrome headless** (servidor local aplicando o `_headers`, com CSP ativa): visitante, leitor, administrador (upload no Storage, fluxo editorial, exclusão, moderação, rollback com a rede cortada), recuperação de senha de ponta a ponta com sessão de recuperação real, modo de demonstração local, rede normal/bloqueada/sem resposta e larguras de 320, 360, 390, 768, 1500 e 1920 px. Todos passando.
- **Testes de permissão no banco** em transações desfeitas, para visitante, leitor e administrador.
- **Hierarquia da redação (novembro de 2026):** antes de ir para produção, a migração `07_hierarquia.sql` rodou com 44 checagens de permissão numa transação desfeita (jornalista, outro jornalista, coordenador, administrador, leitor e visitante). Na interface: 52 checagens dos três cargos no modo local (inclusive 320 e 390 px), 15 no Supabase real com CSP (perfis públicos, selo e funções recusadas para visitantes) e a bateria anterior de regressão, todas passando. Ainda não testado: o painel logado no Supabase com contas reais de coordenador e jornalista.
- **Recuperação por código:** código recusado testado contra o Supabase real; fluxo completo (verificação, senha recusada e nova tentativa sem reenviar o código, troca da senha e encerramento global das sessões) com as respostas do Supabase simuladas no navegador.
- Não testado automaticamente: a entrega real do e-mail de recuperação e um código real (dependem do SMTP e do modelo de e-mail configurados no Supabase).

- **Editor, vídeo, comentários editáveis, gráficos e nova identidade visual (novembro de 2026):** testes de unidade do texto formatado (escape, links só http/https, intertítulos, listas, entrevistas), do reconhecimento de links do YouTube e dos cinco gráficos (60 checagens); no navegador, modo local com 102 checagens (cores da marca e das editorias, fontes locais sem Google, modo escuro e alto contraste, editor com formatação, colar do Google Docs com script malicioso, vídeo só depois do clique, gráficos, editar/excluir comentário, permissões de jornalista, 320/390/1500 px sem rolagem lateral em todas as páginas) e Supabase real com CSP (16 checagens, inclusive o site novo funcionando com o banco ainda sem a migração 09); a migração 09 rodou antes num ensaio desfeito com 25 checagens de permissão (dona edita só o texto do próprio comentário, outra conta/visitante/conta não liberada não editam, admin não reescreve mas modera, vídeo validado, versionado e auditado) e foi aplicada em produção; a *Pages Function* foi testada no simulador do Cloudflare (`wrangler pages dev`): prévia com dados da matéria, cabeçalhos de segurança mantidos e página sem erros.
- **SEO, PWA, redes sociais e barra do editor (novembro de 2026):** no simulador do Cloudflare com o Supabase real e a CSP ativa, 42 checagens: prévia (Open Graph, Twitter, canonical) na capa, nas seções e na matéria, prévia genérica quando a matéria não existe, `robots.txt`, `sitemap.xml` com as matérias publicadas, 404 de verdade, service worker ativo, nada de conta guardado no aparelho, matéria já aberta e capa legíveis sem internet, aviso de sem conexão nas páginas nunca abertas, volta à rede quando a conexão retorna, redes sociais no rodapé (também em alto contraste), barra do editor rolando com a página sem cobrir a coluna lateral e 320/390/1920 px sem rolagem lateral; endereços com dados de login (`?code=`) nunca vão para o cache do aparelho. Regressão: testes de unidade (60), modo local (102) e Supabase real com CSP (15 + 15 da hierarquia + 42 da Central de Segurança), todos passando; e, no banco, em transações desfeitas, 25 checagens de comentários e vídeo, 45 de idade/MFA/auditoria e a bateria da hierarquia, sem nenhuma falha.
- **Capa sem espaços vazios, menus animados e barra de formatação (novembro de 2026):** a barra de formatação do editor gruda no topo da janela ao rolar (antes ficava a 71 px, com o texto aparecendo por cima); capa conferida em 390, 1100, 1280 e 1500 px, no modo escuro e com dados variados (uma ou duas coberturas ao vivo, sem editorial, só uma editoria do par); menu lateral e menu do perfil com ícones e animação de entrada (com movimento reduzido no sistema, só esmaecem), sem rolagem lateral em 320/390 px. Regressão: modo local (102) e capa com o Supabase real, sem erros.
- **PWA que demorava a atualizar (novembro de 2026):** no simulador do Cloudflare, depois de um deploy o HTML chegava novo e o JavaScript/CSS velho por até 1 h (o `_headers` dava `max-age=3600` a todo `/assets/`, e o service worker aceitava essa cópia do navegador), e o app instalado voltava do segundo plano mostrando a página antiga. Corrigido e conferido em 8 checagens: deploy aparece já na visita seguinte (HTML, JS e CSS), app recarrega sozinho depois de 6 min fora e não depois de 2, nem com comentário digitado, nem no painel, nem numa aba comum do navegador; quem tinha a versão antiga instalada passa para a nova sozinho em poucas visitas.
- **JB Educa, tags e selos, notificações, serviços, painel novo, cookies e animações (novembro de 2026):** a migração `11_divisoes_tags_notificacoes.sql` rodou antes num ensaio desfeito e foi aplicada em produção; os exemplos do JB Educa (parte 2 do `06`) foram ensaiados do mesmo jeito (o ensaio pegou o `$$` das fórmulas fechando o bloco SQL, corrigido). Serviços testados com dados reais: tempo (cidade, capitais), cotações (moedas, cripto, conversor), futebol (Série A, Libertadores e Copa do Brasil: mata-mata como Semifinal/Final e copas sem tabela) e Hoje na História; o proxy `/api/ext` (fontes fora da lista e parâmetros inválidos recusados, cache funcionando) e o `rss.xml` com as matérias publicadas. No Chrome com a CSP ativa e o Supabase real: 21 páginas (públicas, painel e editor) em 390 e 1500 px sem erros e sem rolagem lateral; aviso de cookies na primeira visita com os botões da janela “Escolher” clicáveis (antes o aviso cobria a janela); animações completas, só esmaecendo com o “reduzir movimento” do sistema e nada preso escondido; barra de leitura começando em 0 nas matérias longas. Conferido também que cada `id` usado pelos scripts existe na página e que o script de tema de todas as 42 páginas bate com o hash da CSP.

### Pendências e riscos conhecidos

- Configurar **SMTP próprio**, as **Redirect URLs** e o **modelo do e-mail "Reset Password" com `{{ .Token }}`** no Supabase (ver [docs/DEPLOY.md](docs/DEPLOY.md)); sem isso, leitores não recebem o e-mail de recuperação nem o de confirmação, e o e-mail não mostra o código.
- O CAPTCHA protege só as rotas de autenticação (é o que o Supabase oferece). Comentários e denúncias exigem conta; eles, a newsletter e os anexos de denúncia (20 arquivos por conta a cada 10 min) têm limite no banco, mas não CAPTCHA; o contador de leituras não tem limite.
- Denúncia anônima não guarda nome nem e-mail, mas o Storage registra qual conta enviou cada anexo (`owner_id`), visível para a coordenação. Anexo enviado de uma denúncia que depois falhou fica órfão no bucket `report-files`.
- Imagem do meio do texto removida durante a edição continua no bucket `news-images` (as versões anteriores ainda podem usá-la); ela só é apagada quando a matéria é excluída.
- Quem perde o celular da verificação em duas etapas precisa que o administrador remova o fator no painel do Supabase (**Authentication → Users**).
- Notícias sem paginação (adequado para dezenas ou poucas centenas de matérias).
- Proteção contra senhas vazadas (HaveIBeenPwned) só existe no plano Pro do Supabase.
- `supabase-js` 2.45.4 está defasado; atualizar com teste completo.
- **Push com o site fechado** só funciona depois de cadastrar as chaves VAPID e o segredo do gancho no Cloudflare e no Vault do Supabase ([docs/DEPLOY.md](docs/DEPLOY.md)); sem isso, os avisos aparecem só no sino do site.
- O futebol usa a chave pública de testes da TheSportsDB: classificação só com os primeiros colocados e limite de pedidos (o cache segura o uso normal). Uma chave própria vai em `THESPORTSDB_KEY`.
- Os materiais de exemplo do JB Educa (parte 2 do `06_exemplos_secoes.sql`) não foram inseridos no banco publicado.

## 🔐 Segurança do código público

O repositório pode ser público sem expor o portal:

- **`assets/js/config.js`** contém só a *Project URL*, a chave **publishable** do Supabase e a chave **do site** do Turnstile (pública; a secreta fica só no Supabase). Ela é pública por natureza (qualquer visitante a vê no navegador) e não dá acesso além do que as políticas RLS permitem.
- **Quem protege os dados é o banco:** RLS e privilégios por coluna em todas as tabelas ([`supabase/01_schema.sql`](supabase/01_schema.sql)); só coordenadores e administradores leem denúncias e a lista da newsletter, só a redação grava notícias e imagens (o jornalista, só as próprias e sem publicar) e o cargo só muda pela função `set_member_role`, que segue a hierarquia. Os avisos de segurança do Supabase que restam são intencionais (funções que o site chama de propósito, como `hit_news`, `delete_my_account`, `public_profile` e as de cargo, que checam permissão por dentro) ou exigem o plano Pro (proteção contra senhas vazadas).
- **Nunca vão para o repositório:** a chave `service_role` / *secret*, a senha do banco, o `.env` com as credenciais pessoais (só o modelo `exemplosecret.env`, com marcadores, é versionado), e-mails ou IDs de contas reais. Os scripts SQL usam apenas marcadores (`TROQUE-PELO-SEU-EMAIL@exemplo.com`).
- O administrador de exemplo do **modo de demonstração local** existe só no `localStorage` de quem abre o site sem Supabase; não é uma conta do portal publicado.

## 🧰 Tecnologias

- HTML5, CSS3 e JavaScript nativo (ES6+)
- [Supabase](https://supabase.com) (`supabase-js` 2.45.4 incluído em `assets/vendor/supabase/`, licença MIT) — banco Postgres, autenticação, Storage e RLS
- [Cloudflare Pages](https://pages.cloudflare.com) — hospedagem estática
- [Bootstrap 5.3.3](https://getbootstrap.com/) — grid, navbar, offcanvas, modal, formulários e abas (licença MIT)
- Fontes *Source Serif 4* (títulos e texto das matérias) e *Inter* (interface), servidas pelo próprio site em `assets/fonts/` (licença SIL OFL; sem pedidos ao Google)
- Cloudflare Pages Functions — prévia de compartilhamento das páginas e matérias, `sitemap.xml`, `robots.txt`, `rss.xml`, proxy com cache dos serviços, cidade aproximada e envio das notificações push (`functions/`)
- Fontes abertas dos serviços: [Open-Meteo](https://open-meteo.com) (tempo e cidades), [ViaCEP](https://viacep.com.br), [AwesomeAPI](https://docs.awesomeapi.com.br) (cotações), [TheSportsDB](https://www.thesportsdb.com) (futebol) e a [Wikipédia](https://pt.wikipedia.org) (Hoje na História, CC BY-SA)
- Animações em CSS e JavaScript próprios (`motion.css`/`motion.js`, com `IntersectionObserver`), sem bibliotecas
- Service worker e Web App Manifest (PWA): instalação como app e leitura offline do que já foi aberto

## 🖼️ Imagens

As imagens em `assets/img/` são ilustrativas e **não** representam acontecimentos reais; todo o conteúdo de notícias é fictício. As ilustrações `cat-*.svg` foram criadas para o projeto. Verifique a origem e os direitos das fotografias antes de qualquer uso fora do contexto acadêmico.

## 📄 Licença

Distribuído sob a **[PolyForm Noncommercial License 1.0.0](LICENSE)**: o uso comercial não é permitido sem autorização. Direitos autorais © 2026 Mathias Silva Cunha (GamesYutuber).

A licença cobre o código-fonte do projeto. Componentes de terceiros mantêm suas próprias licenças (Bootstrap — MIT; fontes Source Serif 4 e Inter — SIL OFL, licenças em `assets/fonts/`) e as fotografias podem ter titulares distintos.

## 👥 Equipe e autoria

- **Responsável:** Mathias Silva Cunha
- **Desenvolvimento:** GamesYutuber