/* =========================================================
   JB — Configuração do Supabase  (ÚNICO lugar onde ficam as chaves)

   Onde pegar: painel do Supabase > Project Settings > API
     - SUPABASE_URL      -> "Project URL"
     - SUPABASE_ANON_KEY -> chave "anon" / "publishable"

   ATENÇÃO:
   - A chave anon/publishable PODE ser commitada: ela é pública por design
     (qualquer visitante a vê no navegador). Quem protege os dados é o RLS.
   - NUNCA cole aqui a "service_role" / "secret". Ela ignora o RLS.
   - TURNSTILE_SITE_KEY também é pública (chave do site no painel do Cloudflare Turnstile).
   - Se os valores abaixo forem trocados por "COLE_AQUI", o site passa a rodar no
     modo de demonstração local (sem servidor; dados só no navegador, login simulado).
   ========================================================= */
window.JB_CONFIG = {
    SUPABASE_URL: 'https://cjzinwnyzcsxtwmgbcpo.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_-FcYDCNnccpWU5FWIFiKkA_6Da70Hbn',
    // CAPTCHA anti-robô (Cloudflare Turnstile): chave do SITE, pública por design. A chave SECRETA
    // fica só no Supabase (Authentication > Attack Protection). Vazio = sem CAPTCHA.
    TURNSTILE_SITE_KEY: '0x4AAAAAAGJGMpSlDy3NJmPG'
};
