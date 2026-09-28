// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://sahyak.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/api/'),
      customPages: [
        'https://sahyak.com/pricing',
      ],
    }),
  ],
});
