// Official Sahyak CRM Global Pricing Specification for 15 Priority Real Estate Markets
// Sourced from SAHYAK_Global_Pricing_Structure.pdf

export interface CapacityTier {
  threshold: number;
  label: string;
  price: number;
}

export interface CountryPricingConfig {
  code: string;
  name: string;
  currency: string;
  symbol: string;
  basePrice: number;
  locale: string;
  userTiers: Record<number, number>;
  leadTiers: Record<number, number>;
  storageTiers: Record<number, number>;
  integrationTiers: Record<number, number>;
}

export const SUPPORTED_COUNTRY_CODES = [
  'US', 'GB', 'AU', 'IN', 'AE', 'DE', 'FR', 'ES', 'CA', 'MX', 'BR', 'ZA', 'SA', 'SG', 'JP'
] as const;

export type SupportedCountryCode = typeof SUPPORTED_COUNTRY_CODES[number];

export const COUNTRY_PRICING: Record<SupportedCountryCode, CountryPricingConfig> = {
  US: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    symbol: '$',
    basePrice: 59,
    locale: 'en-US',
    userTiers: { 1: 0, 5: 99, 10: 199, 25: 449, 50: 799, 100: 1399 },
    leadTiers: { 2000: 0, 10000: 29, 25000: 69, 50000: 129, 100000: 229, 250000: 449, 500000: 799 },
    storageTiers: { 5: 0, 20: 19, 50: 39, 100: 69, 250: 129, 500: 219 },
    integrationTiers: { 0: 0, 1: 39, 3: 99, 5: 149, 10: 249 }
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    symbol: '£',
    basePrice: 49,
    locale: 'en-GB',
    userTiers: { 1: 0, 5: 79, 10: 159, 25: 349, 50: 599, 100: 999 },
    leadTiers: { 2000: 0, 10000: 19, 25000: 49, 50000: 89, 100000: 159, 250000: 299, 500000: 499 },
    storageTiers: { 5: 0, 20: 15, 50: 35, 100: 59, 250: 109, 500: 189 },
    integrationTiers: { 0: 0, 1: 29, 3: 69, 5: 109, 10: 179 }
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    currency: 'AUD',
    symbol: 'A$',
    basePrice: 79,
    locale: 'en-AU',
    userTiers: { 1: 0, 5: 129, 10: 249, 25: 549, 50: 949, 100: 1649 },
    leadTiers: { 2000: 0, 10000: 29, 25000: 69, 50000: 129, 100000: 229, 250000: 449, 500000: 749 },
    storageTiers: { 5: 0, 20: 19, 50: 39, 100: 69, 250: 129, 500: 219 },
    integrationTiers: { 0: 0, 1: 39, 3: 99, 5: 149, 10: 249 }
  },
  IN: {
    code: 'IN',
    name: 'India',
    currency: 'INR',
    symbol: '₹',
    basePrice: 499,
    locale: 'en-IN',
    userTiers: { 1: 0, 5: 899, 10: 1799, 25: 3999, 50: 6999, 100: 11999 },
    leadTiers: { 2000: 0, 10000: 199, 25000: 499, 50000: 999, 100000: 1799, 250000: 3499, 500000: 5999 },
    storageTiers: { 5: 0, 20: 199, 50: 499, 100: 899, 250: 1799, 500: 2999 },
    integrationTiers: { 0: 0, 1: 399, 3: 999, 5: 1499, 10: 2499 }
  },
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    currency: 'AED',
    symbol: 'AED ',
    basePrice: 249,
    locale: 'en-AE',
    userTiers: { 1: 0, 5: 399, 10: 749, 25: 1599, 50: 2799, 100: 4999 },
    leadTiers: { 2000: 0, 10000: 79, 25000: 179, 50000: 349, 100000: 599, 250000: 1199, 500000: 1999 },
    storageTiers: { 5: 0, 20: 49, 50: 99, 100: 179, 250: 349, 500: 599 },
    integrationTiers: { 0: 0, 1: 99, 3: 249, 5: 399, 10: 699 }
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    symbol: '€',
    basePrice: 69,
    locale: 'de-DE',
    userTiers: { 1: 0, 5: 109, 10: 219, 25: 449, 50: 799, 100: 1399 },
    leadTiers: { 2000: 0, 10000: 25, 25000: 59, 50000: 109, 100000: 199, 250000: 399, 500000: 699 },
    storageTiers: { 5: 0, 20: 19, 50: 39, 100: 69, 250: 129, 500: 219 },
    integrationTiers: { 0: 0, 1: 39, 3: 99, 5: 149, 10: 249 }
  },
  FR: {
    code: 'FR',
    name: 'France',
    currency: 'EUR',
    symbol: '€',
    basePrice: 49,
    locale: 'fr-FR',
    userTiers: { 1: 0, 5: 79, 10: 149, 25: 329, 50: 579, 100: 999 },
    leadTiers: { 2000: 0, 10000: 19, 25000: 49, 50000: 89, 100000: 159, 250000: 299, 500000: 499 },
    storageTiers: { 5: 0, 20: 15, 50: 35, 100: 59, 250: 109, 500: 189 },
    integrationTiers: { 0: 0, 1: 29, 3: 69, 5: 109, 10: 179 }
  },
  ES: {
    code: 'ES',
    name: 'Spain',
    currency: 'EUR',
    symbol: '€',
    basePrice: 39,
    locale: 'es-ES',
    userTiers: { 1: 0, 5: 59, 10: 119, 25: 249, 50: 449, 100: 799 },
    leadTiers: { 2000: 0, 10000: 15, 25000: 35, 50000: 69, 100000: 119, 250000: 229, 500000: 399 },
    storageTiers: { 5: 0, 20: 12, 50: 29, 100: 49, 250: 89, 500: 159 },
    integrationTiers: { 0: 0, 1: 19, 3: 49, 5: 79, 10: 129 }
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    currency: 'CAD',
    symbol: 'C$',
    basePrice: 79,
    locale: 'en-CA',
    userTiers: { 1: 0, 5: 129, 10: 249, 25: 549, 50: 949, 100: 1649 },
    leadTiers: { 2000: 0, 10000: 29, 25000: 69, 50000: 129, 100000: 229, 250000: 449, 500000: 799 },
    storageTiers: { 5: 0, 20: 19, 50: 39, 100: 69, 250: 129, 500: 219 },
    integrationTiers: { 0: 0, 1: 39, 3: 99, 5: 149, 10: 249 }
  },
  MX: {
    code: 'MX',
    name: 'Mexico',
    currency: 'MXN',
    symbol: 'MX$',
    basePrice: 599,
    locale: 'es-MX',
    userTiers: { 1: 0, 5: 899, 10: 1699, 25: 3499, 50: 5999, 100: 10499 },
    leadTiers: { 2000: 0, 10000: 149, 25000: 349, 50000: 699, 100000: 1299, 250000: 2499, 500000: 4499 },
    storageTiers: { 5: 0, 20: 149, 50: 349, 100: 599, 250: 1099, 500: 1899 },
    integrationTiers: { 0: 0, 1: 299, 3: 699, 5: 999, 10: 1699 }
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    currency: 'BRL',
    symbol: 'R$',
    basePrice: 199,
    locale: 'pt-BR',
    userTiers: { 1: 0, 5: 299, 10: 599, 25: 1299, 50: 2199, 100: 3999 },
    leadTiers: { 2000: 0, 10000: 49, 25000: 119, 50000: 229, 100000: 399, 250000: 799, 500000: 1399 },
    storageTiers: { 5: 0, 20: 39, 50: 89, 100: 159, 250: 299, 500: 499 },
    integrationTiers: { 0: 0, 1: 79, 3: 199, 5: 299, 10: 499 }
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    currency: 'ZAR',
    symbol: 'R',
    basePrice: 699,
    locale: 'en-ZA',
    userTiers: { 1: 0, 5: 999, 10: 1999, 25: 4499, 50: 7999, 100: 13999 },
    leadTiers: { 2000: 0, 10000: 199, 25000: 499, 50000: 899, 100000: 1599, 250000: 3199, 500000: 5499 },
    storageTiers: { 5: 0, 20: 199, 50: 399, 100: 699, 250: 1299, 500: 2199 },
    integrationTiers: { 0: 0, 1: 399, 3: 899, 5: 1299, 10: 2199 }
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    currency: 'SAR',
    symbol: 'SAR ',
    basePrice: 249,
    locale: 'ar-SA',
    userTiers: { 1: 0, 5: 399, 10: 799, 25: 1799, 50: 3099, 100: 5499 },
    leadTiers: { 2000: 0, 10000: 79, 25000: 179, 50000: 349, 100000: 599, 250000: 1199, 500000: 1999 },
    storageTiers: { 5: 0, 20: 49, 50: 99, 100: 179, 250: 349, 500: 599 },
    integrationTiers: { 0: 0, 1: 99, 3: 249, 5: 399, 10: 699 }
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    currency: 'SGD',
    symbol: 'S$',
    basePrice: 79,
    locale: 'en-SG',
    userTiers: { 1: 0, 5: 129, 10: 249, 25: 549, 50: 949, 100: 1699 },
    leadTiers: { 2000: 0, 10000: 29, 25000: 69, 50000: 129, 100000: 229, 250000: 449, 500000: 799 },
    storageTiers: { 5: 0, 20: 19, 50: 39, 100: 69, 250: 129, 500: 219 },
    integrationTiers: { 0: 0, 1: 39, 3: 99, 5: 149, 10: 249 }
  },
  JP: {
    code: 'JP',
    name: 'Japan',
    currency: 'JPY',
    symbol: '¥',
    basePrice: 9800,
    locale: 'ja-JP',
    userTiers: { 1: 0, 5: 14800, 10: 29800, 25: 64800, 50: 114800, 100: 199800 },
    leadTiers: { 2000: 0, 10000: 2500, 25000: 5900, 50000: 10900, 100000: 19900, 250000: 39900, 500000: 69900 },
    storageTiers: { 5: 0, 20: 1900, 50: 3900, 100: 6900, 250: 12900, 500: 21900 },
    integrationTiers: { 0: 0, 1: 3900, 3: 9900, 5: 14900, 10: 24900 }
  }
};

export function isCountrySupported(code?: string | null): code is SupportedCountryCode {
  if (!code) return false;
  return SUPPORTED_COUNTRY_CODES.includes(code.toUpperCase() as SupportedCountryCode);
}

export function getCountryPricing(code?: string | null): CountryPricingConfig | null {
  if (!code) return null;
  const upper = code.toUpperCase() as SupportedCountryCode;
  return COUNTRY_PRICING[upper] || null;
}

// Map timezone string to country code for quick local dev or browser fallback
export const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Los_Angeles': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'Europe/London': 'GB',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Asia/Dubai': 'AE',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'Africa/Johannesburg': 'ZA',
  'Asia/Riyadh': 'SA',
  'Asia/Singapore': 'SG',
  'Asia/Tokyo': 'JP'
};
