import { NextRequest, NextResponse } from 'next/server';
import { updateUserSettings } from '@/lib/firestore';
import type { Plan } from '@/lib/firestore';

// Verify Polar webhook signature
async function verifySignature(req: NextRequest, body: string): Promise<boolean> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return true; // dev mode — skip verification

  const signature = req.headers.get('webhook-signature') ?? req.headers.get('x-polar-signature');
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const sigBytes = Buffer.from(signature.replace('sha256=', ''), 'hex');
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  const valid = await verifySignature(req, body);
  if (!valid) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { type, data } = event;

  // Determine plan from product/price info
  const getPlan = (_d: Record<string, unknown>): Plan => 'pro';

  const getUid = (d: Record<string, unknown>): string | null => {
    const meta = d.metadata as Record<string, string> | undefined;
    return meta?.uid ?? null;
  };

  try {
    if (type === 'order.created' || type === 'subscription.created' || type === 'subscription.active') {
      const uid = getUid(data);
      if (uid) {
        const plan = getPlan(data);
        await updateUserSettings(uid, { plan });
        console.log(`[polar/webhook] Updated plan: uid=${uid} plan=${plan}`);
      }
    }

    if (type === 'subscription.canceled' || type === 'subscription.revoked') {
      const uid = getUid(data);
      if (uid) {
        await updateUserSettings(uid, { plan: 'free' });
        console.log(`[polar/webhook] Reverted to free: uid=${uid}`);
      }
    }
  } catch (err) {
    console.error('[polar/webhook] Error updating plan:', err);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
