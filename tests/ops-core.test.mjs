import assert from "assert";
import fs from "fs";
import vm from "vm";

const code = fs.readFileSync(new URL("../ops-core.js", import.meta.url), "utf8");
const context = { console, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context);
const O = context.OPS;

const catalog = [
  ["토스상품명", "판매가", "구매제한", "이미지"],
  ["AOT_26_키링", "12000", "2", "http://img"]
];
const logistics = [
  ["바코드", "상품명", "입고수량", "실입고수량"],
  ["8801234567890", "AOT_26_키링 아크릴", "10", "8"],
  ["8801234567891", "AOT_26_뱃지", "4", "4"]
];
const picked = O.chooseSheet([{ name: "상품목록", rows: catalog }, { name: "물류 일정", rows: logistics }], "plan");
assert.equal(picked.name, "물류 일정");
const parsed = O.countParseRows(logistics, { mode: "plan" });
assert.equal(parsed.err, undefined);
assert.equal(parsed.items.length, 2);
assert.equal(parsed.items[0].plan, 10);
assert.equal(parsed.items[0].qty, 8);
assert.equal(parsed.items[0].name, "AOT_26_키링 아크릴");
assert.ok(parsed.readLine === undefined);
assert.ok(O.readLineText("물류 일정", parsed.planLabel, parsed.qtyLabel).includes("물류 일정"));
assert.ok(parsed.qtyLabel.includes("실입고"));

const countRows = [
  ["바코드", "상품명", "입고수량", "실사"],
  ["8801234567890", "AOT_26_키링 아크릴", "10", "3"]
];
const counted = O.countParseRows(countRows, { mode: "count" });
assert.equal(counted.items[0].qty, 3);
assert.equal(counted.items[0].name, "AOT_26_키링 아크릴");

const shelf = [
  ["바코드", "상품명", "창고", "하부장"],
  ["8801234567890", "AOT_26_키링 아크릴", "2", "1"]
];
const shelfParsed = O.countParseRows(shelf, { mode: "count" });
assert.ok(shelfParsed.err && shelfParsed.err.includes("하부장"));

const pasted = O.parsePasteTable("바코드\t상품명\t실입고수량\n8801234567890\tAOT_26_키링 아크릴\t6");
assert.equal(pasted.length, 2);
assert.equal(pasted[1][2], "6");
const fromPaste = O.countParseRows(pasted, { mode: "actual" });
assert.equal(fromPaste.items[0].qty, 6);
assert.equal(fromPaste.items[0].name, "AOT_26_키링 아크릴");

const draft = O.productDraft({ name: "AOT_26_키링 아크릴", bc: "8801234567890", ip: "" }, "홀딩스_AOT_물류.xlsx");
assert.equal(draft.name, "AOT_26_키링 아크릴");
assert.equal(draft.ip, "진격의 거인");
assert.equal(draft.barcode, "8801234567890");

const products = [{ id: "8801234567890", sku: "8801234567890", barcode: "8801234567890", name: "AOT_26_키링 아크릴" }];
const preview = O.auditPreview(counted, products, () => 10);
assert.equal(preview.matched[0].book, 10);
assert.equal(preview.matched[0].qty, 3);
assert.equal(preview.matched[0].diff, -7);
assert.equal(O.auditDrops(preview).length, 1);

const pending = O.pendingSales(
  [{ date: "2026-11-01", items: [{ n: "AOT_26_키링 아크릴", k: "8801234567890", q: 5 }] }],
  products,
  { "suwon_2026-11-01_8801234567890": 2 },
  "suwon"
);
assert.equal(pending.length, 1);
assert.equal(pending[0].todo, 3);
const again = O.pendingSales(
  [{ date: "2026-11-01", items: [{ n: "AOT_26_키링 아크릴", k: "8801234567890", q: 5 }] }],
  products,
  { "suwon_2026-11-01_8801234567890": 5 },
  "suwon"
);
assert.equal(again.length, 0);

const sched = O.parseSchedText("## 1. 공식 발표\n- 2026-11-12 ~ 2026-11-20 | 홍대 리밋션 | 진격거인 팝업 | https://example.com\n## 2. 내부 예정\n- 2026-11-12 ~ 2026-11-20 | 홍대 리밋션 | 진격거인 팝업 사전 예약\n- 미정 | 수원 | 날짜 없는 행사");
assert.equal(sched.rows[0].source, "x");
assert.equal(sched.rows[1].source, "plan");
assert.equal(sched.rows[2].undated, true);
const groups = O.schedGroups(sched.rows);
assert.equal(groups.length, 1);
assert.equal(groups[0].kids.length, 1);
assert.equal(O.SCHED_TYPES[groups[0].main.type], "팝업");

const empty = O.closeModel({ ym: "2026-11", days: [], salesKnown: true, tx: [], stock: [], popups: [] });
assert.equal(empty.amount, null);
assert.equal(empty.profit, null);
const filled = O.closeModel({
  ym: "2026-11",
  salesKnown: true,
  days: [{ date: "2026-11-02", locationId: "h", amount: 1000, qty: 2 }],
  tx: [{ type: "IN", qty: 4 }, { type: "OUT", qty: 1 }],
  stock: [{ qty: 3, price: 500 }],
  popups: [],
  profit: { profit: 100, sales: 1000, qty: 2 }
});
assert.equal(filled.amount, 1000);
assert.equal(filled.inboundQty, 4);
assert.equal(filled.stockValue, 1500);
assert.equal(filled.profit, 100);

const openDraft = { done: false, items: [{ id: "8801234567890", bc: "8801234567890" }], extra: [] };
assert.equal(O.inboundHits(openDraft, { "8801234567890": 1 }, {}), 1);
assert.equal(O.inboundHits({ done: true, items: openDraft.items }, { "8801234567890": 1 }, {}), 0);

console.log("ops-core ok");
