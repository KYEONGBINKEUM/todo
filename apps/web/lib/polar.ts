import { Polar } from '@polar-sh/sdk';

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? '',
});

export const POLAR_PRODUCT_PRO = process.env.NEXT_PUBLIC_POLAR_PREMIUM_PRODUCT_ID ?? '';
