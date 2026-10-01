import assert from 'node:assert/strict';
import test from 'node:test';
import { feeStatementWhatsAppMessage } from './fee-statement-whatsapp.ts';

const statement = {
  studentName: 'Hung',
  month: 'September 2026',
  amount: '13,875,000 VND',
  url: 'https://example.test/statement/private-link',
};

test('published statement preserves original details and asks for payment proof with student reference', () => {
  assert.equal(
    feeStatementWhatsAppMessage({ ...statement, status: 'published' }),
    "Hi, here is Hung's fee statement for September 2026. The total due is 13,875,000 VND: https://example.test/statement/private-link Please include Hung's name in the payment reference and send a screenshot once paid.",
  );
});

test('paid statement keeps its marked-paid message without asking for a second payment', () => {
  assert.equal(
    feeStatementWhatsAppMessage({ ...statement, status: 'paid' }),
    "Hi, here is Hung's fee statement for September 2026. The total is 13,875,000 VND, and it has been marked paid: https://example.test/statement/private-link",
  );
});
