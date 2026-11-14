import type { Metadata } from 'next';
import type { CatalogMedia } from './catalog';

function publicOrigin(value: string | undefined) {
  const url = value && URL.parse(value);
  return url && url.origin === value && (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1')) ? url.origin : undefined;
}

export function websiteOrigin() { return publicOrigin(process.env.WEB_PUBLIC_ORIGIN); }

export function publicMetadata(path: string | undefined, title: string, description: string): Metadata {
  const origin = websiteOrigin();
  const canonical = origin && path ? origin + path : undefined;
  return {
    title, description, robots: canonical ? undefined : { index: false, follow: true },
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title, description, url: canonical, siteName: 'SmartGym', locale: 'vi_VN', type: 'website' },
  };
}

function gatewayUrl(value: string | undefined, origin: string) {
  const url = value && URL.parse(value);
  if (!url || url.origin !== origin || url.username || url.password || url.search || url.hash ||
      !/^\/api\/v1\/media\/[a-z][a-z0-9_]{0,79}\/[1-9][0-9]{0,9}$/.test(url.pathname)) return undefined;
  return url.href;
}

export function allowedMedia(media: CatalogMedia[] = []): CatalogMedia[] {
  const origin = publicOrigin(process.env.WEB_CATALOG_MEDIA_ORIGIN);
  if (!origin) return [];
  return media.flatMap(item => {
    const url = gatewayUrl(item.url, origin);
    if (!url || (item.kind !== 'IMAGE' && item.kind !== 'VIDEO')) return [];
    return [{ ...item, url, posterUrl: gatewayUrl(item.posterUrl, origin) }];
  });
}
