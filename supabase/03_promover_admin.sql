-- =====================================================================
-- JB — Promover uma conta a ADMINISTRADOR (o cargo mais alto)
-- 1) Cadastre-se normalmente no site (pages/cadastro.html) ou crie o usuário em
--    Authentication > Users > Add user (marque "Auto Confirm User").
-- 2) Troque o e-mail abaixo pelo SEU e rode no SQL Editor.
-- A senha nunca aparece aqui: é a que você definiu no cadastro.
--
-- Os outros cargos (coordenador e jornalista) NÃO precisam deste arquivo: o administrador
-- os define no site, em Painel Administrativo > Equipe e cargos. Administrador só por aqui.
-- Para rebaixar um administrador, troque 'admin' por 'coordenador', 'jornalista' ou 'leitor'.
-- =====================================================================
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'TROQUE-PELO-SEU-EMAIL@exemplo.com');

-- Conferir a equipe da redação (admin, coordenadores e jornalistas):
select p.name, u.email, p.role
  from public.profiles p join auth.users u on u.id = p.id
 where p.role in ('admin', 'coordenador', 'jornalista')
 order by p.role, p.name;
