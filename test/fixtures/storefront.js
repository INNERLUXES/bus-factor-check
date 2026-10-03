// The made-up history of the example storefront, oldest commit first. test/helpers.js builds a real git repository from it
// with fixed author and committer variables, and test/examples.test.js checks that git writes exactly the saved log in
// examples/storefront. Times are whole days after a fixed second written as a power of ten, so no file of the repository
// holds a date: the reports count days back from the newest commit.
//
// A change is { path, add, del }: del lines are taken from the top of the file and add new lines are put at its end, so
// git counts exactly add added and del deleted lines. { path, from } renames from first. { path, binary: true } writes a
// few bytes that hold a NUL, which git counts as binary.

export const BASE_SECONDS = 10 ** 9;

const LENA_OLD = ['L. Ortiz', 'lena.ortiz@old.example.com'];
const LENA = ['Lena Ortiz', 'lena@example.com'];
const RAVI = ['Ravi Shah', 'ravi@example.com'];
const MIA = ['Mia Chen', 'mia@example.com'];
const OMAR = ['Omar Haddad', 'omar@example.com'];
const TOMAS = ['Tomas Berg', 'tomas@example.com'];
const ANA = ['Ana Silva', 'ana@example.com'];
const BOT = ['build-bot', 'build-bot@example.com'];

export const STOREFRONT = [
  { day: 2, author: MIA, message: 'Add the money helpers and the readme', changes: [{ path: 'lib/money.js', add: 40, del: 0 }, { path: 'README.md', add: 12, del: 0 }] },
  { day: 12, author: LENA_OLD, message: 'Add invoices and tax', changes: [{ path: 'services/billing/invoice.js', add: 120, del: 0 }, { path: 'services/billing/tax.js', add: 60, del: 0 }] },
  { day: 15, author: TOMAS, message: 'Add the product list', changes: [{ path: 'services/catalog/products.js', add: 80, del: 0 }] },
  { day: 18, author: ANA, message: 'Add prices', changes: [{ path: 'services/catalog/prices.js', add: 50, del: 0 }, { path: 'services/catalog/products.js', add: 20, del: 5 }] },
  { day: 20, author: OMAR, message: 'Add the search index and queries', changes: [{ path: 'services/search/index-builder.js', add: 90, del: 0 }, { path: 'services/search/query.js', add: 70, del: 0 }] },
  { day: 25, author: RAVI, message: 'Add the cart', changes: [{ path: 'web/checkout/cart.js', add: 60, del: 0 }] },
  { day: 28, author: BOT, message: 'Add the deploy file', changes: [{ path: 'infra/deploy.yml', add: 30, del: 0 }] },
  { day: 30, author: LENA, message: 'Round invoice totals', changes: [{ path: 'services/billing/invoice.js', add: 40, del: 10 }, { path: 'lib/money.js', add: 10, del: 2 }] },
  { day: 35, author: MIA, message: 'Show prices and pay', changes: [{ path: 'services/catalog/prices.js', add: 30, del: 8 }, { path: 'web/checkout/payment.js', add: 45, del: 0 }] },
  { day: 40, author: TOMAS, message: 'Keep the cart in step with the products', changes: [{ path: 'web/checkout/cart.js', add: 25, del: 5 }, { path: 'services/catalog/products.js', add: 15, del: 4 }] },
  { day: 45, author: OMAR, message: 'Rank the query results', changes: [{ path: 'services/search/query.js', add: 35, del: 10 }] },
  { day: 50, author: RAVI, message: 'Fix the tax of a cart with no lines', changes: [{ path: 'services/billing/tax.js', add: 8, del: 2 }] },
  { day: 55, author: LENA, message: 'Move the money helpers into billing', changes: [{ path: 'services/billing/money.js', from: 'lib/money.js', add: 6, del: 1 }, { path: 'services/billing/tax.js', add: 30, del: 6 }] },
  { day: 60, author: ANA, message: 'Add the profile page and the guide', changes: [{ path: 'web/account/profile.js', add: 55, del: 0 }, { path: 'docs/guide.md', add: 40, del: 0 }] },
  { day: 65, author: MIA, message: 'Edit the profile', changes: [{ path: 'web/account/profile.js', add: 30, del: 6 }] },
  { day: 70, author: OMAR, message: 'Rename the index builder', changes: [{ path: 'services/search/indexer.js', from: 'services/search/index-builder.js', add: 12, del: 4 }] },
  { day: 75, author: TOMAS, message: 'Price rules for bundles', changes: [{ path: 'services/catalog/prices.js', add: 18, del: 3 }] },
  { day: 80, author: BOT, message: 'Bump the deploy image', changes: [{ path: 'infra/deploy.yml', add: 4, del: 2 }] },
  { day: 85, author: RAVI, message: 'Add the logo and a health check', changes: [{ path: 'infra/logo.png', binary: true }, { path: 'infra/deploy.yml', add: 6, del: 1 }] },
  { day: 90, author: LENA, message: 'Credit notes', changes: [{ path: 'services/billing/invoice.js', add: 50, del: 12 }] },
  { day: 95, author: ANA, message: 'Product badges and payment errors', changes: [{ path: 'services/catalog/products.js', add: 22, del: 6 }, { path: 'web/checkout/payment.js', add: 12, del: 3 }] },
  { day: 100, author: MIA, message: 'Readme and cart totals', changes: [{ path: 'README.md', add: 4, del: 1 }, { path: 'web/checkout/cart.js', add: 16, del: 2 }] },
  { day: 110, author: OMAR, message: 'Index the product badges', changes: [{ path: 'services/search/indexer.js', add: 28, del: 6 }, { path: 'services/search/query.js', add: 14, del: 3 }] },
  { day: 120, author: LENA, message: 'Money in minor units', changes: [{ path: 'services/billing/money.js', add: 12, del: 3 }] },
  { day: 125, author: RAVI, message: 'Retry a failed payment', changes: [{ path: 'web/checkout/payment.js', add: 20, del: 4 }, { path: 'docs/guide.md', add: 5, del: 1 }] },
  { day: 130, author: TOMAS, message: 'Price rounding and the readme', changes: [{ path: 'services/catalog/prices.js', add: 6, del: 2 }, { path: 'README.md', add: 2, del: 0 }] }
];
