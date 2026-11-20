// Cloudflare Pages Function: tags de prévia e JSON-LD da organização na capa ("/"). Ver functions/_lib/seo.js.
import { withSiteTags } from './_lib/seo.js';

export async function onRequestGet({ request, next }) {
    return withSiteTags(await next(), request);
}
