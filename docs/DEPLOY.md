# Publicando o JB: Supabase (banco/login) + Cloudflare Pages (site)

O site continua HTML/CSS/JS puro, sem build. O **Supabase** guarda notícias, usuários, comentários etc.
O **Cloudflare Pages** só serve os arquivos estáticos.

> Sem chaves em `assets/js/config.js`, o site roda no **modo de demonstração local** (offline, dados só no `localStorage` do navegador, login simulado). Para o site publicado, use sempre o Supabase.

## 1. Supabase

1. Crie uma conta em <https://supabase.com> e um **New project** (guarde a *Database password* num gerenciador de senhas; o site não usa).
2. Abra **SQL Editor → New query**, cole o conteúdo de [`supabase/01_schema.sql`](../supabase/01_schema.sql) e clique **Run**. Ele cria tabelas, RLS, privilégios mínimos e o bucket de imagens `news-images` do Storage.
   - **Projeto criado com uma versão anterior?** Não rode o 01 de novo: rode só as atualizações que faltam, nesta ordem (todas idempotentes, não apagam dados): [`supabase/04_auditoria_seguranca.sql`](../supabase/04_auditoria_seguranca.sql) (auditoria de segurança) e [`supabase/05_secoes_editoriais.sql`](../supabase/05_secoes_editoriais.sql) (tipos de conteúdo, ao vivo, checagem, agendamento, autores e versões). Sem o 05, o site novo não carrega as notícias.
3. (Opcional) Faça o mesmo com [`supabase/02_seed.sql`](../supabase/02_seed.sql) para carregar as 17 notícias de demonstração e com [`supabase/06_exemplos_secoes.sql`](../supabase/06_exemplos_secoes.sql) para os autores e as matérias de exemplo das seções (ao vivo, editorial, opinião, análise, entrevista e checagens).
4. **Authentication → Sign In / Providers → Email**:
   - Para um trabalho acadêmico é mais simples **desligar "Confirm email"**; assim o cadastro já entra logado.
   - Se deixar ligado, o site avisa "confirme seu e-mail" e o link do e-mail usa a *Site URL* (passo 7).
5. **Project Settings → API** (ou *API Keys*): copie a **Project URL** e a chave **anon / publishable**.
6. Cole as duas em [`assets/js/config.js`](../assets/js/config.js):

   ```js
   window.JB_CONFIG = {
       SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
       SUPABASE_ANON_KEY: 'sua-chave-anon-ou-publishable'
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
5. **Senhas** — **Authentication → Sign In / Providers → Email** (tamanho mínimo e caracteres exigidos): o site exige no mínimo 6 caracteres, igual ao padrão do Supabase; a documentação do Supabase recomenda 8 ou mais. Se aumentar no painel, atualize `PASSWORD_MIN` em `assets/js/storage.js` e os textos "mín. 6 caracteres" das páginas. No plano Pro, ative também **Leaked password protection**.

Por segurança, a tela "Esqueci minha senha" responde sempre a mesma coisa, exista ou não a conta. Se um e-mail não chegar, veja **Authentication → Logs** no painel (é lá que aparecem erros de SMTP).

**Teste completo:** cadastre uma conta com um e-mail seu → **Entrar → Esqueci minha senha** → digite o código do e-mail e a nova senha (ou abra o link) → entre com ela (a antiga deve falhar).

### Criar o primeiro administrador/editor

1. No site publicado, cadastre-se em **Cadastre-se** (use um e-mail seu e uma senha forte).
2. No **SQL Editor**, abra [`supabase/03_promover_admin.sql`](../supabase/03_promover_admin.sql), troque o e-mail pelo seu e rode.
3. Saia e entre de novo: o menu passa a mostrar **Painel Administrativo**.

Não existe conta/senha padrão, e o papel de administrador não pode ser alterado pela API do site (só pelo SQL Editor).

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
5. Volte ao passo 7 do Supabase e informe esse endereço.

### Cabeçalhos de segurança (`_headers`)

O arquivo [`_headers`](../_headers) aplica no Cloudflare: **Content-Security-Policy** (só scripts do próprio site; conexões só com o Supabase do projeto), HSTS, `nosniff`, proteção contra *clickjacking*, `Referrer-Policy` e `Permissions-Policy`. Cuidados:

- **Trocou de projeto Supabase?** Atualize o endereço em `connect-src` no `_headers`, senão o site não consegue falar com o banco.
- **Alterou o script inline de tema** do `<head>` (mesmo um espaço)? Recalcule o hash `sha256-...` em `script-src`, senão o tema escuro deixa de ser aplicado antes da página aparecer:

  ```
  node -e "const c=require('fs').readFileSync('index.html','utf8').match(/<script>(try\{.*?)<\/script>/)[1];console.log('sha256-'+require('crypto').createHash('sha256').update(c).digest('base64'))"
  ```
- Não use `onclick=`/`style` com JavaScript inline em HTML novo: a CSP bloqueia handlers inline (use `addEventListener`).

## 3. Testar localmente

O login do Supabase é mais confiável em `http://` do que em `file://`:

```
npx serve .          # ou a extensão Live Server do VS Code
```

O `_headers` só vale no Cloudflare; localmente a CSP não é aplicada.

## 4. Conferir a segurança (RLS)

No painel do Supabase, **Table Editor**: todas as tabelas devem mostrar *RLS enabled*; em **Advisors → Security Advisor** só devem restar os avisos intencionais sobre `is_admin`, `hit_news` e `delete_my_account` (funções que o site chama de propósito). Teste deslogado em aba anônima:

- Não deve aparecer matéria em rascunho, nem matéria agendada (publicada com data futura), em lugar nenhum.
- `pages/admin.html` mostra "acesso restrito" e, mesmo forçando pela API, o banco recusa escrita.

## Recomeçar do zero

No SQL Editor:

```sql
drop table if exists public.favorites, public.news_views, public.newsletter, public.reports, public.news_versions,
                     public.authors, public.comments, public.news, public.profiles cascade;
drop function if exists public.hit_news(uuid), public.delete_my_account(), public.is_admin(),
                        public.handle_new_user(), public.protect_profile_role(), public.comments_set_author(),
                        public.news_track_changes(), public.news_clear_updated() cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists "news-images: admin lista" on storage.objects;
drop policy if exists "news-images: admin envia" on storage.objects;
drop policy if exists "news-images: admin troca" on storage.objects;
drop policy if exists "news-images: admin apaga" on storage.objects;
```

Esvazie e apague o bucket `news-images` em **Storage** (o SQL não apaga arquivos) e rode o `01_schema.sql` de novo.

## Limites conhecidos (versão acadêmica)

- Fotos de perfil (256 px) continuam salvas como texto (data URL) na tabela `profiles`; só o dono baixa a própria foto. Notícias antigas com imagem em data URL continuam funcionando; novos envios vão para o Storage.
- Contagem de leituras, comentários anônimos, denúncias e newsletter não têm proteção contra spam/robôs além dos limites de tamanho. Para produção: CAPTCHA (Supabase Auth suporta hCaptcha/Turnstile) ou uma Edge Function com limite por IP.
- Todas as notícias publicadas são baixadas de uma vez (sem paginação). Adequado para dezenas/poucas centenas de matérias; acima disso, paginar a listagem.
- Histórico de leitura e favoritos de visitantes sem conta ficam só no navegador (favoritos vão para a conta no login).
- Imagem enviada e descartada antes de salvar a notícia fica órfã no bucket (dá para apagar em **Storage**).
