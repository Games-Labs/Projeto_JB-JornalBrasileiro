// Cloudflare Pages Function: tags de prévia (Open Graph / Twitter / canonical) para as páginas de
// pages/ (a matéria tem rota própria em noticia.js, com os dados de cada notícia). Ver functions/_lib/seo.js.
import { withSiteTags } from '../_lib/seo.js';

export async function onRequestGet({ request, next }) {
    return withSiteTags(await next(), request);
}
