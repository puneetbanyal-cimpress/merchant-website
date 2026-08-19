/**
 * The three switchable shopper contexts.
 *
 * Everything under `attributes` is what gets handed to Amazon Connect.
 * Values MUST be strings — the widget/JWT path rejects non-string values
 * and the chat will silently fail to start.
 */
window.DEMO_CONTEXTS = [
  {
    id: 'guest',
    label: 'Guest',
    dotColor: '#9ca3af',
    hero: {
      eyebrow: 'Welcome',
      lede: 'Custom business cards, signs, and apparel — built for small business.'
    },
    cartCount: 0,
    attributes: {
      shopperId: 'GUEST-0000',
      shopperTier: 'none',
      authenticated: 'false',
      locale: 'en-US',
      storefront: 'vista-us',
      cartValue: '0.00',
      lifetimeOrders: '0',
      lastOrderId: '',
      pageContext: 'help-center'
    }
  },
  {
    id: 'returning',
    label: 'Returning',
    dotColor: '#f59e0b',
    hero: {
      eyebrow: 'Welcome back, Priya',
      lede: 'Your last order shipped Tuesday. Reorder in two clicks.'
    },
    cartCount: 2,
    attributes: {
      shopperId: 'SHP-77341',
      shopperName: 'Priya Raman',
      shopperTier: 'gold',
      authenticated: 'true',
      locale: 'en-US',
      storefront: 'vista-us',
      cartValue: '84.50',
      lifetimeOrders: '3',
      lastOrderId: 'ORD-2026-004512',
      lastOrderStatus: 'shipped',
      pageContext: 'help-center'
    }
  },
  {
    id: 'pro',
    label: 'Pro / Business',
    dotColor: '#0ea5e9',
    hero: {
      eyebrow: 'Vista Pro account',
      lede: 'Volume pricing, shared brand kits, and a dedicated account team.'
    },
    cartCount: 7,
    attributes: {
      shopperId: 'PRO-10298',
      shopperName: 'Northgate Signage Ltd',
      shopperTier: 'pro',
      authenticated: 'true',
      locale: 'en-GB',
      storefront: 'vista-uk',
      cartValue: '1240.00',
      lifetimeOrders: '12',
      lastOrderId: 'ORD-2026-004988',
      lastOrderStatus: 'in_production',
      accountManager: 'j.okafor',
      pageContext: 'help-center'
    }
  }
];
