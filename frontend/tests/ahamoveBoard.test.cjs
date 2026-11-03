const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const source = fs.readFileSync(path.join(__dirname, '../src/pages/AhamoveHandedOverPage.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const output = { exports: {} };
function mockRequire(name) {
  if (name.endsWith('.css')) return {};
  if (name === '../api/client') return { api: {} };
  if (name === '../utils/format') return { money: value => `${value} VND`, numberText: value => String(value), utcDateTime: value => value };
  if (name === '../components/DateRangePicker' || name === '../components/ToastNotification') return {};
  if (name === '../components/EmptyState') return { EmptyState: props => React.createElement('div', null, props.title) };
  return require(name);
}
vm.runInNewContext('(function(require,module,exports){' + compiled + '\n})')(mockRequire, output, output.exports);
const invoice = { id: 10, code: 'HD-BOARD-010', customer: { name: 'Khách kiểm thử', phone: '0900000000', address: '123 Đường rất dài, phường Bình An, thành phố Hồ Chí Minh' }, total_amount: '123000', is_paid_by_transfer: false, status: 'created', deleted_at: null };
const batch = { id: 1, code: 'BG-BOARD-001', handed_over_at: '2026-11-02', shipping_fee: '10000', advance_amount: '113000', created_by_name: 'Seller', items: [{ id: 1, is_active: true, invoice }] };
function render(data = batch, canViewInvoice = false) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(output.exports.AhamoveBatchColumn, { batch: data, onComplete: async () => {}, onMissingNote: () => {} })));
}
test('batch lists addresses as bullets and includes order count in its title', () => {
  const html = render();
  assert(html.includes(batch.code));
  assert(html.includes(invoice.customer.address));
  assert(html.includes('(1 Đơn)'));
  assert(html.includes('<ul>') && html.includes('<li>'));
  assert(!html.includes('<article'));
  assert(!html.includes('ahamove-batch-order"'));
});

test('removed and soft-deleted orders are excluded from addresses and count', () => {
  const html = render({ ...batch, items: [...batch.items, { id: 2, is_active: false, invoice: { ...invoice, customer: { address: 'REMOVED ADDRESS' } } }, { id: 3, is_active: true, invoice: { ...invoice, customer: { address: 'DELETED ADDRESS' }, deleted_at: '2026-11-02' } }] });
  assert(!html.includes('REMOVED ADDRESS'));
  assert(!html.includes('DELETED ADDRESS'));
  assert(html.includes('(1 Đơn)'));
});

test('batch badge shows created/completed independently from financial reconciliation', () => {
  assert(render({ ...batch, handover_status: 'created', is_reconciled: true }).includes('Tạo mới'));
  const completed = render({ ...batch, handover_status: 'completed', is_reconciled: false });
  assert(completed.includes('Hoàn thành'));
  assert(!completed.includes('Tạo mới'));
});

test('each order retains a bullet even for repeated or missing addresses', () => {
  const html = render({ ...batch, items: [...batch.items, { id: 2, is_active: true, invoice }, { id: 3, is_active: true, invoice: { ...invoice, customer: null } }] });
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert(html.includes('Chưa có địa chỉ'));
  assert(html.includes('(3 Đơn)'));
});

test('header no longer opens a modal and inline inputs have requested placeholders', () => {
  const html = render({ ...batch, note: 'Ghi chú cũ' });
  assert(html.includes('placeholder="Chuyển khoản"'));
  assert(html.includes('placeholder="Tiền mặt"'));
  assert(!html.includes('aria-haspopup="dialog"'));
  assert(!html.includes('role="dialog"'));
  assert(!html.includes('role="button"'));
  assert(html.includes('Ghi chú cũ'));
});

function renderCompletion(changes = {}) {
  return renderToStaticMarkup(React.createElement(output.exports.AhamoveBatchCompletionForm, { transferNote: '', cashNote: '', completed: false, disabled: false, saving: false, error: '', onTransferChange: () => {}, onCashChange: () => {}, onSubmit: () => {}, onMissingNote: () => {}, ...changes }));
}
function buttonDisabled(html) { return /<button[^>]*disabled/.test(html); }
test('empty-note completion remains clickable so validation can show a toast', () => {
  assert(!buttonDisabled(renderCompletion()));
  assert(!buttonDisabled(renderCompletion({ transferNote: '  ', cashNote: '\t' })));
  assert(!buttonDisabled(renderCompletion({ transferNote: 'VPB' })));
  assert(!buttonDisabled(renderCompletion({ cashNote: 'Nhận tại quầy' })));
  assert(!buttonDisabled(renderCompletion({ transferNote: 'VPB', cashNote: 'Nhận tại quầy' })));
});
test('completed or busy batches cannot submit again and saved notes remain visible', () => {
  assert(buttonDisabled(renderCompletion({ transferNote: 'VPB', completed: true })));
  assert(buttonDisabled(renderCompletion({ transferNote: 'VPB', disabled: true })));
  const html = render({ ...batch, handover_status: 'completed', transfer_note: 'VPB đã nhận', cash_note: 'Nhận tại quầy' });
  assert(html.includes('value="VPB đã nhận"'));
  assert(html.includes('value="Nhận tại quầy"'));
  assert(html.includes('readOnly=""'));
});
test('reconciliation note text retains legacy, transfer and cash notes distinctly', () => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/handover.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext('(function(exports){' + code + '\n})')(module.exports);
  assert.equal(module.exports.handoverNoteText({ note: 'Ghi chú cũ', transfer_note: 'VPB', cash_note: 'Tại quầy' }), 'Ghi chú cũ\nChuyển khoản: VPB\nTiền mặt: Tại quầy');
  assert.equal(module.exports.handoverNoteText({}), '');
});

test('blank completion requests toast and does not submit; valid notes submit normally', () => {
  let warnings = 0;
  let submissions = 0;
  const props = { transferNote: '', cashNote: '', completed: false, disabled: false, saving: false, error: '', onTransferChange: () => {}, onCashChange: () => {}, onMissingNote: () => warnings++, onSubmit: () => submissions++ };
  for (const notes of [{}, { transferNote: '  ', cashNote: '\t' }]) {
    const form = output.exports.AhamoveBatchCompletionForm({ ...props, ...notes });
    form.props.onSubmit({ preventDefault: () => {} });
  }
  assert.equal(warnings, 2);
  assert.equal(submissions, 0);
  output.exports.AhamoveBatchCompletionForm({ ...props, cashNote: 'Tại quầy' }).props.onSubmit({ preventDefault: () => {} });
  assert.equal(submissions, 1);
  assert.equal(warnings, 2);
});

test('new batches prefill transfer note from advance while saved/completed notes remain intact', () => {
  assert(render().includes('value="113000"'));
  assert(render({ ...batch, transfer_note: 'Ghi chú đã lưu' }).includes('value="Ghi chú đã lưu"'));
  const completed = render({ ...batch, handover_status: 'completed', transfer_note: null, cash_note: 'Tiền mặt đã lưu' });
  assert(!completed.includes('value="113000"'));
  assert(completed.includes('value="Tiền mặt đã lưu"'));
});
test('focusing either payment-note field selects all its text', () => {
  let selections = 0;
  const element = output.exports.AhamoveBatchCompletionForm({ transferNote: '113000', cashNote: 'Tiền mặt', completed: false, disabled: false, saving: false, error: '', onTransferChange: () => {}, onCashChange: () => {}, onSubmit: () => {}, onMissingNote: () => {} });
  const fields = element.props.children[0].props.children;
  for (const field of fields) field.props.onFocus({ currentTarget: { select: () => selections++ } });
  assert.equal(selections, 2);
});


test('cancel action sits after the address list and locks reconciled or busy batches', () => {
  function cancelButton(data, disabled = false) {
    const html = renderToStaticMarkup(React.createElement(output.exports.AhamoveBatchColumn, {
      batch: { ...batch, status: 'active', ...data }, disabled,
      onCancel: async () => {}, onComplete: async () => {}, onMissingNote: () => {},
    }));
    assert(html.indexOf('ahamove-batch-footer') > html.indexOf('ahamove-batch-addresses'));
    return html.match(/<footer[^>]*>(.*?)<\/footer>/s)[1];
  }
  assert(!buttonDisabled(cancelButton({ handover_status: 'created' })));
  assert(!buttonDisabled(cancelButton({ handover_status: 'completed' })));
  assert(buttonDisabled(cancelButton({ is_reconciled: true })));
  assert(buttonDisabled(cancelButton({}, true)));
  assert(buttonDisabled(cancelButton({ status: 'cancelled' })));
});
