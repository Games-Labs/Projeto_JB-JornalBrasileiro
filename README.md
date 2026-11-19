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

Aplicação **Multi-Page** com front-end estático (**HTML5, CSS3 e JavaScript nativo**, Bootstrap 5 para a interface), sem etapa de build, hospedada no **Cloudflare Pages**. Os dados ficam no **Supabase**: banco Postgres (notícias, autores, versões das matérias, perfis, comentários, denúncias, favoritos, newsletter e contagem de leituras), **Supabase Auth** (contas, login e recuperação de senha) e **Supabase Storage** (imagens enviadas pelo painel). A segurança é garantida no banco, por **políticas RLS** e privilégios mínimos ([`supabase/01_schema.sql`](supabase/01_schema.sql)); o navegador usa apenas a chave pública (*anon/publishable*).

**Público-alvo:** leitores em geral, avaliadores do projeto acadêmico e cidadãos interessados em simulações de portais de notícias e jornalismo investigativo.

**Fluxo principal:** o leitor navega pelas páginas (Início, Notícias, editorias, Ao vivo, Central de Investigações, Verificação de fatos, Opinião, Entrevistas, Arquivo, Equipe, Denúncias, Institucional), vê o ticker de últimas notícias, filtra e busca matérias, comenta, salva favoritos e envia denúncias. Editores produzem, agendam, publicam, corrigem e moderam pelo Painel Administrativo. Tudo é gravado no Supabase e aparece para todos os visitantes.

> **Modo de demonstração local (opcional):** se `assets/js/config.js` não tiver as chaves do Supabase, o site roda offline (até por `file://`) guardando tudo no `localStorage` do navegador, com login apenas simulado. Serve para apresentar o projeto sem internet; o rodapé avisa quando esse modo está ativo.

### B) Requisitos Funcionais

1. Front-end estático publicado no Cloudflare Pages, com dados e autenticação no Supabase.
2. Ticker rotativo no topo com as notícias mais recentes.
3. Navegação entre **páginas HTML independentes**.
4. Filtro de notícias por 12 editorias (Política, Economia, Esportes, Investigação, Tecnologia, Infraestrutura, Brasil, Mundo, Educação, Saúde, Meio Ambiente, Cultura), cada uma com página própria (destaque + descrição), busca por texto e **busca avançada** (autor, tipo de conteúdo, período e editoria).
5. Formulário de denúncias / envio de pautas com opção de anonimato; só a equipe editorial lê as denúncias.
6. Cadastro, login e **recuperação de senha por e-mail** (Supabase Auth).
7. Salvamento e edição do perfil.
8. Área **Minhas Informações** para usuários autenticados.
9. Painel Administrativo com **CRUD** de notícias, **fluxo editorial** (rascunho → em revisão → aprovada → publicada → arquivada), **agendamento**, **histórico de versões** com restauração, cadastro de **autores**, relatórios de **audiência**, dashboard, caixa de denúncias e moderação de comentários.
10. Aviso e painel de consentimento de cookies, com referência à LGPD.
11. Interface responsiva para celulares e desktops.

**Seções jornalísticas:**

| Seção | O que tem |
|-------|-----------|
| **Página inicial** | Manchete, últimas publicações, mais lidas, *Em andamento* (coberturas ao vivo), *Resumo do dia*, *Especial da semana*, blocos de Política/Economia, Investigação, Esportes/Tecnologia, *Editorial e Opinião*, *Verificação de fatos* e mais notícias |
| **Tipos de conteúdo** | Cada matéria é Notícia, Reportagem, Análise, Opinião, Editorial, Entrevista, Verificação de fatos ou Ao vivo, com selo visível para o leitor separar informação de opinião |
| **Ao vivo** (`ao-vivo.html`) | Cobertura em tempo real: atualizações com horário e autor; a página do leitor se atualiza sozinha a cada 30 s |
| **Central de Investigações** (`investigacao.html`) | Reportagens com **cronologia**, **personagens envolvidos**, **fontes/documentos** e **gráfico** |
| **Verificação de fatos** (`verificacao.html`) | Checagens classificadas como *Verdadeiro*, *Impreciso*, *Fora de contexto* ou *Falso*, com filtro e metodologia |
| **Opinião e análise** (`opiniao.html`) | Editoriais, colunas e análises, com a lista de **colunistas** |
| **Entrevistas** (`entrevistas.html`) | Perguntas e respostas (linhas `P:` / `R:` no texto) |
| **Arquivo** (`arquivo.html`) | Todas as publicações agrupadas por mês, com filtro por tipo e editoria |
| **Equipe / autor** (`autor.html`) | Equipe e colunistas; `autor.html?nome=...` mostra perfil e matérias de cada autor |
| **Institucional** | Política editorial, política de correções, transparência e metodologia, expediente, termos e LGPD |

**Em cada matéria:** autor (com link para o perfil), data de publicação e de **atualização**, tempo de leitura, leituras, fontes e referências, quadro de **correções**, gráfico com tabela equivalente, *Leia também*, comentários, favoritar, compartilhar, imprimir e **modo leitura**.

**Extras para o leitor:** **Modo escuro**, **acessibilidade** (tamanho do texto e alto contraste, no rodapé e no menu lateral; link "Pular para o conteúdo"), **Minha Central** (favoritos, histórico e recomendações), ranking **Mais lidas**, newsletter demonstrativa e foto de perfil.
**Extras para o editor:** seletor de imagem (galeria local, envio do computador com redução automática para o Supabase Storage, ou URL), visualização prévia de matérias não publicadas ou agendadas, filtros da tabela por status/tipo, publicação de atualizações ao vivo na hora, registro de correções e manchete da capa.

### C) Usuários

| Perfil | O que pode fazer |
|--------|------------------|
| **Visitante** | Navegar, ler notícias, filtrar, buscar, comentar, enviar denúncias e salvar favoritos no próprio navegador. |
| **Leitor cadastrado** | Tudo acima + entrar, editar perfil e foto, favoritos na conta, comentar com o nome da conta e recuperar a senha. |
| **Administrador / Editor** | Acessar o painel, criar/editar/excluir/agendar notícias, mover no fluxo editorial, restaurar versões, cadastrar autores, ver a audiência, ler/excluir denúncias e moderar comentários. |

Administradores são promovidos apenas pelo SQL Editor do Supabase ([`supabase/03_promover_admin.sql`](supabase/03_promover_admin.sql)); no site publicado não existe conta ou senha padrão.

## 🚀 Como executar

**Publicado:** siga o passo a passo de **[docs/DEPLOY.md](docs/DEPLOY.md)** (Supabase + Cloudflare Pages). Em resumo:

1. Rode [`supabase/01_schema.sql`](supabase/01_schema.sql) (e, opcionalmente, `02_seed.sql` e `06_exemplos_secoes.sql`) no SQL Editor do Supabase. Projetos criados com versões anteriores rodam só as atualizações que faltam: [`04_auditoria_seguranca.sql`](supabase/04_auditoria_seguranca.sql) e [`05_secoes_editoriais.sql`](supabase/05_secoes_editoriais.sql).
2. Cole a **Project URL** e a chave **anon/publishable** em [`assets/js/config.js`](assets/js/config.js). Nunca use a `service_role`.
3. Publique a pasta no Cloudflare Pages (sem build), configure as URLs de redirecionamento e o SMTP no Supabase e crie o primeiro administrador.

**Teste local:** sirva a pasta por HTTP (`npx serve .` ou Live Server); o login do Supabase não é confiável em `file://`.

## 🗂️ Estrutura do projeto

```
JB/
├── index.html                 # Homepage
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
│   ├── central.html           # Minha Central: favoritos, histórico, recomendações
│   ├── denuncias.html         # Denuncie / Envie uma Pauta
│   ├── institucional.html     # Quem somos, políticas editorial e de correções, metodologia, expediente, termos, LGPD
│   ├── login.html · cadastro.html · perfil.html
│   ├── recuperar-senha.html   # Pedir o link de recuperação de senha
│   ├── redefinir-senha.html   # Aberta pelo link do e-mail: define a nova senha
│   └── admin.html             # Painel Administrativo
├── assets/
│   ├── css/style.css          # Tema do JB sobre o Bootstrap
│   ├── js/
│   │   ├── config.js          # URL e chave pública do Supabase (única configuração)
│   │   ├── storage.js         # Objeto JB, utilitários, preferências e modo de demonstração local
│   │   ├── supabase-backend.js# Dados, login e imagens no Supabase (assume quando config.js está preenchido)
│   │   ├── layout.js          # Ticker, cabeçalho, rodapé e cookies
│   │   └── home · news-list · article · arquivo · autor · central · denuncias · auth · perfil · admin .js
│   ├── favicon/               # Ícones do site (favicon.io)
│   ├── img/                   # Imagens locais e ilustrações SVG
│   └── vendor/                # Bootstrap 5.3.3 e supabase-js 2.45.4 (cópias locais)
├── supabase/                  # Schema + RLS, seed, promoção de admin, atualizações (04, 05) e exemplos (06)
├── docs/                      # DEPLOY.md e capturas de tela
├── LICENSE
└── README.md
```

### Onde ficam os dados

| Onde | O quê |
|------|-------|
| **Supabase (banco)** | Notícias (com tipo, veredito, fontes, correções, atualizações ao vivo, cronologia, personagens e gráfico), autores, versões anteriores das matérias (só editores leem), perfis, comentários, denúncias, favoritos de quem tem conta, newsletter e contagem de leituras |
| **Supabase Auth** | Contas e senhas (o Supabase guarda a senha apenas como hash) |
| **Supabase Storage** | Imagens enviadas pelo painel (bucket público `news-images`; só editores enviam) |
| **Navegador — `localStorage`** | Sessão de login (gerenciada pelo supabase-js), `jb_theme` (tema), `jb_a11y` (tamanho do texto e alto contraste), `jb_cookies` (consentimento), `jb_history` (histórico de leitura) e `jb_favs` (favoritos de visitantes, que vão para a conta no login) |
| **Navegador — `sessionStorage`** | `jb_recovery`: marca temporária de que a aba abriu um link de recuperação de senha (sem senha nem token) |

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
- **Recuperação de senha:** "Esqueci minha senha" com o fluxo oficial do Supabase Auth (`resetPasswordForEmail` → link por e-mail → `updateUser`). Resposta igual exista ou não a conta, confirmação de senha, telas de link inválido/expirado e de sucesso, e encerramento de todas as sessões após a troca.
- **Armazenamento local:** cada uso foi avaliado; ficam no navegador apenas tema, preferências de acessibilidade, consentimento de cookies, histórico de leitura e favoritos de visitantes (que passam para a conta no login). Documentação e textos da interface corrigidos.
- **Celular:** menu do usuário dentro da tela, busca ocupando a largura toda, campos sem zoom automático no iPhone, cabeçalho em uma linha até 320 px e aviso de cookies sem cobrir o conteúdo.

### Validação

- Não há etapa de build, lint nem suíte de testes no projeto; todos os scripts passaram por verificação de sintaxe (`node --check`).
- **Testes automatizados com Chrome headless** (servidor local aplicando o `_headers`, com CSP ativa): visitante, leitor, administrador (upload no Storage, fluxo editorial, exclusão, moderação, rollback com a rede cortada), recuperação de senha de ponta a ponta com sessão de recuperação real, modo de demonstração local, rede normal/bloqueada/sem resposta e larguras de 320, 360, 390, 768, 1500 e 1920 px. Todos passando.
- **Testes de permissão no banco** em transações desfeitas, para visitante, leitor e administrador.
- Não testado automaticamente: a entrega real do e-mail de recuperação (depende do SMTP configurado no Supabase).

### Pendências e riscos conhecidos

- Configurar **SMTP próprio** e as **Redirect URLs** no Supabase (ver [docs/DEPLOY.md](docs/DEPLOY.md)); sem isso, leitores não recebem o e-mail de recuperação nem o de confirmação.
- Sem CAPTCHA: comentários anônimos, denúncias, newsletter e contador de leituras podem receber spam.
- Notícias sem paginação (adequado para dezenas ou poucas centenas de matérias).
- Proteção contra senhas vazadas (HaveIBeenPwned) só existe no plano Pro do Supabase.
- `supabase-js` 2.45.4 está defasado; atualizar com teste completo.

## 🔐 Segurança do código público

O repositório pode ser público sem expor o portal:

- **`assets/js/config.js`** contém só a *Project URL* e a chave **publishable** do Supabase. Ela é pública por natureza (qualquer visitante a vê no navegador) e não dá acesso além do que as políticas RLS permitem.
- **Quem protege os dados é o banco:** RLS e privilégios por coluna em todas as tabelas ([`supabase/01_schema.sql`](supabase/01_schema.sql)); só editores leem denúncias, versões e a lista da newsletter, e só eles gravam notícias e imagens. Os avisos de segurança do Supabase que restam são intencionais (funções `is_admin`, `hit_news` e `delete_my_account`) ou exigem o plano Pro (proteção contra senhas vazadas).
- **Nunca vão para o repositório:** a chave `service_role` / *secret*, a senha do banco, e-mails ou IDs de contas reais. Os scripts SQL usam apenas marcadores (`TROQUE-PELO-SEU-EMAIL@exemplo.com`).
- O administrador de exemplo do **modo de demonstração local** existe só no `localStorage` de quem abre o site sem Supabase; não é uma conta do portal publicado.

## 🧰 Tecnologias

- HTML5, CSS3 e JavaScript nativo (ES6+)
- [Supabase](https://supabase.com) (`supabase-js` 2.45.4 incluído em `assets/vendor/supabase/`, licença MIT) — banco Postgres, autenticação, Storage e RLS
- [Cloudflare Pages](https://pages.cloudflare.com) — hospedagem estática
- [Bootstrap 5.3.3](https://getbootstrap.com/) — grid, navbar, offcanvas, modal, formulários e abas (licença MIT)
- Fontes *Merriweather* e *Inter* (Google Fonts, opcionais; há fallback para fontes do sistema)

## 🖼️ Imagens

As imagens em `assets/img/` são ilustrativas e **não** representam acontecimentos reais; todo o conteúdo de notícias é fictício. As ilustrações `cat-*.svg` foram criadas para o projeto. Verifique a origem e os direitos das fotografias antes de qualquer uso fora do contexto acadêmico.

## 📄 Licença

Distribuído sob a **[PolyForm Noncommercial License 1.0.0](LICENSE)**: o uso comercial não é permitido sem autorização. Direitos autorais © 2026 Mathias Silva Cunha (GamesYutuber).

A licença cobre o código-fonte do projeto. Componentes de terceiros mantêm suas próprias licenças (Bootstrap — MIT; fontes do Google — SIL OFL) e as fotografias podem ter titulares distintos.

## 👥 Equipe e autoria

- **Responsável:** Mathias Silva Cunha
- **Desenvolvimento:** GamesYutuber