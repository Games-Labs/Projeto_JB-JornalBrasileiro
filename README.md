# 📰 Jornal Brasileiro (JB)

> **Portal de Notícias** — Webjornalismo Informativo e Investigativo
> Projeto acadêmico · 100% client-side · sem servidor, sem backend, sem banco de dados remoto.

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

Aplicação **Multi-Page** puramente *client-side*, feita com **HTML5, CSS3 e JavaScript nativo** (com Bootstrap 5 para a interface). Roda integralmente no navegador, de forma local, usando o `localStorage` para simular a persistência de dados e o comportamento de um sistema dinâmico — sem servidor externo.

**Público-alvo:** leitores em geral, avaliadores do projeto acadêmico e cidadãos interessados em simulações de portais de notícias e jornalismo investigativo.

**Fluxo principal:** o usuário abre o arquivo `index.html` no navegador. As notícias cadastradas no Painel Administrativo e as denúncias enviadas pelo formulário são salvas no `localStorage`. O leitor navega pelas páginas (Início, Notícias, Política, Economia, Esportes, Denúncias, Institucional), vê o ticker de últimas notícias, filtra por categoria e usa a autenticação simulada, cujas contas ficam salvas localmente.

### B) Requisitos Funcionais

1. Execução integral no navegador local, sem servidor externo.
2. Ticker rotativo no topo com as notícias mais recentes.
3. Navegação entre **páginas HTML independentes**.
4. Filtro de notícias por categoria (Política, Economia, Esportes, Investigação, Tecnologia, Infraestrutura) e busca por texto.
5. Formulário de denúncias / envio de pautas, com armazenamento local e opção de anonimato.
6. Cadastro e login simulados via `localStorage`.
7. Salvamento e edição do perfil.
8. Área **Minhas Informações** para usuários autenticados.
9. Painel Administrativo com **CRUD** de notícias (criar, editar, excluir) e caixa de denúncias.
10. Aviso e painel de consentimento de cookies, com referência à LGPD.
11. Interface responsiva para celulares e desktops.

### C) Usuários

| Perfil | O que pode fazer |
|--------|------------------|
| **Visitante** | Navegar, ler notícias, filtrar, buscar, ver o ticker, enviar denúncias. |
| **Leitor cadastrado** | Cadastrar-se, entrar, ver e editar o perfil e as preferências. |
| **Administrador / Editor** | Acessar o painel, criar/editar/excluir notícias e gerenciar denúncias. |

## 🚀 Como executar

1. Clone ou baixe o repositório.
2. Abra o arquivo **`index.html`** em qualquer navegador moderno (duplo clique). Não é preciso instalar nada nem iniciar servidor.

**Conta de demonstração do editor:** `admin@jb.com.br` / `admin123`
(os dados iniciais e essa conta são criados automaticamente no primeiro acesso).

## 🗂️ Estrutura do projeto

```
JB/
├── index.html                 # Homepage
├── pages/
│   ├── noticias.html          # Listagem + filtros por categoria + busca
│   ├── politica.html          # Editoria Política
│   ├── economia.html          # Editoria Economia
│   ├── esportes.html          # Editoria Esportes
│   ├── noticia.html           # Leitura de uma matéria (?id=)
│   ├── denuncias.html         # Denuncie / Envie uma Pauta
│   ├── institucional.html     # Quem somos, expediente, termos, LGPD
│   ├── login.html · cadastro.html · perfil.html
│   └── admin.html             # Painel Administrativo (independente)
├── assets/
│   ├── css/style.css          # Tema do JB sobre o Bootstrap
│   ├── js/
│   │   ├── storage.js         # Camada de dados (localStorage) compartilhada
│   │   ├── layout.js          # Ticker, cabeçalho, rodapé e cookies
│   │   └── home · news-list · article · denuncias · auth · perfil · admin .js
│   ├── img/                   # Imagens locais e ilustrações SVG
│   └── vendor/bootstrap/      # Bootstrap 5.3.3 (cópia local, funciona offline)
├── docs/                      # Capturas de tela
├── LICENSE
└── README.md
```

### Dados no `localStorage`

| Chave | Conteúdo |
|-------|----------|
| `jb_news` | Notícias (CRUD pelo painel) |
| `jb_users` | Contas cadastradas |
| `jb_session` | Id do usuário autenticado |
| `jb_reports` | Denúncias e pautas enviadas |
| `jb_cookies` | Preferências de cookies (LGPD) |

> ⚠️ O login é **simulado**: as senhas são guardadas com um hash simples apenas para demonstração e **não** oferecem segurança real.
> Os dados ficam só no navegador em uso. Para reiniciar o portal, limpe o armazenamento do site.

## 🧰 Tecnologias

- HTML5, CSS3 e JavaScript nativo (ES6+)
- [Bootstrap 5.3.3](https://getbootstrap.com/) — grid, navbar, offcanvas, modal, formulários e abas (licença MIT)
- Fontes *Merriweather* e *Inter* (Google Fonts, opcionais; há fallback para fontes do sistema)

## 🖼️ Imagens

As imagens em `assets/img/` são ilustrativas e **não** representam acontecimentos reais; todo o conteúdo de notícias é fictício. As ilustrações `cat-*.svg` foram criadas para o projeto. Verifique a origem e os direitos das fotografias antes de qualquer uso fora do contexto acadêmico.

## 📄 Licença

Distribuído sob a **[PolyForm Noncommercial License 1.0.0](LICENSE)**: o uso comercial não é permitido sem autorização. Direitos autorais © 2026 Mathias Silva Cunha (GamesYutuber).

A licença cobre o código-fonte do projeto. Componentes de terceiros mantêm suas próprias licenças (Bootstrap — MIT; fontes do Google — SIL OFL) e as fotografias podem ter titulares distintos.

## 👥 Equipe e autoria

- **Responsável:** Mathias Silva Cunha
- **Desenvolvimento:** GamesYutuber — mathiasscgamesyutuber2007@gmail.com
