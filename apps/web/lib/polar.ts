import { Polar } from '@polar-sh/sdk';

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? '',
});

export const POLAR_PRODUCTS = {
  pro: process.env.POLAR_PRODUCT_PRO ?? '',
  team: process.env.POLAR_PRODUCT_TEAM ?? '',
} as const;
