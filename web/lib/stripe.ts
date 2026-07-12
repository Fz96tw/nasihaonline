import "server-only";
import Stripe from "stripe";

// Lazily constructed (not instantiated at module load) so a missing
// STRIPE_SECRET_KEY doesn't crash Next's build-time route analysis — it
// only throws once a donation route actually runs without the key set.
let client: Stripe | undefined;

function getClient(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(apiKey);
  }
  return client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});
