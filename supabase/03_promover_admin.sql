-- =====================================================================
-- JB — Promover uma conta a administrador/editor
-- 1) Cadastre-se normalmente no site (pages/cadastro.html) ou crie o usuário em
--    Authentication > Users > Add user (marque "Auto Confirm User").
-- 2) Troque o e-mail abaixo pelo SEU e rode no SQL Editor.
-- A senha nunca aparece aqui: é a que você definiu no cadastro.
-- =====================================================================
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'TROQUE-PELO-SEU-EMAIL@exemplo.com');

-- Conferir (deve listar 1 linha com role = admin):
select p.name, u.email, p.role
  from public.profiles p join auth.users u on u.id = p.id
 where p.role = 'admin';
