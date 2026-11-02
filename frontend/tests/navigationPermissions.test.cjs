const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
let granted = [];
const source = fs.readFileSync(path.join(__dirname, '../src/components/Layout.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleExports = { exports: {} };
function mockRequire(name) {
  if (name === '../auth/AuthContext') return { useAuth: () => ({ currentUser: { display_name: 'Seller' }, hasPermission: code => granted.includes(code), logout: async () => {} }) };
  if (name === '../hooks/usePageTitle') return { usePageTitle: () => {} };
  if (name.endsWith('.webp')) return 'logo.webp';
  return require(name);
}
vm.runInNewContext('(function(require,module,exports){' + compiled + '\n})', { window: { localStorage: { getItem: () => null } } })(mockRequire, moduleExports, moduleExports.exports);
function render(permissions, route = '/') {
  granted = permissions;
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(moduleExports.exports.Layout, null, 'Content')));
}
test('shipping management does not expose COD navigation', () => {
  const html = render(['shipping.manage']);
  assert(!html.includes('AHAMOVE'));
  assert(html.includes('Quản lý đơn ship'));
  assert(!html.includes('Quản lý tiền COD'));
  assert(!html.includes('Thu tiền Ship Nội Bộ'));
  assert(!html.includes('Lịch sử thu tiền COD'));
});
test('dedicated COD permission exposes COD navigation without shipping', () => {
  const html = render(['internal_cod_collections.manage']);
  assert(html.includes('Quản lý tiền COD'));
  assert(!html.includes('AHAMOVE'));
  assert(!html.includes('Quản lý đơn ship'));
});
test('reconciliation permission still exposes its COD group', () => {
  assert(render(['order_reconciliation.manage']).includes('Quản lý tiền COD'));
  assert(!render([]).includes('Quản lý tiền COD'));
});

test('AHAMOVE permission exposes only AHAMOVE without shipping or COD menus', () => {
  const html = render(['ahamove.manage']);
  assert(html.includes('AHAMOVE'));
  assert(!html.includes('Quản lý đơn ship'));
  assert(!html.includes('Quản lý tiền COD'));
});

test('AHAMOVE submenu opens on direct navigation and highlights only handed-over page', () => {
  const html = render(['ahamove.manage'], '/ahamove/handed-over');
  assert(html.includes('id="ahamove-navigation"'));
  assert(html.includes('href="/ahamove"'));
  assert(html.includes('href="/ahamove/handed-over"'));
  assert(html.includes('Bàn giao đơn'));
  assert(html.includes('Đã bàn giao'));
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
});
