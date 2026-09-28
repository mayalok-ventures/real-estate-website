import type { APIRoute } from 'astro';
import { insertContact, checkRateLimit } from '../../lib/db';
import { getRuntimeEnv } from '../../lib/env';
import type { ContactSubmission } from '../../types/db';

export const prerender = false;

// Simple SHA-256 hash helper using Web Crypto API available in Cloudflare Workers and Node
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: any = {};

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: 'Unsupported content type. Please send JSON or Form Data.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. Honeypot check for spam bots
    if (body.website_url && body.website_url.trim().length > 0) {
      // Bot detected - simulate success without saving to avoid leaking spam detection
      return new Response(JSON.stringify({
        success: true,
        message: 'Thank you for your message. Our team will get back to you shortly.'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Client IP & Rate Limiting
    const clientIp = request.headers.get('cf-connecting-ip') ||
                     request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     '127.0.0.1';
    const ipHash = await hashString(clientIp);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Access Cloudflare D1 via getRuntimeEnv()
    const env = await getRuntimeEnv();
    const db = env.DB;

    const rateLimit = await checkRateLimit(db, `contact_${ipHash}`, 5, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Too many requests. Please wait a few minutes before submitting again.'
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Server-side Validation
    const errors: Record<string, string> = {};

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length < 2) {
      errors.name = 'Please enter your full name (minimum 2 characters).';
    } else if (name.length > 100) {
      errors.name = 'Name must be under 100 characters.';
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.email = 'Please provide a valid work email address.';
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const phoneClean = phone.replace(/[\s\-\(\)\.]/g, '');
    if (!phone || phoneClean.length < 8 || phoneClean.length > 18) {
      errors.phone = 'Please provide a valid contact phone number.';
    }

    const validInquiryTypes = ['demo', 'pricing', 'support', 'partnership', 'general'];
    const rawType = typeof body.inquiry_type === 'string' ? body.inquiry_type.toLowerCase() : 'demo';
    const inquiry_type = validInquiryTypes.includes(rawType) ? (rawType as ContactSubmission['inquiry_type']) : 'demo';

    const company = typeof body.company === 'string' ? body.company.trim().slice(0, 150) : null;
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : null;

    if (Object.keys(errors).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        errors,
        message: 'Please resolve the highlighted errors and try again.'
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Sanitize and Save to D1
    const contactData: ContactSubmission = {
      name,
      email,
      phone,
      company: company || null,
      inquiry_type,
      message: message || null,
      ip_hash: ipHash,
      user_agent: userAgent.slice(0, 255),
      status: 'new'
    };

    const contactId = await insertContact(db, contactData);

    // 5. Forward to External CRM Webhook if configured in Cloudflare
    if (env.CRM_WEBHOOK_URL) {
      try {
        const webhookHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Sahyak-CRM-Cloudflare-Worker/1.0'
        };
        if (env.CRM_API_KEY) {
          webhookHeaders['Authorization'] = `Bearer ${env.CRM_API_KEY}`;
          webhookHeaders['x-api-key'] = env.CRM_API_KEY;
        }

        fetch(env.CRM_WEBHOOK_URL, {
          method: 'POST',
          headers: webhookHeaders,
          body: JSON.stringify({
            event: 'lead.created',
            contactId,
            lead: contactData,
            timestamp: new Date().toISOString()
          })
        }).catch((e) => console.error('CRM Webhook dispatch failed:', e));
      } catch (webhookErr) {
        console.error('CRM Webhook error:', webhookErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      contactId,
      message: 'Thank you for reaching out! A Sahyak CRM real estate specialist will contact you within 1 business day.'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Contact API Error:', err);
    return new Response(JSON.stringify({
      success: false,
      message: 'An unexpected error occurred while processing your request. Please try again later.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
