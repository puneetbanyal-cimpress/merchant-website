/**
 * Demo shoppers offered in the dropdown.
 *
 * Each entry becomes the chat context when applied. `shopperId` is the key name
 * the contact flow already expects; `firstName` and `lastName` ride along with
 * it and also prefill the callback form.
 *
 * `email` is optional. Add it here to give a built-in shopper one; shoppers
 * added at runtime through the hidden ?addShopper panel can carry one too. When
 * present it goes to Connect as a contact attribute and to the callback API as
 * the `email` field; when absent, the attribute is omitted and the API gets ''.
 *
 * Every value must be a string — Amazon Connect rejects anything else and the
 * chat fails to start with no useful error.
 *
 * Add or edit entries here; nothing else needs to change.
 */
window.DEMO_SHOPPERS = [
  {
    firstName: 'Paul',
    lastName: 'Harraghy',
    shopperId: 'd2FyaG9s-237A146D7D6859E2CE8BEFDCAB4D38F9'
  },
  {
    firstName: 'Markus',
    lastName: 'Thurner',
    shopperId: 'XLIQE5RWXVJ0UGN335ULKFEP1E6E0U0D'
  },
  {
    firstName: 'Vinay',
    lastName: 'Sawant',
    shopperId: 'IMDD2MFQRWQL3SUSGM4K2VR3ZIJ0ZNLE'
  },
  {
    firstName: 'Rinku',
    lastName: 'Singhal',
    shopperId: 'd2FyaG9s-F8FBEF91F7A8CBD110F28F8B134F89EA'
  },

  // The two "- (NP)" accounts sit last: they are non-production test shoppers,
  // so they belong below the ones a demo actually opens with.
  {
    firstName: 'Puneet',
    lastName: 'Banyal - (NP)',
    shopperId: 'nVke2QV2-01KYVXXPBJ47EWXRAKBXPKWWF2'
  },
  {
    firstName: 'Vishal',
    lastName: 'Bhoriwal - (NP)',
    shopperId: 'nVke2QV2-01KXNFDK4SP5DYPF2CS3CH43BG'
  }
];

/** Contact reasons offered in step 1 of the callback form. */
window.CONTACT_REASONS = [
  { value: 'order-status',  label: 'Order status or delivery' },
  { value: 'reprint',       label: 'Reprint or replacement' },
  { value: 'refund',        label: 'Refund or cancellation' },
  { value: 'design-help',   label: 'Design or artwork help' },
  { value: 'billing',       label: 'Billing or payment' },
  { value: 'account',       label: 'Account or sign-in' },
  { value: 'other',         label: 'Something else' }
];

/** Country regions offered in step 1, with their dialling codes. */
window.COUNTRY_REGIONS = [
  { value: 'US', label: 'United States of America', dial: '+1' },
  { value: 'CA', label: 'Canada',                   dial: '+1' },
  { value: 'GB', label: 'United Kingdom',           dial: '+44' },
  { value: 'IE', label: 'Ireland',                  dial: '+353' },
  { value: 'AU', label: 'Australia',                dial: '+61' },
  { value: 'NZ', label: 'New Zealand',              dial: '+64' },
  { value: 'IN', label: 'India',                    dial: '+91' },
  { value: 'SG', label: 'Singapore',                dial: '+65' },
  { value: 'DE', label: 'Germany',                  dial: '+49' },
  { value: 'AT', label: 'Austria',                  dial: '+43' },
  { value: 'CH', label: 'Switzerland',              dial: '+41' },
  { value: 'NL', label: 'Netherlands',              dial: '+31' },
  { value: 'FR', label: 'France',                   dial: '+33' },
  { value: 'ES', label: 'Spain',                    dial: '+34' },
  { value: 'IT', label: 'Italy',                    dial: '+39' },
  { value: 'SE', label: 'Sweden',                   dial: '+46' }
];

/** Support hours, shown in the phone card and in the callback form's rail. */
window.WORKING_HOURS = [
  { day: 'Sun',     hours: '8:00 AM - 8:00 PM EST' },
  { day: 'Mon',     hours: '7:00 AM - 12:00 AM EST' },
  { day: 'Tue - Fri', hours: '12:00 AM - 12:00 AM EST (24 hours)' },
  { day: 'Sat',     hours: '12:00 AM – 8:00 PM EST' }
];
