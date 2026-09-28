import type { APIRoute } from 'astro';
import { trackEvent } from '../../../lib/analytics';
import { getRuntimeEnv } from '../../../lib/env';
import type { TrackPayload } from '../../../types/analytics';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    let payload: TrackPayload;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      payload = (await request.json()) as TrackPayload;
    } else {
      // Handles sendBeacon text or form-data
      const text = await request.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {
          event: 'heartbeat',
          session_id: 'unknown',
          visitor_id: 'unknown',
          page: '/'
        };
      }
    }

    const env = await getRuntimeEnv();
    const result = await trackEvent(env.DB, payload, request.headers);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
