// =====================================================================
// CONFIGURAÇÃO DO SUPABASE
// Supabase → Project Settings → API Keys (veja o README.md)
//
// Use SOMENTE a Project URL e a chave pública (anon / publishable).
// NUNCA coloque aqui a service_role / secret key nem a senha do banco:
// este arquivo é público no GitHub Pages.
// =====================================================================

const SUPABASE_URL = 'https://xtzpwcfjspoiibjehanb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_49tIHuDjJeOLRv6JS7xlxg_L7nb5Gn8';

// =====================================================================
// IDENTIDADE
// LOGO_URL: caminho do logo oficial Autoglass (ex.: 'assets/img/logo-autoglass.svg').
// Enquanto estiver vazio, o sistema mostra o nome AUTOGLASS em texto.
// =====================================================================
const LOGO_URL = '';

window.PJ_CONFIG = Object.freeze({ SUPABASE_URL, SUPABASE_ANON_KEY, LOGO_URL });
