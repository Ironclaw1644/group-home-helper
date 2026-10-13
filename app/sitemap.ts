import type { MetadataRoute } from 'next';
import { listJurisdictionDetails } from '@/lib/jurisdictions';

const SITE = 'https://flipbrief.com';

export const revalidate = 3600;

/** The landing page, the state index, and one page per state and DC. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const states = await listJurisdictionDetails();
  return [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/states`, changeFrequency: 'monthly', priority: 0.8 },
    ...states.map((s) => ({
      url: `${SITE}/states/${s.code}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6
    }))
  ];
}
