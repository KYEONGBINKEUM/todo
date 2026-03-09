import { NextRequest, NextResponse } from 'next/server';
import { polar, POLAR_PRODUCTS } from '@/lib/polar';

export async function POST(req: NextRequest) {
  try {
    const { plan, uid, email } = await req.json() as {
      plan: 'pro' | 'team';
      uid?: string;
      email?: string;
    };

    const productId = POLAR_PRODUCTS[plan];
    if (!productId) {
      return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
    }

    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';
    const successUrl = `${origin}/payment/success?plan=${plan}`;

    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      customerEmail: email,
      metadata: uid ? { uid } : undefined,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error('[polar/checkout]', err);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
