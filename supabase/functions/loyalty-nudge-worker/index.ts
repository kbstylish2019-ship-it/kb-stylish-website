import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
/**
 * Loyalty Nudge Worker v1.0 — daily behavioral emails (booking-reminder-worker pattern).
 * Cron-invoked with the service-role key. verify_jwt = true (platform default).
 *
 * Nudges (candidates selected + deduped in DB, gated on can_send_optional_email 'promotional'):
 *  - near_reward:      "You're 1 stamp away from a free booking"
 *  - voucher_reminder: "Your free booking voucher is waiting"
 *  - win_back:         "We miss you — your stamps are waiting" (8+ weeks inactive)
 *
 * Self-contained rendering + Resend send: deliberately does NOT touch the shared
 * send-email function/templates (deployed shared infra stays untouched).
 * Body {dry_run: true} returns candidates without sending or recording.
 */

const BRAND = '#1976D2';

function renderNudge(c: Record<string, unknown>): { subject: string; html: string } {
  const name = (c.name as string) || 'there';
  const wrap = (title: string, body: string, cta: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <div style="background:${BRAND};color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
      <h1 style="margin:0;font-size:20px">KB Stylish Rewards</h1>
    </div>
    <div style="border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#171717">${title}</h2>
      <p style="color:#525252;font-size:14px;line-height:1.6">${body}</p>
      <a href="https://www.kbstylish.com.np/book-a-stylist"
         style="display:inline-block;margin-top:16px;background:${BRAND};color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;font-size:14px">${cta}</a>
      <p style="color:#a3a3a3;font-size:11px;margin-top:24px">You can turn off these emails in your KB Stylish profile settings.</p>
    </div>
  </div>`;

  switch (c.nudge_type) {
    case 'near_reward':
      return {
        subject: `${name}, you're 1 stamp away from a FREE booking! 🎉`,
        html: wrap(
          `Just 1 more visit, ${name}!`,
          `Your stamp card is at <b>${c.current_stamps}/${c.stamps_required}</b>. Complete one more appointment and your next booking is <b>completely free</b>.`,
          'Book your appointment'
        ),
      };
    case 'voucher_reminder':
      return {
        subject: `${name}, your FREE booking voucher is waiting 💈`,
        html: wrap(
          `Your free booking is ready, ${name}!`,
          `You earned a <b>free booking voucher</b> — it's sitting in your Rewards, ready to use. Pick a stylist, choose a time, and flip on "Use your free booking".`,
          'Use my free booking'
        ),
      };
    case 'win_back':
      return {
        subject: `We miss you at KB Stylish, ${name}!`,
        html: wrap(
          `It's been a while, ${name}`,
          `Your stamp card still has <b>${c.current_stamps}/${c.stamps_required}</b> stamps — every visit brings you closer to a free booking. Come see us again!`,
          'Book a visit'
        ),
      };
    default:
      throw new Error(`Unknown nudge_type: ${c.nudge_type}`);
  }
}

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    const { data: candidates, error } = await supabase.rpc('get_loyalty_nudge_candidates_v1');
    if (error) throw error;

    const list = (candidates ?? []) as Array<Record<string, unknown>>;
    console.log(`[LoyaltyNudge] ${list.length} candidates (dry_run=${dryRun})`);

    if (dryRun) {
      return new Response(JSON.stringify({ dry_run: true, candidates: list }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    let sent = 0;
    let failed = 0;

    for (const c of list) {
      try {
        const { subject, html } = renderNudge(c);

        if (resendKey) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'KB Stylish <noreply@kbstylish.com.np>',
              to: [c.email],
              subject,
              html,
            }),
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
        } else {
          console.log(`[LoyaltyNudge] DEV MODE (no RESEND_API_KEY) — would send "${subject}" to ${c.email}`);
        }

        const { error: recErr } = await supabase.rpc('record_loyalty_nudge_v1', {
          p_user_id: c.user_id,
          p_nudge_type: c.nudge_type,
        });
        if (recErr) throw recErr;

        sent++;
      } catch (err) {
        console.error(`[LoyaltyNudge] Failed for ${c.user_id} (${c.nudge_type}):`, err);
        failed++;
      }
    }

    console.log(`[LoyaltyNudge] Complete: ${sent} sent, ${failed} failed`);
    return new Response(JSON.stringify({ sent, failed, total: list.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[LoyaltyNudge] Fatal error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
