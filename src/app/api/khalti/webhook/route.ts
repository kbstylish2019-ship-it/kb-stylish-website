export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const query = url.search || '';

    const target = `https://poxjcaogjupsplrcliau.supabase.co/functions/v1/khalti-webhook${query}`;
    const resp = await fetch(target, { method: 'GET' });
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (err) {
    return new Response('internal error', { status: 500 });
  }
}
