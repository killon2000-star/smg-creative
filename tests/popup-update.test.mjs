import { createRequire } from "module";
import assert from "assert";
import fs from "fs";
import vm from "vm";

const code = fs.readFileSync(new URL("../popup-update.js", import.meta.url), "utf8");
const context = { console, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context);
const U = context.POPUP_UPDATE;

const today = "2026-11-13";
const grid = U.monthGrid("2026-11");
assert.equal(grid.weeks, 5);
assert.equal(grid.cells[0].iso, "2026-11-01");
assert.equal(grid.cells[0].inMonth, true);
assert.equal(grid.end, "2026-11-30");

const open = { id: "a", name: "진행", start: "2026-11-06", end: "2026-11-22" };
const soon = { id: "b", name: "예정", start: "2026-11-20", end: "2026-12-03" };
const ended = { id: "c", name: "종료", start: "2026-10-02", end: "2026-10-18" };
const none = { id: "d", name: "미정", start: "", end: "" };
const bad = { id: "e", name: "역전", start: "2026-11-20", end: "2026-11-01" };
assert.equal(U.statusOf(open, today), "진행중");
assert.equal(U.statusOf(soon, today), "예정");
assert.equal(U.statusOf(ended, today), "종료");
assert.equal(U.statusOf(none, today), "날짜 미정");
assert.equal(U.statusOf(bad, today), "날짜 미정");
assert.equal(U.covers(open, "2026-11-06"), true);
assert.equal(U.covers(open, "2026-11-22"), true);
assert.equal(U.covers(open, "2026-11-23"), false);
assert.equal(U.covers(none, "2026-11-13"), false);

const rows = U.checklistModel({ start: "2026-11-06", end: "2026-11-22", prep: { contract: { done: true, at: "2026-10-01" }, inbound: { done: true } } }, today);
assert.equal(rows.length, 5);
assert.equal(rows[0].done, true);
assert.equal(rows[0].overdue, false);
assert.equal(rows[2].id, "promo");
assert.equal(rows[2].due, "2026-11-03");
assert.equal(rows[2].overdue, true);
assert.equal(rows[3].due, "2026-11-06");
assert.equal(rows[3].overdue, true);
assert.equal(rows[4].due, "2026-11-22");
assert.equal(rows[4].overdue, false);
assert.equal(rows.filter((r) => r.done).length, 2);

const html = U.renderCalendar({
  items: [{ p: open }, { p: soon }, { p: none }, { p: { id: "f", name: "하루", start: "2026-11-13", end: "2026-11-13" } }, { p: { id: "g", name: "둘", start: "2026-11-13", end: "2026-11-15" } }],
  locs: [],
  today,
  params: new URLSearchParams("m=2026-11&d=2026-11-13")
});
assert.ok(html.includes("날짜 미정"));
assert.ok(html.includes("이전 달") && html.includes("이번달") && html.includes("다음 달"));
assert.ok(html.includes("+2") || html.includes("+3") || html.includes("calmore"));
assert.ok(!html.includes("undefined"));

const seong = {
  p: { id: "s", name: "성수 가을", start: "2026-10-02", end: "2026-10-18", kind: "collab" },
  days: 17, a: 17000000, q: 850, perDay: 1000000, hasCost: true, profit: 4828000, rate: 28.4, st: 82.5,
  target: 15000000, tgtPct: 17000000 / 15000000 * 100,
  IP: [{ ip: "캐릭터A", a: 10200000 }, { ip: "캐릭터B", a: 6800000 }], S: { to: "2026-10-18" }
};
const busan = {
  p: { id: "b", name: "부산 여름", start: "2026-09-01", end: "2026-09-10", kind: "collab" },
  days: 10, a: 3200000, q: 400, perDay: 320000, hasCost: true, profit: 368000, rate: 11.5, st: 33.2,
  target: 8000000, tgtPct: 40, IP: [{ ip: "캐릭터A", a: 2000000 }], S: { to: "2026-09-10" }
};
const daejeon = {
  p: { id: "j", name: "대전 봄", start: "2026-03-01", end: "2026-03-08", kind: "ip" },
  days: 8, a: 5600000, q: 500, perDay: 700000, hasCost: false, profit: null, rate: null, st: null,
  target: 0, tgtPct: null, IP: [], S: { to: "2026-03-08" }
};
const model = U.compareModel([seong, busan, daejeon], today, 20);
const blob = JSON.stringify(model);
assert.ok(blob.includes("1,000,000"));
assert.ok(blob.includes("3,200,000"));
assert.ok(U.renderCompare([seong, busan, daejeon], today, 20).includes("5,600,000원"));
assert.ok(blob.includes("성수 가을"));
assert.ok(blob.includes("33.2"));
assert.ok(blob.includes("11.5"));
assert.ok(blob.includes("캐릭터A"));
assert.ok(blob.includes("10,200,000"));
assert.ok(!blob.includes("999,999"));
assert.ok(model.rec.includes("성수 가을"));
assert.ok(model.warn.some((w) => w.includes("원가 숫자")));
assert.ok(!model.warn.some((w) => /마진율 \d/.test(w) && w.includes("대전")));
const view = U.renderCompare([seong, busan, daejeon], today, 20);
assert.ok(view.includes("cmpval"));
assert.ok(view.includes("1,000,000원"));
assert.ok(view.includes("17,000,000원"));
assert.ok(view.includes("요약") && view.includes("잘한 점") && view.includes("문제점") && view.includes("다음 팝업 추천") && view.includes("경고"));

const check = U.renderChecklist({ name: "한강", start: "2026-11-06", end: "2026-11-22", prep: { contract: { done: true }, inbound: { done: true } } }, today, true);
assert.ok(check.includes("2/5"));
assert.ok(check.includes("40%"));
assert.ok(check.includes("예정일 지남"));
assert.ok(check.includes("철수"));
console.log("popup-update tests ok");
