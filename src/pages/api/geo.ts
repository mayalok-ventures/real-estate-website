import type { APIRoute } from 'astro';
import { isCountrySupported, getCountryPricing, TIMEZONE_COUNTRY_MAP } from '../../lib/pricingData';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  // 1. Manual query override (?country=XX)
  const queryCountry = url.searchParams.get('country');
  const queryTz = url.searchParams.get('tz');

  let detectedCountry: string | null = null;

  if (queryCountry && queryCountry.trim().length > 0) {
    detectedCountry = queryCountry.trim().toUpperCase();
  }

  // 2. Cloudflare IP Country Header
  if (!detectedCountry) {
    const cfCountry = request.headers.get('cf-ipcountry');
    if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
      detectedCountry = cfCountry.trim().toUpperCase();
    }
  }

  // 3. Timezone heuristic if provided in query
  if (!detectedCountry && queryTz) {
    if (TIMEZONE_COUNTRY_MAP[queryTz]) {
      detectedCountry = TIMEZONE_COUNTRY_MAP[queryTz];
    }
  }

  // 4. Fallback: inspect Accept-Language or IP if needed, default to IN/US or query
  if (!detectedCountry) {
    const acceptLang = request.headers.get('accept-language');
    if (acceptLang) {
      const parts = acceptLang.split(',')[0].trim().split('-');
      if (parts.length === 2 && parts[1].length === 2) {
        detectedCountry = parts[1].toUpperCase();
      }
    }
  }

  // If still unknown, default to IN (as India is the core base) or US
  if (!detectedCountry) {
    detectedCountry = 'IN';
  }

  const supported = isCountrySupported(detectedCountry);

  if (supported) {
    const pricing = getCountryPricing(detectedCountry)!;
    return new Response(JSON.stringify({
      success: true,
      country: detectedCountry,
      countryName: pricing.name,
      isSupported: true,
      currency: pricing.currency,
      symbol: pricing.symbol,
      basePrice: pricing.basePrice,
      locale: pricing.locale,
      userTiers: pricing.userTiers,
      leadTiers: pricing.leadTiers,
      storageTiers: pricing.storageTiers,
      integrationTiers: pricing.integrationTiers
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }

  // Non-supported country (not in the 15 countries)
  return new Response(JSON.stringify({
    success: true,
    country: detectedCountry,
    isSupported: false,
    message: 'Regional pricing not published directly. Please contact our team for enterprise licensing and regional purchasing.'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
};
