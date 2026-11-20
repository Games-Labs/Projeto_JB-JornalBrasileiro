# Publicando o JB: Supabase (banco/login) + Cloudflare Pages (site)

O site continua HTML/CSS/JS puro, sem build. O **Supabase** guarda notícias, usuários, comentários etc.
O **Cloudflare Pages** só serve os arquivos estáticos.

> Sem chaves em `assets/js/config.js`, o site roda no **modo de demonstração local** (offline, dados só no `localStorage` do navegador, login simulado). Para o site publicado, use sempre o Supabase.

## 1. Supabase

1. Crie uma conta em <https://supabase.com> e um **New project** (guarde a *Database password* num gerenciador de senhas; o site não usa).
2. Abra **SQL Editor → New query**, cole o conteúdo de [`supabase/01_schema.sql`](../supabase/01_schema.sql) e clique **Run**. Ele cria tabelas, RLS, privilégios mínimos e o bucket de imagens `news-images` do Storage.
   - **Projeto criado com uma versão anterior?** Não rode o 01 de novo: rode só as atualizações que faltam, nesta ordem (todas idempotentes, não apagam dados): [`supabase/04_auditoria_seguranca.sql`](../supabase/04_auditoria_seguranca.sql) (auditoria de segurança) [`supabase/05_secoes_editoriais.sql`](../supabase/05_secoes_editoriais.sql) (tipos de conteúdo, ao vivo, checagem, agendamento, autores e versões) [`supabase/07_hierarquia.sql`](../supabase/07_hierarquia.sql) (cargos coordenador/jornalista, perfis públicos e selo) e [`supabase/08_seguranca.sql`](../supabase/08_seguranca.sql) (MFA obrigatório para a equipe, idade mínima, auditoria, limites contra spam e formatos de imagem) e [`supabase/09_editor_video_comentarios.sql`](../supabase/09_editor_video_comentarios.sql) (vídeo do YouTube nas matérias e edição do próprio comentário). Sem o 09 o site continua no ar, mas sem vídeo e sem edição de comentário (o console avisa). Sem o 05 e o 07, o site novo não carrega as notícias. **Atenção ao 08:** depois dele, toda a equipe (inclusive o administrador) só tem os poderes da redação depois de confirmar a idade e ativar a verificação em duas etapas pelo site novo (`pages/seguranca.html`).
3. (Opcional) Faça o mesmo com [`supabase/02_seed.sql`](../supabase/02_seed.sql) para carregar as 17 notícias de demonstração e com [`supabase/06_exemplos_secoes.sql`](../supabase/06_exemplos_secoes.sql) para os autores e as matérias de exemplo das seções (ao vivo, editorial, opinião, análise, entrevista e checagens).
4. **Authentication → Sign In / Providers → Email**:
   - Para um trabalho acadêmico é mais simples **desligar "Confirm email"**; assim o cadastro já entra logado.
   - Se deixar ligado, o site avisa "confirme seu e-mail" e o link do e-mail usa a *Site URL* (passo 7).
5. **Project Settings → API** (ou *API Keys*): copie a **Project URL** e a chave **anon / publishable**.
6. Cole as duas em [`assets/js/config.js`](../assets/js/config.js):

   ```js
   window.JB_CONFIG = {
       SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
       SUPABASE_ANON_KEY: 'sua-chave-anon-ou-publishable',
       TURNSTILE_SITE_KEY: 'chave-do-site-do-turnstile'   // passo "Segurança" abaixo; '' = sem CAPTCHA
   };
   ```

   - Pode commitar: a chave anon é pública por design.
   - **Nunca** use a `service_role` / `secret` aqui nem em nenhum arquivo do repositório.
7. Depois de publicar no Cloudflare (passo abaixo), volte em **Authentication → URL Configuration** e coloque:
   - **Site URL:** `https://SEU-SITE.pages.dev`
   - **Redirect URLs:** `https://SEU-SITE.pages.dev/**` (e `http://localhost:8080/**` / `http://localhost:3000/**` se testar local)
   - Isso é **obrigatório** para a confirmação de cadastro e para a recuperação de senha: o site pede ao Supabase para voltar a `pages/login.html` e `pages/redefinir-senha.html`. Endereço fora da lista é ignorado e o Supabase manda o usuário para a *Site URL* (e a redefinição não abre).

### Recuperação de senha ("Esqueci minha senha")

O fluxo usa só o Supabase Auth: `resetPasswordForEmail()` envia um e-mail com **código de verificação** e **link**. O leitor escolhe:

- **Código:** digita o código em `pages/recuperar-senha.html`; o Supabase o confere (`verifyOtp` com `type: 'recovery'`) e abre uma sessão de recuperação na própria página. Não depende das Redirect URLs, então funciona também em teste local.
- **Link:** abre `pages/redefinir-senha.html` com a sessão de recuperação (precisa das URLs do passo 7).

Nos dois casos `updateUser()` grava a senha nova e o site encerra todas as sessões da conta (inclusive em outros aparelhos). Código errado, vencido, já usado ou de e-mail sem conta recebe a mesma resposta. Configure no painel:

1. **URLs** — passo 7 acima.
2. **SMTP próprio (necessário para usuários reais)** — **Authentication → Emails → SMTP Settings**. O servidor de e-mail padrão do Supabase só entrega para e-mails da **equipe do projeto** e tem limite de poucos e-mails por hora: sem SMTP próprio, leitores comuns **não recebem** o código nem o link (nem o de confirmação de cadastro). Serviços com plano gratuito: Resend, Brevo, SendGrid; ou o SMTP de uma conta de e-mail. Depois de configurar, ajuste **Authentication → Rate Limits → emails por hora**.
3. **Modelo do e-mail (obrigatório para o código)** — **Authentication → Emails → Templates → Reset Password**. O modelo padrão só tem o link; inclua `{{ .Token }}` para o código aparecer. Assunto sugerido: `Recuperação de senha — Jornal Brasileiro`. Corpo sugerido:

   ```html
   <h2>Recuperação de senha</h2>
   <p>Recebemos um pedido para criar uma nova senha na sua conta do Jornal Brasileiro.</p>
   <p>Seu código de verificação:</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>Digite o código na página "Esqueci minha senha" ou, se preferir, <a href="{{ .ConfirmationURL }}">clique aqui para criar a nova senha</a>.</p>
   <p>O código e o link valem por tempo limitado e só podem ser usados uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.</p>
   ```
4. **Validade e tamanho do código** — **Authentication → Sign In / Providers → Email → Email OTP Expiration** (padrão 3600 s) e **Email OTP Length** (6 a 10 dígitos; o site aceita qualquer um). Link vencido ou já usado mostra a tela "Link expirado ou já utilizado"; código vencido mostra o aviso na própria página. O Supabase também limita as tentativas de verificação por IP (**Authentication → Rate Limits**).
5. **Senhas** — veja "Segurança" abaixo (8+ caracteres com minúscula, maiúscula, número e símbolo).

Por segurança, a tela "Esqueci minha senha" responde sempre a mesma coisa, exista ou não a conta. Se um e-mail não chegar, veja **Authentication → Logs** no painel (é lá que aparecem erros de SMTP).

**Teste completo:** cadastre uma conta com um e-mail seu → **Entrar → Esqueci minha senha** → digite o código do e-mail e a nova senha (ou abra o link) → entre com ela (a antiga deve falhar).

### Segurança: CAPTCHA, verificação em duas etapas, Google e senhas

Faça nesta ordem: **publique o site novo primeiro** e só depois ligue o CAPTCHA (um site antigo, sem o desafio, deixaria de conseguir fazer login).

1. **CAPTCHA (Cloudflare Turnstile)** — no painel do Cloudflare, **Turnstile → Add widget**: domínio do site (`SEU-SITE.pages.dev`; para testar local, inclua `localhost`), modo *Managed*. Copie a **Site key** para `TURNSTILE_SITE_KEY` em `config.js` (pública) e a **Secret key** para o Supabase: **Authentication → Attack Protection → Enable CAPTCHA protection → Cloudflare Turnstile → Secret** e salve. O site passa a pedir o desafio no login, cadastro, "Esqueci minha senha" e troca de senha; quem confere o token é o Supabase. A aba **Segurança** do painel mostra se o Supabase está exigindo.
2. **Verificação em duas etapas (MFA)** — **Authentication → Multi-Factor**: deixe **TOTP (App Authenticator)** com *Enroll* e *Verify* ligados. Obrigatória para a equipe (o banco recusa as ações da redação sem uma sessão verificada) e opcional para leitores, em `pages/seguranca.html`. Se alguém perder o aparelho: **Authentication → Users → (pessoa) → remover o fator**, e ela ativa de novo.
3. **Login com o Google** — no [Google Cloud Console](https://console.cloud.google.com/apis/credentials): *Create credentials → OAuth client ID → Web application*; em **Authorized redirect URIs** coloque `https://SEU-PROJETO.supabase.co/auth/v1/callback` (aparece na tela do provedor no Supabase). Copie *Client ID* e *Client secret* para **Authentication → Sign In / Providers → Google** e ligue. As **Redirect URLs** do passo 7 precisam incluir o site (o Google volta para `pages/login.html`). O botão "Entrar com o Google" só aparece quando o provedor está ligado. Quem entra pelo Google confirma a idade no primeiro acesso.
4. **Senhas** — **Authentication → Sign In / Providers → Email**: *Minimum password length* **8** e *Password requirements* **Lowercase, uppercase letters, digits and symbols** (as mesmas regras do site, em `PASSWORD_MIN`/`util.passwordIssues` de `storage.js`). No plano Pro, ligue também **Leaked password protection**.
5. **Limites de tentativas** — **Authentication → Rate Limits**: o Supabase limita por IP os logins/cadastros, as verificações de código e os e-mails. O site soma uma espera crescente depois de 5 senhas erradas seguidas, e o banco limita comentários (5 por minuto por conta), denúncias e newsletter (30 a cada 10 minutos).
6. **Idade mínima (16 anos)** — imposta pelo banco (`check_signup_age` e `confirm_age`); não há configuração no painel. Para mudar, altere `min_age()` no SQL e `MIN_AGE` em `storage.js`.

### Criar o primeiro administrador/editor

1. No site publicado, cadastre-se em **Cadastre-se** (use um e-mail seu e uma senha forte).
2. No **SQL Editor**, abra [`supabase/03_promover_admin.sql`](../supabase/03_promover_admin.sql), troque o e-mail pelo seu e rode.
3. Saia e entre de novo: o menu passa a mostrar **Painel Administrativo**. No primeiro acesso o site leva a **Segurança da conta** para confirmar a idade (se a conta for antiga ou do Google) e ativar a verificação em duas etapas; só então o painel libera.

Não existe conta/senha padrão, e o cargo de administrador não pode ser dado pela API do site (só pelo SQL Editor).

### Cargos da redação (coordenador e jornalista)

Depois de ter um administrador, os outros cargos são dados pelo próprio site: **Painel Administrativo → Equipe e cargos**. A pessoa precisa ter se cadastrado antes.

| Cargo | O que faz | Quem dá o cargo |
|---|---|---|
| **Administrador** | Tudo | Só o SQL Editor (`03_promover_admin.sql`) |
| **Coordenador** | Publica, arquiva, corrige e exclui matérias; denúncias, comentários e autores; coloca e tira jornalistas | Administrador |
| **Jornalista** | Cria e edita as próprias matérias até “Aprovada” (quem publica é o coordenador) | Administrador ou coordenador |
| **Leitor** | Conta comum | Padrão do cadastro |

As regras valem no banco (RLS e a função `set_member_role`), não só na tela; ninguém muda o próprio cargo, e cada mudança fica registrada na tabela `role_changes`.

## 2. Cloudflare Pages

1. Suba o repositório para o GitHub (com o `config.js` já preenchido).
2. <https://dash.cloudflare.com> → **Workers & Pages → Create application → Pages → Connect to Git** (na tela nova, é o link *"Looking to deploy Pages? Get started"*).
3. Escolha o repositório e configure:

   | Campo | Valor |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | *(vazio)* |
   | Build output directory | `/` |

4. **Save and Deploy**. Cada `git push` na `main` publica sozinho. O endereço é `https://NOME.pages.dev`.
   A pasta [`functions/`](../functions) é publicada junto (Pages Functions, sem configuração): `functions/pages/noticia.js` coloca título, resumo e imagem de cada matéria no HTML para a prévia de links (WhatsApp, X, Facebook). Ela usa a mesma URL e chave **pública** do `config.js`; se trocar de projeto Supabase, troque também ali (ou defina as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` em **Settings → Variables**). Teste com o *Sharing Debugger* do Facebook ou colando o link no WhatsApp. O plano gratuito do Cloudflare inclui 100 mil execuções de Functions por dia.
5. Volte ao passo 7 do Supabase e informe esse endereço.

### Cabeçalhos de segurança (`_headers`)

O arquivo [`_headers`](../_headers) aplica no Cloudflare: **Content-Security-Policy** (só scripts do próprio site; conexões só com o Supabase do projeto), HSTS, `nosniff`, proteção contra *clickjacking*, `Referrer-Policy` e `Permissions-Policy`. Cuidados:

- **Trocou de projeto Supabase?** Atualize o endereço em `connect-src` no `_headers`, senão o site não consegue falar com o banco.
- **Alterou o script inline de tema** do `<head>` (mesmo um espaço)? Recalcule o hash `sha256-...` em `script-src`, senão o tema escuro deixa de ser aplicado antes da página aparecer:

  ```
  node -e "const c=require('fs').readFileSync('index.html','utf8').match(/<script>(try\{.*?)<\/script>/)[1];console.log('sha256-'+require('crypto').createHash('sha256').update(c).digest('base64'))"
  ```
- Não use `onclick=`/`style` com JavaScript inline em HTML novo: a CSP bloqueia handlers inline (use `addEventListener`).
- `https://www.youtube-nocookie.com` em `frame-src` é o player dos vídeos das matérias (só carrega quando o leitor clica).
- As fontes ficam em `assets/fonts/`; por isso `style-src`/`font-src` não liberam mais o Google Fonts.
- `https://challenges.cloudflare.com` em `script-src` e `frame-src` é o CAPTCHA (Turnstile). Sem ele, o desafio não aparece e o login falha quando o Supabase exige CAPTCHA.

## 3. Testar localmente

O login do Supabase é mais confiável em `http://` do que em `file://`:

```
npx serve .          # ou a extensão Live Server do VS Code
```

O `_headers` e a pasta `functions/` só valem no Cloudflare; localmente a CSP não é aplicada e a prévia de links não é montada (o site funciona igual). Para testar os dois como no Cloudflare: `npx wrangler pages dev .` na raiz do projeto.

## 4. Conferir a segurança (RLS)

No painel do Supabase, **Table Editor**: todas as tabelas devem mostrar *RLS enabled*; em **Advisors → Security Advisor** só devem restar os avisos intencionais sobre funções `SECURITY DEFINER` que o site chama de propósito (`hit_news`, `delete_my_account`, `confirm_age`, `log_account_event`, `security_overview`, `public_profile`, `staff_profiles`, `list_members`, `set_member_role` e as de cargo, que checam permissão por dentro) e a proteção contra senhas vazadas (plano Pro). Teste deslogado em aba anônima:

- Não deve aparecer matéria em rascunho, nem matéria agendada (publicada com data futura), em lugar nenhum.
- `pages/admin.html` mostra "acesso restrito" e, mesmo forçando pela API, o banco recusa escrita.

## Recomeçar do zero

No SQL Editor:

```sql
drop table if exists public.audit_log, public.role_changes, public.favorites, public.news_views, public.newsletter, public.reports,
                     public.news_versions, public.authors, public.comments, public.news, public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists check_signup_age on auth.users;
drop function if exists public.hit_news(uuid), public.delete_my_account(), public.is_admin(), public.is_staff(), public.is_editor(),
                        public.my_role(), public.account_ok(), public.min_age(), public.handle_new_user(), public.check_signup_age(),
                        public.protect_profile_role(), public.comments_set_author(), public.news_track_changes(), public.news_clear_updated(),
                        public.news_set_creator(), public.public_profile(uuid), public.staff_profiles(), public.list_members(text),
                        public.set_member_role(uuid, text), public.confirm_age(date), public.log_account_event(text), public.security_overview(),
                        public.audit(text, text, text, text, jsonb), public.audit_news(), public.audit_comment_delete(), public.audit_report_delete(),
                        public.audit_authors(), public.audit_profile_role(), public.throttle_inserts() cascade;
drop policy if exists "news-images: admin lista" on storage.objects;
drop policy if exists "news-images: admin envia" on storage.objects;
drop policy if exists "news-images: admin troca" on storage.objects;
drop policy if exists "news-images: admin apaga" on storage.objects;
```

Esvazie e apague o bucket `news-images` em **Storage** (o SQL não apaga arquivos) e rode o `01_schema.sql` de novo.

## Limites conhecidos (versão acadêmica)

- Fotos de perfil (256 px) continuam salvas como texto (data URL) na tabela `profiles`; só o dono baixa a própria foto. Notícias antigas com imagem em data URL continuam funcionando; novos envios vão para o Storage.
- O CAPTCHA do Supabase cobre só login, cadastro e recuperação. Comentários anônimos, denúncias e newsletter têm limite por minuto no banco (global para visitantes, então um robô insistente pode travar os comentários anônimos por alguns minutos); o contador de leituras não tem limite. Para produção: uma Edge Function que confira o Turnstile antes de gravar.
- Todas as notícias publicadas são baixadas de uma vez (sem paginação). Adequado para dezenas/poucas centenas de matérias; acima disso, paginar a listagem.
- Histórico de leitura e favoritos de visitantes sem conta ficam só no navegador (favoritos vão para a conta no login).
- Imagem enviada e descartada antes de salvar a notícia fica órfã no bucket (dá para apagar em **Storage**).
