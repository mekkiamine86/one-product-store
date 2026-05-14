import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCustomerName,
  extractLineItemsSummary,
  extractOrderFields,
  extractOrderRef,
  extractRawPhone,
  extractStoreId,
  extractTotal,
  type YoucanOrderPayload,
} from '../app/api/webhooks/youcan/order-create/extract';

// Minimal payload skeleton used as a base for variant tests.
const base = (extra: Partial<YoucanOrderPayload> = {}): YoucanOrderPayload => ({
  id: 99001,
  currency: 'MAD',
  ...extra,
});

// ---- customer name --------------------------------------------------------

test('extractCustomerName prefers full_name', () => {
  assert.equal(
    extractCustomerName(base({ customer: { full_name: 'Alice Bouhlel' } })),
    'Alice Bouhlel',
  );
});

test('extractCustomerName falls back to first + last', () => {
  assert.equal(
    extractCustomerName(base({ customer: { first_name: 'Alice', last_name: 'Bouhlel' } })),
    'Alice Bouhlel',
  );
});

test('extractCustomerName tolerates only one of first/last', () => {
  assert.equal(
    extractCustomerName(base({ customer: { first_name: 'Alice' } })),
    'Alice',
  );
});

test('extractCustomerName trims and skips empty full_name', () => {
  assert.equal(
    extractCustomerName(
      base({ customer: { full_name: '   ', first_name: 'Bob' } }),
    ),
    'Bob',
  );
});

test('extractCustomerName falls back to "Customer" when nothing usable', () => {
  assert.equal(extractCustomerName(base()), 'Customer');
  assert.equal(extractCustomerName(base({ customer: null })), 'Customer');
  assert.equal(
    extractCustomerName(base({ customer: { first_name: '', last_name: '' } })),
    'Customer',
  );
});

// ---- phone source ---------------------------------------------------------

test('extractRawPhone prefers customer.phone', () => {
  assert.equal(
    extractRawPhone(
      base({
        customer: { phone: '+212600111222' },
        shipping: { phone: '+212600999999' },
        shipping_phone: '+212600888888',
      }),
    ),
    '+212600111222',
  );
});

test('extractRawPhone falls through to shipping.phone then shipping_phone', () => {
  assert.equal(
    extractRawPhone(
      base({ shipping: { phone: '+212600111222' } }),
    ),
    '+212600111222',
  );
  assert.equal(
    extractRawPhone(base({ shipping_phone: '+212600111222' })),
    '+212600111222',
  );
});

test('extractRawPhone returns null when no phone is present', () => {
  assert.equal(extractRawPhone(base()), null);
});

// ---- order ref ------------------------------------------------------------

test('extractOrderRef prefers ref', () => {
  assert.equal(extractOrderRef(base({ ref: 'YC-2026-1024' })), 'YC-2026-1024');
});

test('extractOrderRef falls back to #order_number then id', () => {
  assert.equal(extractOrderRef(base({ order_number: 1024 })), '#1024');
  assert.equal(extractOrderRef(base({ id: 99001 })), '99001');
});

// ---- total ----------------------------------------------------------------

test('extractTotal accepts numeric or string total, falls back to "0"', () => {
  assert.equal(extractTotal(base({ total: 149.99 })), '149.99');
  assert.equal(extractTotal(base({ total: '149.99' })), '149.99');
  assert.equal(extractTotal(base({ total_price: 200 })), '200');
  assert.equal(extractTotal(base()), '0');
});

// ---- line items -----------------------------------------------------------

test('extractLineItemsSummary formats variants with nested and flat product names', () => {
  assert.equal(
    extractLineItemsSummary(
      base({
        variants: [
          { quantity: 2, product: { name: 'T-Shirt' } },
          { quantity: 1, product_name: 'Cap' },
          { quantity: 3 }, // unknown product
        ],
      }),
    ),
    '2x T-Shirt, 1x Cap, 3x item',
  );
});

test('extractLineItemsSummary returns null when no variants', () => {
  assert.equal(extractLineItemsSummary(base()), null);
  assert.equal(extractLineItemsSummary(base({ variants: [] })), null);
});

test('extractLineItemsSummary caps the summary at 500 chars', () => {
  const many = Array.from({ length: 100 }, () => ({
    quantity: 1,
    product: { name: 'WidgetWithAReallyLongName' },
  }));
  const out = extractLineItemsSummary(base({ variants: many }));
  assert.ok(out!.length <= 500);
});

// ---- store id -------------------------------------------------------------

test('extractStoreId reads store_id (numeric or string)', () => {
  assert.equal(extractStoreId(base({ store_id: 42 })), '42');
  assert.equal(extractStoreId(base({ store_id: 'store-42' })), 'store-42');
});

test('extractStoreId falls back to nested store.id', () => {
  assert.equal(extractStoreId(base({ store: { id: 42 } })), '42');
});

test('extractStoreId prefers flat store_id over nested store.id', () => {
  assert.equal(
    extractStoreId(base({ store_id: 'flat', store: { id: 'nested' } })),
    'flat',
  );
});

test('extractStoreId returns null when neither field is present', () => {
  assert.equal(extractStoreId(base()), null);
  assert.equal(extractStoreId(base({ store: { slug: 'x' } })), null);
});

// ---- full extraction roundtrip -------------------------------------------

test('extractOrderFields normalises phone using the merchant default country', () => {
  // Local Moroccan number "0612345678" should become "+212612345678" when
  // the merchant default is MA.
  const fields = extractOrderFields(
    base({ customer: { phone: '0612345678', full_name: 'Test' } }),
    'MA',
  );
  assert.equal(fields.customerPhone, '+212612345678');
});

test('extractOrderFields composes every field for a complete payload', () => {
  const fields = extractOrderFields(
    {
      id: 99001,
      ref: '#1024',
      currency: 'MAD',
      total: '149.99',
      customer: {
        full_name: 'Alice Bouhlel',
        phone: '+212612345678',
        email: 'alice@example.com',
      },
      variants: [{ quantity: 2, product: { name: 'T-Shirt' } }],
      store_id: 'store-42',
    },
    'MA',
  );
  assert.deepEqual(fields, {
    customerName: 'Alice Bouhlel',
    customerPhone: '+212612345678',
    orderRef: '#1024',
    total: '149.99',
    lineItemsSummary: '2x T-Shirt',
    storeId: 'store-42',
  });
});

test('extractOrderFields tolerates a near-empty payload', () => {
  const fields = extractOrderFields({ id: 1, currency: 'MAD' }, 'MA');
  assert.deepEqual(fields, {
    customerName: 'Customer',
    customerPhone: null,
    orderRef: '1',
    total: '0',
    lineItemsSummary: null,
    storeId: null,
  });
});
