import { catalog, slugPattern, type ExerciseCard } from '../catalog';
import { websiteOrigin } from '../catalog-public';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  const origin = websiteOrigin();
  if (!origin) return new Response(null, { status: 404, headers: noStore });
  try {
    const paths = new Set(['/']);
    const signal = AbortSignal.timeout(8000);
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const page: { items: ExerciseCard[]; nextCursor: string | null } = await catalog('/api/v1/exercises?' + query, signal);
      for (const item of page.items) {
        if (item.slug.length <= 100 && slugPattern.test(item.slug)) paths.add('/bai-tap/' + item.slug);
      }
      cursor = page.nextCursor;
      if (paths.size > 50000) throw new Error('Catalog sitemap exceeds URL limit');
    } while (cursor);
    const entries = Array.from(paths, path => `<url><loc>${origin}${path}</loc></url>`).join('\n');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`, {
      headers: { ...noStore, 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch {
    return new Response(null, { status: 503, headers: noStore });
  }
}
