import type { MetadataRoute } from 'next';

/**
 * Only the landing page and the state pages are public documents. Everything
 * else is the staff app, which redirects a crawler to /login anyway and carries
 * noindex besides; listing it here just saves the crawl budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/api/', '/notes', '/residents', '/reports', '/settings', '/staff', '/supervisor', '/billing', '/forms', '/join']
      }
    ],
    sitemap: 'https://flipbrief.com/sitemap.xml'
  };
}
