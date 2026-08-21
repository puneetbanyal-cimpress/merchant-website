/**
 * Demo shoppers offered in the dropdown.
 *
 * Each entry becomes the chat context when selected. `shopperId` is the key
 * name the contact flow already expects; `shopperName` and `shopperEmail` ride
 * along with it. Every value must be a string — Amazon Connect rejects anything
 * else and the chat fails to start with no useful error.
 *
 * Add or edit entries here; nothing else needs to change.
 */
window.DEMO_SHOPPERS = [
  {
    shopperId: 'SHP-77341',
    shopperName: 'Priya Raman',
    shopperEmail: 'priya.raman@example.com'
  },
  {
    shopperId: 'SHP-40219',
    shopperName: 'Marcus Bell',
    shopperEmail: 'marcus.bell@example.com'
  },
  {
    shopperId: 'PRO-10298',
    shopperName: 'Nadia Okafor',
    shopperEmail: 'nadia.okafor@northgate-signage.example'
  },
  {
    shopperId: 'SHP-88102',
    shopperName: 'Daniel Cho',
    shopperEmail: 'daniel.cho@example.com'
  }
];
