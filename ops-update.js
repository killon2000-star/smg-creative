/* 입고 확인, 월말 실사, 상품 이동, 월말 마감, 파일 붙여넣기. 월간 일정 저장은 팝업 달력과 같이 씁니다. */
(function (global) {
  var OPS = global.OPS;
  var KEY = "smgc-ib-draft";
  var UNDO = "smgc-audit-undo";
  var SCHED = "smgc-schedule";
  var audit = { only: true, loc: "", undo: null };
  var move = { from: "", to: "", lines: [] };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    return Number(Math.round(Number(n) || 0)).toLocaleString("ko-KR");
  }
  function readJson(key, fallback) {
    try { var v = JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || ""); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function saveIb(d) { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function loadIb() { return readJson(KEY, null); }
  function norm(s) { return String(s || "").replace(/\s+/g, "").toLowerCase(); }

  function buttons(list, cur, attr) {
    return '<div class="sgrid" role="group">' + list.map(function (l) {
      return '<button type="button" class="sbtn' + (l.id === cur ? " on" : "") + '" data-' + attr + '="' + esc(l.id) + '">' + esc(l.name) + "</button>";
    }).join("") + "</div>";
  }
  function fileBox(id, hint) {
    return '<label class="lb" for="' + id + '">' + hint + '</label><textarea class="ops-ta" id="' + id + '" placeholder="엑셀이나 구글 시트에서 복사해 붙이세요"></textarea><button type="button" class="sec" id="' + id + 'Go">붙여넣은 표 읽기</button><div class="ops-drop" data-drop="' + id + '"><b>엑셀 파일을 끌어 놓거나 고르세요</b><input type="file" id="' + id + 'File" accept=".xlsx,.xls,.xlsm,.csv"></div>';
  }
  function steps(n) {
    var t = ["1 입고 예정", "2 실입고", "3 비교·확정"];
    return '<div class="ops-steps" role="group" aria-label="입고 단계">' + t.map(function (x, i) {
      return '<button type="button" class="' + (i + 1 === n ? "on" : i + 1 < n ? "done" : "") + '" data-ibstep="' + (i + 1) + '">' + x + "</button>";
    }).join("") + "</div>";
  }
  function lineCard(name, code, bits, bad) {
    return '<article class="grow' + (bad ? " bad" : "") + '"><b>' + esc(name) + "</b>" + (code ? '<div class="code">' + esc(code) + "</div>" : "") + '<div class="gnums">' + bits + "</div></article>";
  }
  function inboundHtml(d, places) {
    d = d || { step: 1, items: [], extra: [], warns: [] };
    var step = d.step || 1;
    var rows = (d.items || []).map(function (x) {
      var actual = x.actual == null ? null : x.actual;
      return Object.assign({}, x, { d: actual == null ? null : actual - (x.plan || 0) });
    });
    var extra = d.extra || [];
    var same = rows.filter(function (r) { return r.d === 0; }).length;
    var diff = rows.filter(function (r) { return r.d != null && r.d !== 0; }).length;
    var miss = rows.filter(function (r) { return r.actual == null || (r.plan > 0 && r.actual === 0); }).length;
    var sum = rows.length + extra.length + "종 중 일치 " + same + " · 차이 " + diff + " · 예정에 없던 상품 " + extra.length + " · 미입고 " + miss;
    var show = function (r) { return !d.only || r.d !== 0; };
    var cards = rows.filter(show).map(function (r) {
      return lineCard(r.name || "이름 없음", (r.bc || "") + (r.fresh ? " · 새 상품" : " · 기존") + (r.lines > 1 ? " · " + r.lines + "줄 합침" : ""), '<span>예정 ' + fmt(r.plan || 0) + "</span><span>실입고 " + (r.actual == null ? "—" : fmt(r.actual)) + '</span><span class="' + (r.d ? "bad" : "") + '">차이 ' + (r.d == null ? "—" : (r.d > 0 ? "+" : "") + fmt(r.d)) + "</span>", r.d);
    }).join("") + extra.map(function (r) {
      return lineCard(r.name || "이름 없음", (r.bc || "") + " · 예정에 없던 상품", "<span>예정 0</span><span>실입고 " + fmt(r.actual || 0) + '</span><span class="bad">차이 +' + fmt(r.actual || 0) + "</span>", true);
    }).join("");
    var upload = step === 1
      ? fileBox("ibPaste", "입고 예정 붙여넣기")
      : fileBox("ibActPaste", "실입고 붙여넣기");
    var tools = '<div class="row ops-tools"><button type="button" class="sec" id="ibCancel">취소</button>' + (step === 3 && !d.done ? '<button type="button" class="sec" id="ibReup">다시 올리기</button>' : "") + "</div>";
    var body = step < 3
      ? '<div class="card">' + (d.err ? '<p class="err">' + esc(d.err) + "</p>" : "") + (d.msg ? '<p class="msg">' + esc(d.msg) + "</p>" : "") + ((d.warns || []).length ? '<p class="muted">' + esc(d.warns.join(" ")) + "</p>" : "") + (step === 1 && rows.some(function (r) { return r.actual != null; }) ? '<p class="muted">이미 올린 실입고 수량은 남겨 둡니다.</p>' : "") + (step === 2 ? '<p class="muted">예정 수량은 남겨 두고, 실입고 파일만 바꿉니다.</p>' : "") + upload + (d.readLine && step === 1 ? '<p class="muted">' + esc(d.readLine) + "</p>" : "") + (step === 1 && rows.length ? '<div class="glist">' + rows.map(function (r) { return lineCard(r.name, r.bc, "<span>예정 " + fmt(r.plan || 0) + "</span>" + (r.actual != null ? "<span>실입고 " + fmt(r.actual) + "</span>" : ""), false); }).join("") + "</div>" : "") + (step === 2 ? '<div class="glist">' + rows.map(function (r) { return lineCard(r.name, r.bc, "<span>예정 " + fmt(r.plan || 0) + "</span>", false); }).join("") + "</div>" : "") + "</div>"
      : '<div class="card">' + (d.readLine ? '<p class="muted">' + esc(d.readLine) + "</p>" : "") + (d.done && d.result ? '<p class="msg">' + esc(d.result) + "</p>" : "") + (d.aliasNote ? '<p class="muted">' + esc(d.aliasNote) + "</p>" : "") + '<p>' + esc(sum) + '</p><button type="button" class="sec" id="ibOnly">' + (d.only ? "전체 보기" : "차이만") + '</button><div class="glist">' + (cards || '<p class="muted">보이는 상품이 없습니다.</p>') + "</div></div>";
    var bar = step === 3 && !d.done ? '<div class="ops-bar"><p>' + esc(sum) + '</p><button type="button" class="btn" id="ibGo">실제 수량으로 입고 확정</button></div>' : (step === 1 && rows.length && !d.done ? '<div class="ops-bar"><button type="button" class="btn" id="ibNext">실입고 단계로</button></div>' : "");
    var pend = (d.pending || []).length ? '<div class="card"><h3>아직 차감하지 않은 판매</h3><p class="muted">최근 120일 안에 저장만 된 매출입니다. 이미 차감한 수량은 빼 두었습니다.</p><div class="glist">' + d.pending.map(function (r) {
      return lineCard(r.name, r.date, "<span>판매 " + fmt(r.qty) + "</span><span>기반영 " + fmt(r.done) + "</span><span>차감 " + fmt(r.todo) + "</span>", false);
    }).join("") + '</div><button type="button" class="btn" id="ibPos">이 판매 차감</button></div>' : (d.posNote ? '<p class="muted">' + esc(d.posNote) + "</p>" : "");
    return '<section class="ops"><h2>입고 확인</h2><p class="muted">입고 예정 파일을 올리고, 실입고 수량을 비교한 뒤 한 번에 재고에 넣습니다.</p>' + buttons(places || [], d.loc, "ibstore") + '<label class="lb">입고일<input type="date" id="ibDate" value="' + esc(d.date || "") + '"></label>' + steps(step) + tools + body + bar + pend + "</section>";
  }
  function auditHtml(s, places) {
    s = s || {};
    var p = s.preview;
    var only = s.only !== false;
    var rows = p ? p.matched.filter(function (m) { return !only || m.diff !== 0; }) : [];
    var cards = rows.map(function (m) {
      return lineCard(m.name, m.code + (m.lines > 1 ? " · " + m.lines + "줄 합침" : ""), '<span>전산 ' + fmt(m.book) + "</span><span>실사 " + fmt(m.qty) + '</span><span class="' + (m.diff ? "bad" : "") + '">차이 ' + (m.diff > 0 ? "+" : "") + fmt(m.diff) + "</span>", m.diff);
    }).join("");
    var fresh = (!p || only) ? "" : (p.fresh || []).map(function (x) {
      return lineCard(x.name || "이름 없음", (x.bc || "") + " · 전산에 없음", "<span>실사 " + (x.qty == null ? "—" : fmt(x.qty)) + "</span>", false);
    }).join("");
    var sum = p ? ("일치 " + p.matched.filter(function (m) { return m.diff === 0; }).length + " · 차이 " + p.matched.filter(function (m) { return m.diff !== 0; }).length + " · 전산에 없는 상품 " + (p.fresh || []).length + " · 실사에서 빠진 상품 " + (p.absent || 0)) : "";
    var guard = s.guard ? '<div class="card"><h3>실사 등록 확인</h3><p>기존 재고 ' + ((p && p.matched.filter(function (m) { return m.diff !== 0; }).length) || 0) + '종이 바뀝니다.</p>' + ((s.drops || []).length ? '<p class="err">크게 줄어드는 상품 ' + s.drops.length + "종</p>" + s.drops.map(function (m) { return lineCard(m.name, m.code, fmt(m.book) + " → " + fmt(m.qty), true); }).join("") : '<p class="muted">30% 이상 줄거나 0이 되는 기존 상품은 없습니다.</p>') + (s.inboundWarn ? '<p class="err">' + esc(s.inboundWarn) + "</p>" : "") + '<label class="lb" for="audWord">확인 글자</label><input id="audWord" placeholder="실사" autocomplete="off" aria-label="실사 입력"><p class="muted">등록하려면 위 칸에 실사 를 그대로 입력하세요.</p><button type="button" class="btn" id="audOk" disabled>실사 등록</button></div>' : "";
    return '<section class="ops"><h2>월말 실사</h2><p class="muted">실사 파일을 전산재고와 비교하고, 차이만 재고에 맞춥니다.</p>' + buttons(places || [], s.loc, "audstore") + '<div class="card">' + (s.err ? '<p class="err">' + esc(s.err) + "</p>" : "") + (s.msg ? '<p class="msg">' + esc(s.msg) + "</p>" : "") + (p ? '<div class="row"><button type="button" class="sec" id="audFile">엑셀 다시 올리기</button>' + (s.undo ? '<button type="button" class="sec" id="audUndo">되돌리기</button>' : "") + '</div><input type="file" id="audPasteFile" accept=".xlsx,.xls,.xlsm,.csv" hidden>' : fileBox("audPaste", "실사표 붙여넣기") + '<div class="row"><button type="button" class="sec" id="audUndo"' + (s.undo ? "" : " hidden") + ">되돌리기</button></div>") + (s.readLine ? '<p class="muted">' + esc(s.readLine) + "</p>" : "") + ((s.warns || []).length ? '<p class="muted">' + esc(s.warns.join(" ")) + "</p>" : "") + (sum ? "<p>" + esc(sum) + "</p>" : "") + (p ? '<button type="button" class="sec" id="audOnly">' + (only ? "전체 보기" : "차이만") + "</button>" : "") + '<div class="glist">' + cards + "</div>" + (fresh ? "<h3>전산에 없는 상품</h3><div class=\"glist\">" + fresh + "</div>" : "") + "</div>" + guard + (p && !s.guard ? '<div class="ops-bar"><p>' + esc(sum) + '</p><button type="button" class="btn" id="audGo"' + (p.matched.length || (p.fresh || []).length ? "" : " disabled") + ">실사 반영</button></div>" : "") + "</section>";
  }
  function moveHtml(s, places) {
    s = s || { lines: [] };
    var ready = s.lines && s.lines.length && s.from && s.to && s.from !== s.to;
    return '<section class="ops"><h2>상품 이동</h2><p class="muted">매장과 창고 사이로 상품을 옮깁니다. 확정하면 보내는 곳 재고가 줄고 받는 곳 재고가 늘어납니다.</p><h3>보내는 곳</h3>' + buttons(places || [], s.from, "mvfrom") + "<h3>받는 곳</h3>" + buttons(places || [], s.to, "mvto") + '<div class="card">' + fileBox("mvPaste", "이동 목록 붙여넣기") + (s.note ? '<p class="muted">' + esc(s.note) + "</p>" : "") + (s.err ? '<p class="err">' + esc(s.err) + "</p>" : "") + ((s.lines || []).length ? '<div class="glist">' + s.lines.map(function (l) {
      return lineCard(l.name, l.code, "<span>현재 " + fmt(l.book) + '</span><label>수량 <input class="ops-qty" type="number" min="1" inputmode="numeric" value="' + esc(l.qty) + '" data-mvq="' + esc(l.id) + '" aria-label="이동 수량"></label><button type="button" class="sec" data-mvdel="' + esc(l.id) + '">빼기</button>', false);
    }).join("") + "</div>" : '<p class="muted">표를 붙이거나 엑셀을 올리세요.</p>') + "</div>" + (ready ? '<div class="ops-bar"><p>' + s.lines.length + "종</p>" + '<button type="button" class="btn" id="mvGo">이동 확정</button></div>' : "") + "</section>";
  }
  function bars(rows, key, unit) {
    if (!rows || !rows.length) return '<p class="muted">자료 없음</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r[key]) || 0; }));
    if (!(max > 0)) return '<p class="muted">자료 없음</p>';
    var labels = rows.map(function (r) { return fmt(Number(r[key]) || 0) + unit; });
    var valueW = Math.max.apply(null, labels.map(function (t) { return Math.ceil(t.length * 8.2) + 10; }));
    var labelW = 52;
    var barMax = 220;
    var w = labelW + barMax + 8 + valueW;
    var rh = 28;
    var h = rh * rows.length + 4;
    var body = rows.map(function (r, i) {
      var v = Number(r[key]) || 0;
      var bw = Math.max(4, Math.round((v / max) * barMax));
      var y = 4 + i * rh;
      return '<text class="ops-ax" x="0" y="' + (y + 16) + '">' + esc(r.label) + '</text><rect x="' + labelW + '" y="' + y + '" width="' + bw + '" height="16"></rect><text class="ops-val" x="' + (labelW + bw + 8) + '" y="' + (y + 14) + '">' + esc(labels[i]) + "</text>";
    }).join("");
    return '<svg class="ops-chart" viewBox="0 0 ' + w + " " + h + '" style="aspect-ratio:' + w + " / " + h + '" role="img">' + body + "</svg>";
  }
  function closeHtml(m, ym) {
    function cell(v, unit) { return v == null ? '<span class="muted">자료 없음</span>' : esc(fmt(v) + (unit || "")); }
    var cap = (global.SMGC && global.SMGC.today ? global.SMGC.today() : new Date().toISOString().slice(0, 10)).slice(0, 7);
    var prev = shiftYm(ym, -1);
    return '<section class="ops mrep"><div class="ops-tools row"><button type="button" class="sec" data-cym="' + esc(cap) + '">이번달</button><button type="button" class="sec" data-cym="' + esc(prev) + '">지난달</button><button type="button" class="sec" data-cstep="-1">이전 달</button><button type="button" class="sec" data-cstep="1">다음 달</button><button type="button" class="btn" id="closePrint">인쇄</button></div><header class="block"><h2>' + esc(ym.slice(0, 4)) + "년 " + Number(ym.slice(5)) + '월 월말 마감</h2><p class="muted">저장된 매출·재고·입출고만 보여 줍니다. 없는 항목은 비워 둡니다.</p></header>'
      + block("매출", "<p>매출 " + cell(m.amount, "원") + " · 수량 " + cell(m.qty, "개") + "</p>" + locTable(m.locRows), bars(m.dayRows.map(function (d) { return { label: d.date.slice(5), amount: d.amount }; }), "amount", "원"))
      + block("입고 · 출고", "<p>입고 " + cell(m.inboundQty, "개") + " (" + fmt(m.inboundN || 0) + "건) · 출고 " + cell(m.outboundQty, "개") + " (" + fmt(m.outboundN || 0) + "건)</p>", "")
      + block("재고", "<p>수량 " + fmt(m.stockUnits || 0) + "개 · 상품 " + fmt(m.stockKinds || 0) + "종 · 품절 " + fmt(m.stockZero || 0) + "종 · 마이너스 " + fmt(m.stockNeg || 0) + "종</p><p>재고 금액 " + (m.stockValue == null ? '<span class="muted">판매가가 있는 재고가 없습니다</span>' : esc(fmt(m.stockValue) + "원")) + (m.stockNoPrice ? ' <span class="muted">판매가 없는 ' + fmt(m.stockNoPrice) + "종은 금액에서 뺐습니다</span>" : "") + "</p>", "")
      + block("이익", m.profit == null ? '<p class="muted">원가가 있는 판매가 없어 이익을 비웁니다.</p>' : "<p>이익 " + esc(fmt(m.profit)) + "원 · 원가 있는 판매 " + esc(fmt(m.profitSales)) + "원 · " + esc(fmt(m.profitQty)) + "개</p>", "")
      + block("팝업", (m.popups || []).length ? "<ul>" + m.popups.map(function (p) { return "<li>" + esc(p.name) + " · " + esc(p.range || "") + (p.amount == null ? " · 매출 자료 없음" : " · " + esc(fmt(p.amount)) + "원") + "</li>"; }).join("") + "</ul>" : '<p class="muted">이 달에 겹치는 팝업이 없습니다.</p>', "")
      + "</section>";
  }
  function locTable(rows) {
    if (!rows || !rows.length) return '<p class="muted">매장별 매출 자료 없음</p>';
    return '<div class="glist">' + rows.map(function (r) { return lineCard(r.name, r.days + "일", "<span>" + fmt(r.amount) + "원</span><span>" + fmt(r.qty) + "개</span>", false); }).join("") + "</div>";
  }
  function block(title, text, chart) {
    var body = chart ? '<div class="ops-split"><div>' + text + '</div><div class="ops-chartwrap">' + chart + "</div></div>" : text;
    return '<section class="block"><h3>' + title + "</h3>" + body + "</section>";
  }
  function shiftYm(ym, delta) {
    var p = ym.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1 + delta, 1));
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
  }
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function rowsOfParsed(parsed, products, fileName, mode) {
    var map = new Map();
    (parsed.items || []).forEach(function (r) {
      if (r.plan == null && r.qty == null) return;
      var key = r.bc || norm(r.name);
      if (!key) return;
      var actual = r.countCol && r.qty != null ? r.qty : null;
      var plan = r.plan != null ? r.plan : (actual != null ? actual : (r.qty || 0));
      var hit = OPS.matchProduct(products, r);
      var ip = OPS.fileIp(fileName, r.ip, r.name).ip;
      var prev = map.get(key);
      if (prev) {
        prev.plan += plan || 0;
        if (actual != null) prev.actual = (prev.actual || 0) + actual;
        prev.lines++;
      } else map.set(key, { key: key, bc: r.bc || "", name: r.name || "", plan: plan || 0, actual: actual, id: hit.product ? hit.product.id : "", ip: ip, lines: r.lines || 1, fresh: !hit.product });
    });
    return Array.from(map.values()).filter(function (r) { return mode === "actual" ? r.actual != null || r.plan : (r.plan > 0 || r.actual > 0); });
  }

  async function readBookFile(S, file, mode) {
    var X = await S.xlsx();
    var buf = await file.arrayBuffer();
    var head = X.read(buf, { type: "array", sheetRows: 80 });
    var list = head.SheetNames.map(function (name) {
      return { name: name, rows: X.utils.sheet_to_json(head.Sheets[name], { header: 1, defval: "", raw: false }) };
    });
    var pick = OPS.chooseSheet(list, mode);
    if (!pick) throw new Error("상품과 수량 칸이 있는 탭을 찾지 못했습니다.");
    var full = X.read(buf, { type: "array", sheets: [pick.name] });
    var ws = full.Sheets[pick.name];
    var rows = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    if (S.fillMerges) rows = S.fillMerges(rows, ws["!merges"] || []);
    var parsed = OPS.countParseRows(rows, { mode: mode });
    return { parsed: parsed, readLine: OPS.readLineText(pick.name, parsed.planLabel, parsed.qtyLabel), warns: (pick.warns || []).concat(parsed.warns || []), name: pick.name };
  }
  function readTextTable(text, mode) {
    var rows = OPS.parsePasteTable(text);
    var parsed = OPS.countParseRows(rows, { mode: mode });
    return { parsed: parsed, readLine: OPS.readLineText("", parsed.planLabel, parsed.qtyLabel), warns: parsed.warns || [], name: "붙여넣기" };
  }

  function placesOf(list) {
    return (list || []).filter(function (l) { return l && l.active !== false; }).map(function (l) { return { id: l.id, name: l.name }; });
  }

  function boot(S) {
    try { audit.undo = JSON.parse(localStorage.getItem(UNDO) || "null"); } catch (e) { audit.undo = null; }

    global.SMGC_SCHEDULE = function () { return loadSchedule(S); };
    global.SMGC_PICK_ROWS = function (wb, X) {
      var mode = "plan";
      var sel = document.querySelector("#btype");
      if (sel && sel.value === "ADJ") mode = "count";
      else if (sel && sel.value === "MOVE") mode = "move";
      var list = (wb.SheetNames || []).map(function (name) {
        var ws = wb.Sheets[name];
        if (!ws) return { name: name, rows: [] };
        try { if (S.widenSheet) S.widenSheet(ws, X); } catch (e) {}
        var rows = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
        if (S.fillMerges) rows = S.fillMerges(rows, ws["!merges"] || []);
        return { name: name, rows: rows.slice(0, 80) };
      });
      var pick = OPS.chooseSheet(list, mode);
      if (!pick) return null;
      var ws = wb.Sheets[pick.name];
      try { if (S.widenSheet) S.widenSheet(ws, X); } catch (e) {}
      var rows = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      if (S.fillMerges) rows = S.fillMerges(rows, ws["!merges"] || []);
      var parsed = OPS.countParseRows(rows, { mode: mode });
      global.SMGC_LAST_SHEET = { name: pick.name, readLine: OPS.readLineText(pick.name, parsed.planLabel || pick.sc && pick.sc.planLabel, parsed.qtyLabel || (pick.sc && pick.sc.qtyLabel)), warns: (pick.warns || []).concat(parsed.warns || []) };
      return rows;
    };

    S.routes["/inbound"] = async function () {
      var places = placesOf(await S.locations(true));
      var d = loadIb() || { id: "ib" + Date.now().toString(36), step: 1, loc: (places[0] && places[0].id) || "", date: S.today(), items: [], extra: [], warns: [], only: true };
      if (!d.loc && places[0]) d.loc = places[0].id;
      if (!d.date) d.date = S.today();
      saveIb(d);
      return inboundHtml(d, places);
    };
    S.routes["/audit"] = async function () {
      var places = placesOf(await S.locations(true));
      if (!audit.loc && places[0]) audit.loc = places[0].id;
      return auditHtml(audit, places);
    };
    S.routes["/move"] = async function () {
      var places = placesOf(await S.locations(true));
      if (!move.from && places[0]) move.from = places[0].id;
      if (!move.to && places[1]) move.to = places[1].id;
      return moveHtml(move, places);
    };
    S.routes["/close"] = async function (params) {
      var ym = params.get("m") || "";
      if (!/^\d{4}-\d{2}$/.test(ym)) ym = S.today().slice(0, 7);
      var from = ym + "-01", to = OPS.monthEnd(ym);
      var locs = placesOf(await S.locations(true));
      var days = [], tx = [], stockRows = [], profit = null, popups = [], salesKnown = false, txKnown = false;
      try { days = await S.salesRange(from, to, ""); salesKnown = true; } catch (e) { days = []; salesKnown = false; }
      try { tx = await S.txRange(from, to, locs.map(function (l) { return l.id; })); txKnown = true; } catch (e) { tx = []; txKnown = false; }
      try {
        var products = await S.products();
        var ids = locs.map(function (l) { return l.id; });
        var map = await S.stockMap(ids);
        products.forEach(function (p) {
          ids.forEach(function (id) {
            var q = map[p.id + "_" + id] || 0;
            if (q) stockRows.push({ qty: q, price: Number(p.price) });
          });
        });
        profit = profitOf(days, products);
      } catch (e) { stockRows = []; }
      try {
        var pack = await S.loadPopups();
        popups = (pack.ms || []).filter(function (it) {
          var p = it.p || {};
          return p.start && p.start <= to && (p.end || p.start) >= from;
        }).map(function (it) {
          return { name: it.p.name, range: (it.p.start || "") + (it.p.end ? " ~ " + it.p.end : ""), amount: Number.isFinite(it.a) ? it.a : null };
        });
      } catch (e) { popups = []; }
      var locName = {};
      locs.forEach(function (l) { locName[l.id] = l.name; });
      var model = OPS.closeModel({ ym: ym, days: days.map(function (d) { return { date: d.date, locationId: d.locationId, amount: d.amount, qty: d.qty }; }), locs: locs, tx: txKnown ? tx : null, stock: stockRows, popups: popups, salesKnown: salesKnown, profit: profit });
      model.locRows.forEach(function (r) { r.name = locName[r.id] || r.name; });
      return closeHtml(model, ym);
    };

    var prevAfter = global.SMGC_AFTER;
    global.SMGC_AFTER = function (path, params) {
      if (prevAfter) prevAfter(path, params);
      try { after(S, path, params); } catch (e) { console.error(e); }
    };
  }

  function profitOf(days, products) {
    var byCode = {}, byName = {};
    products.forEach(function (p) {
      if (p.barcode) byCode[p.barcode] = p;
      if (p.sku) byCode[p.sku] = p;
      if (p.name) byName[norm(p.name)] = p;
    });
    var sales = 0, cost = 0, qty = 0, any = false;
    days.forEach(function (d) {
      (d.items || []).forEach(function (it) {
        var p = (it.k && byCode[it.k]) || byName[norm(it.n)];
        if (!p || !global.SMGC || !global.SMGC.unitCost) return;
        var u = global.SMGC.unitCost(p);
        if (!u || !u.hasCost) return;
        var q = Number(it.q) || 0, a = Number(it.a);
        if (!Number.isFinite(a)) a = q * (Number(p.price) || 0);
        any = true;
        sales += a;
        cost += u.total * q;
        qty += q;
      });
    });
    if (!any) return null;
    return { profit: Math.round(sales - cost), sales: Math.round(sales), qty: qty };
  }

  async function loadSchedule(S) {
    try {
      var snap = await S.getDoc(S.doc(S.db, "config", "monthSchedule"));
      if (snap && snap.exists && snap.exists() && Array.isArray((snap.data() || {}).events)) return snap.data().events;
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(SCHED) || "[]"); } catch (e) { return []; }
  }
  async function saveSchedule(S, events) {
    localStorage.setItem(SCHED, JSON.stringify(events));
    try {
      await S.setDoc(S.doc(S.db, "config", "monthSchedule"), { events: events, updatedAt: S.stamp() }, { merge: true });
      return "";
    } catch (e) {
      return "이 브라우저에만 저장했습니다. 다른 기기에서 보려면 관리자 저장이 필요합니다.";
    }
  }

  function navLink(label, href, text) {
    var groups = document.querySelectorAll("nav .ncl");
    var host = null;
    groups.forEach(function (g) {
      var t = g.querySelector(".ncl-t");
      if (t && t.textContent.trim() === label) host = g.querySelector(".ncl-i");
    });
    if (!host || host.querySelector('a[href="' + href + '"]')) return;
    var a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if ((location.hash.split("?")[0] || "#/") === href) a.className = "on";
    host.appendChild(a);
  }
  function mountPaste(cardSel, fileSel, goSel, asCsv) {
    var card = document.querySelector(cardSel);
    var input = document.querySelector(fileSel);
    if (!card || !input || card.querySelector(".ops-paste")) return;
    var box = document.createElement("div");
    box.className = "ops-paste";
    box.innerHTML = '<label class="lb">표 붙여넣기</label><textarea class="ops-ta" placeholder="엑셀이나 구글 시트에서 복사해 붙이세요"></textarea><button type="button" class="sec">붙여넣은 표 읽기</button>';
    var row = input.closest(".row") || input.parentElement;
    if (row && row.parentElement) row.parentElement.insertBefore(box, row.nextSibling);
    else card.appendChild(box);
    box.querySelector("button").addEventListener("click", async function () {
      var text = box.querySelector("textarea").value;
      if (!String(text).trim()) { alert("붙인 내용이 없습니다."); return; }
      var file;
      if (asCsv) file = new File([text], "붙여넣기.csv", { type: "text/csv" });
      else {
        var X = await global.SMGC.xlsx();
        var rows = OPS.parsePasteTable(text);
        var ws = X.utils.aoa_to_sheet(rows);
        var wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, "붙여넣기");
        file = new File([X.write(wb, { type: "array", bookType: "xlsx" })], "붙여넣기.xlsx");
      }
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      var go = document.querySelector(goSel);
      if (go) go.click();
    });
    card.addEventListener("dragover", function (e) { e.preventDefault(); card.classList.add("over"); });
    card.addEventListener("dragleave", function () { card.classList.remove("over"); });
    card.addEventListener("drop", function (e) {
      e.preventDefault();
      card.classList.remove("over");
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      var dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  function sheetNote() {
    var last = global.SMGC_LAST_SHEET;
    var host = document.getElementById("bres") || document.getElementById("pres") || document.getElementById("cires");
    if (!last || !host || host.querySelector(".ops-sheet")) return;
    var p = document.createElement("p");
    p.className = "ops-sheet muted";
    p.textContent = last.readLine + ((last.warns || []).length ? " " + last.warns.join(" ") : "");
    host.prepend(p);
  }

  function after(S, path) {
    navLink("입출고", "#/inbound", "입고 확인");
    navLink("입출고", "#/audit", "실사");
    navLink("입출고", "#/move", "상품 이동");
    navLink("매출", "#/close", "월말 마감");
    if (path === "/bulk") { mountPaste("#app .card", "#bfile", "#bprev", false); sheetNote(); }
    if (path === "/pos") { mountPaste("#app .card", "#posf", "#pread", false); }
    if (path === "/costimport") { mountPaste("#app .card", "#cif", "#cigo", false); sheetNote(); }
    if (path === "/products") mountPaste("#app .card", "#pi", "#pib", true);
    if (path === "/popcal") mountSched(S);
    if (path === "/inbound") bindInbound(S);
    if (path === "/audit") bindAudit(S);
    if (path === "/move") bindMove(S);
    if (path === "/close") bindClose(S);
  }

  function mountSched(S) {
    var page = document.getElementById("calpage");
    if (!page || document.getElementById("schedBox")) return;
    var box = document.createElement("section");
    box.className = "card";
    box.id = "schedBox";
    box.innerHTML = '<h3>월간 일정 올리기</h3><p class="muted">한 줄에 하나. 예: - 2026-11-12 ~ 2026-12-03 | 홍대 | 행사 이름 | 주소. 큰 제목 ## 1. 공식 발표 는 공식 발표, ## 2. 내부 예정 은 내부 예정입니다. 세부 공지는 행사 이름 안에 예약·특전·오픈처럼 적으면 그 행사 안으로 들어갑니다.</p><textarea class="ops-ta" id="schedText" placeholder="일정 글을 붙이세요"></textarea><div class="row"><button type="button" class="btn" id="schedSave">이 일정 저장</button></div><p class="muted" id="schedMsg"></p>';
    page.appendChild(box);
    document.getElementById("schedSave").onclick = async function () {
      var parsed = OPS.parseSchedText(document.getElementById("schedText").value);
      var prev = await loadSchedule(S);
      var next = prev.slice();
      parsed.rows.forEach(function (r) {
        if (r.hold) return;
        var id = [r.source, r.venueKey, r.title, r.start, r.end].join("|");
        var i = next.findIndex(function (e) { return [e.source, e.venueKey, e.title, e.start, e.end].join("|") === id; });
        var ev = { source: r.source, venue: r.venue, venueKey: r.venueKey, type: r.type, title: r.title, start: r.start, end: r.end, time: r.time, note: r.note, link: r.link, undated: !!r.undated, open: !!r.open };
        if (i >= 0) next[i] = ev; else next.push(ev);
      });
      var note = await saveSchedule(S, next);
      var msg = document.getElementById("schedMsg");
      if (msg) msg.textContent = "줄 " + parsed.rows.length + "개를 읽었습니다." + (parsed.skipped.length ? " 읽지 못한 줄 " + parsed.skipped.length + "개." : "") + (note ? " " + note : "");
      if (parsed.rows.length) S.render();
    };
  }

  function bindInbound(S) {
    var d = loadIb();
    if (!d) return;
    document.querySelectorAll("[data-ibstore]").forEach(function (b) { b.onclick = function () { d.loc = b.getAttribute("data-ibstore"); saveIb(d); S.render(); }; });
    document.querySelectorAll("[data-ibstep]").forEach(function (b) { b.onclick = function () { d.step = Number(b.getAttribute("data-ibstep")); d.err = ""; saveIb(d); S.render(); }; });
    var date = document.getElementById("ibDate");
    if (date) date.onchange = function () { d.date = date.value; saveIb(d); };
    var cancel = document.getElementById("ibCancel");
    if (cancel) cancel.onclick = function () {
      d.items = []; d.extra = []; d.readLine = ""; d.warns = []; d.done = false; d.result = ""; d.pending = []; d.step = 1; d.err = ""; d.msg = "비교를 지웠습니다. 재고는 그대로입니다.";
      saveIb(d); S.render();
    };
    var reup = document.getElementById("ibReup");
    if (reup) reup.onclick = function () { d.step = 1; d.done = false; saveIb(d); S.render(); };
    var only = document.getElementById("ibOnly");
    if (only) only.onclick = function () { d.only = !d.only; saveIb(d); S.render(); };
    var next = document.getElementById("ibNext");
    if (next) next.onclick = function () { d.step = d.items.some(function (x) { return x.actual != null; }) ? 3 : 2; saveIb(d); S.render(); };
    wireFile(S, "ibPaste", "plan", async function (got) {
      var products = await S.products();
      if (got.parsed.err) { d.err = got.parsed.err; saveIb(d); S.render(); return; }
      d.items = rowsOfParsed(got.parsed, products, got.name, "plan");
      d.extra = [];
      d.err = d.items.length ? "" : "수량 줄을 찾지 못했습니다.";
      d.readLine = got.readLine;
      d.warns = got.warns || [];
      d.fileName = got.name;
      d.title = d.title || got.name;
      d.step = d.items.some(function (x) { return x.actual != null; }) ? 3 : 2;
      d.msg = "";
      saveIb(d); S.render();
    });
    wireFile(S, "ibActPaste", "actual", async function (got) {
      if (got.parsed.err) { d.err = got.parsed.err; d.step = 2; saveIb(d); S.render(); return; }
      var products = await S.products();
      var rows = rowsOfParsed(got.parsed, products, got.name, "actual").filter(function (r) { return r.actual != null || r.plan != null; });
      var use = (got.parsed.items || []).filter(function (r) { return r.qty != null; });
      if (!use.length) { d.err = "실입고 수량을 찾지 못했습니다."; saveIb(d); S.render(); return; }
      var extra = [];
      var grouped = {};
      use.forEach(function (r) {
        var k = r.bc || norm(r.name);
        grouped[k] = grouped[k] || { r: r, q: 0 };
        grouped[k].q += r.qty;
      });
      Object.keys(grouped).forEach(function (k) {
        var r = grouped[k].r, q = grouped[k].q;
        var i = d.items.findIndex(function (x) { return (r.bc && x.bc === r.bc) || (r.name && norm(x.name) === norm(r.name)); });
        if (i >= 0) d.items[i].actual = q;
        else {
          var hit = OPS.matchProduct(products, r);
          extra.push({ key: k, bc: r.bc || "", name: r.name || "", plan: 0, actual: q, id: hit.product ? hit.product.id : "", ip: OPS.fileIp(got.name, r.ip, r.name).ip, fresh: !hit.product });
        }
      });
      d.extra = extra;
      d.readLine = got.readLine;
      d.warns = got.warns || [];
      d.fileName = d.fileName || got.name;
      d.step = 3;
      d.err = "";
      saveIb(d); S.render();
    });
    var go = document.getElementById("ibGo");
    if (go) go.onclick = function () { confirmInbound(S, d, go); };
    var pos = document.getElementById("ibPos");
    if (pos) pos.onclick = function () { deductPos(S, d, pos); };
  }

  function wireFile(S, pasteId, mode, done) {
    var ta = document.getElementById(pasteId);
    var input = document.getElementById(pasteId + "File");
    var drop = document.querySelector('[data-drop="' + pasteId + '"]');
    async function take(file) {
      try { await done(await readBookFile(S, file, mode)); }
      catch (e) { await done({ parsed: { err: e.message || String(e) }, warns: [], readLine: "", name: file.name }); }
    }
    var go = document.getElementById(pasteId + "Go");
    if (go && ta) go.addEventListener("click", function () {
      if (!ta.value.trim()) { alert("붙인 내용이 없습니다."); return; }
      done(readTextTable(ta.value, mode));
    });
    if (input) input.addEventListener("change", function () { if (input.files[0]) take(input.files[0]); });
    if (drop) {
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) {
        e.preventDefault(); drop.classList.remove("over");
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) take(f);
      });
    }
  }

  async function confirmInbound(S, d, btn) {
    btn.disabled = true;
    var products = await S.products();
    var lines = d.items.map(function (x) { return Object.assign({}, x, { q: x.actual == null ? 0 : x.actual }); }).concat((d.extra || []).map(function (x) { return Object.assign({}, x, { q: x.actual || 0, plan: 0 }); }));
    var made = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!(l.q > 0)) continue;
      var bc = String(l.bc || "").replace(/\D/g, "");
      var hit = OPS.matchProduct(products, { bc: bc, name: l.name });
      var p = hit.product;
      if (p && bc && p.barcode && p.barcode !== bc && p.id !== bc && p.sku !== bc) p = null;
      if (!p && bc) {
        var draft = OPS.productDraft({ name: l.name, bc: bc, ip: l.ip }, d.fileName);
        draft.name = l.name;
        draft.sku = bc;
        draft.id = bc;
        try {
          await S.setDoc(S.doc(S.db, "products", draft.sku), draft);
          products.push(draft);
          made.push(draft);
          p = draft;
        } catch (e) {
          d.err = "새 상품 저장 실패: " + (e.message || "");
          saveIb(d); S.render(); return;
        }
      }
      l.productId = p ? p.id : "";
      l.skipped = !p && !bc;
    }
    if (made.some(function (p) { return p.ip; })) {
      try {
        var snap = await S.getDoc(S.doc(S.db, "config", "ipAlias"));
        var map = Object.assign({}, (snap.exists() && (snap.data().map || {})) || {});
        var changed = false;
        made.forEach(function (p) { if (p.ip && p.barcode && !map[p.barcode]) { map[p.barcode] = p.ip; changed = true; } });
        if (changed) await S.setDoc(S.doc(S.db, "config", "ipAlias"), { map: map }, { merge: true });
      } catch (e) { d.aliasNote = "상품은 만들었지만 IP 별칭 저장은 권한이 없어 넘어갔습니다. 상품명 앞부분은 상품에 남겨 두었습니다."; }
    }
    var ok = 0, skip = 0, fail = [];
    for (var j = 0; j < lines.length; j++) {
      var row = lines[j];
      if (!(row.q > 0) || !row.productId) continue;
      var qty = Math.round(row.q);
      if (!Number.isInteger(qty) || qty <= 0) { fail.push(row.name + ": 수량을 확인하세요"); continue; }
      try {
        await S.applyTx({ type: "IN", productId: row.productId, loc: d.loc, qty: qty, note: "입고 확인 " + (d.title || d.fileName || ""), txId: "ib_" + d.id + "_" + OPS.hashId(row.productId), bizDate: d.date || S.today() });
        ok++;
      } catch (e) {
        if (e && e.message === "이미 적용됨") skip++;
        else fail.push((row.name || row.bc) + ": " + (e.message || "실패"));
      }
    }
    d.done = true;
    d.result = ok + "종 반영 · 새 상품 " + made.length + "종" + (skip ? " · 이미 반영 " + skip + "종" : "") + (fail.length ? " · 실패 " + fail.length + "건" : "");
    if (fail.length) d.err = fail.slice(0, 5).join(" / ");
    d.madeIds = made.map(function (p) { return p.id; }).concat(lines.map(function (l) { return l.productId; }).filter(Boolean));
    await fillPending(S, d, products);
    saveIb(d);
    S.render();
  }
  async function fillPending(S, d, products) {
    var from = addDays(S.today(), -120);
    try {
      var days = await S.salesRange(from, S.today(), d.loc);
      products = (products || await S.products()).filter(function (p) { return d.madeIds.indexOf(p.id) >= 0; });
      var applied = {};
      var q = S.query(S.collection(S.db, "posImports"), S.where(S.docId(), ">=", d.loc + "_" + from), S.where(S.docId(), "<", d.loc + "_\uf8ff"));
      (await S.getDocs(q)).forEach(function (doc) { applied[doc.id] = (doc.data() && doc.data().qty) || 0; });
      d.pending = OPS.pendingSales(days.map(function (day) { return { date: day.date, items: day.items || [] }; }), products, applied, d.loc);
      if (!d.pending.length) d.posNote = "차감하지 않은 판매가 없습니다.";
    } catch (e) {
      d.pending = [];
      d.posNote = "판매 차감 대상을 확인하지 못했습니다. POS 매출 반영 화면에서 같은 파일을 다시 누르면 남은 수량만 차감됩니다.";
    }
  }
  async function deductPos(S, d, btn) {
    btn.disabled = true;
    var ok = 0, skip = 0, fail = [];
    for (var i = 0; i < (d.pending || []).length; i++) {
      var r = d.pending[i];
      try {
        await S.applyTx({ type: "OUT", productId: r.id, loc: d.loc, qty: r.todo, note: "POS 매출 " + r.date, bizDate: r.date, pos: { id: r.posId, date: r.date, total: r.qty } });
        ok++;
      } catch (e) {
        if (e && (e.code === "already" || e.message === "이미 반영됨")) skip++;
        else fail.push(r.name + ": " + (e.message || "실패"));
      }
    }
    d.posNote = "판매 차감 " + ok + "건" + (skip ? " · 이미 반영 " + skip + "건" : "") + (fail.length ? " · 실패 " + fail.length + "건" : "");
    d.pending = fail.length ? d.pending : [];
    if (fail.length) d.err = fail.slice(0, 5).join(" / ");
    saveIb(d);
    S.render();
  }

  function bindAudit(S) {
    document.querySelectorAll("[data-audstore]").forEach(function (b) { b.onclick = function () { audit.loc = b.getAttribute("data-audstore"); audit.preview = null; S.render(); }; });
    var only = document.getElementById("audOnly");
    if (only) only.onclick = function () { audit.only = !audit.only; S.render(); };
    var undo = document.getElementById("audUndo");
    if (undo) undo.onclick = function () { undoAudit(S); };
    var again = document.getElementById("audFile");
    if (again) again.onclick = function () { var input = document.getElementById("audPasteFile"); if (input) input.click(); };
    wireFile(S, "audPaste", "count", async function (got) {
      if (got.parsed.err) { audit.err = got.parsed.err; audit.preview = null; S.render(); return; }
      var products = await S.products();
      var map = await S.stockMap([audit.loc]);
      audit.preview = OPS.auditPreview(got.parsed, products, function (id) { return map[id + "_" + audit.loc] || 0; });
      if (audit.preview.err) { audit.err = audit.preview.err; audit.preview = null; }
      else audit.err = "";
      audit.readLine = got.readLine;
      audit.warns = got.warns || [];
      audit.guard = false;
      audit.fileName = got.name;
      S.render();
    });
    var go = document.getElementById("audGo");
    if (go) go.onclick = function () { openGuard(S); };
    var word = document.getElementById("audWord");
    var ok = document.getElementById("audOk");
    if (word && ok) {
      word.addEventListener("input", function () { ok.disabled = word.value !== "실사"; });
      ok.onclick = function () { if (word.value === "실사") applyAudit(S, ok); };
    }
  }
  function openGuard(S) {
    var p = audit.preview;
    if (!p) return;
    audit.drops = OPS.auditDrops(p);
    var ids = {}, bcs = {};
    p.matched.forEach(function (m) { ids[m.id] = 1; });
    (p.fresh || []).forEach(function (f) { if (f.bc) bcs[f.bc] = 1; });
    var d = loadIb();
    var n = OPS.inboundHits(d, ids, bcs);
    audit.inboundWarn = n ? "확정되지 않은 입고 예정에 같은 상품이 " + n + "종 있습니다. 입고 확인을 먼저 하세요." : "";
    audit.guard = true;
    S.render();
  }
  async function applyAudit(S, btn) {
    btn.disabled = true;
    var p = audit.preview;
    var products = await S.products();
    var before = {};
    var created = [];
    var run = "a" + Date.now().toString(36);
    p.matched.forEach(function (m) { before[m.id] = m.book; });
    for (var i = 0; i < (p.fresh || []).length; i++) {
      var f = p.fresh[i];
      var bc = String(f.bc || "").replace(/\D/g, "");
      if (!bc) continue;
      if (!products.some(function (x) { return x.id === bc || x.sku === bc || x.barcode === bc; })) {
        var draft = OPS.productDraft(f, audit.fileName);
        draft.name = f.name;
        draft.sku = bc;
        draft.id = bc;
        await S.setDoc(S.doc(S.db, "products", bc), draft);
        products.push(draft);
        created.push(bc);
        before[bc] = 0;
      }
    }
    var n = 0, fail = [];
    var jobs = p.matched.filter(function (m) { return m.qty !== m.book; }).map(function (m) { return { id: m.id, qty: m.qty, name: m.name }; }).concat((p.fresh || []).filter(function (f) { return f.bc && f.qty != null; }).map(function (f) { return { id: String(f.bc).replace(/\D/g, ""), qty: f.qty, name: f.name }; }));
    for (var j = 0; j < jobs.length; j++) {
      var job = jobs[j];
      var qty = Math.round(job.qty);
      if (!Number.isInteger(qty) || qty < 0 || !job.id) { fail.push(job.name + ": 수량을 확인하세요"); continue; }
      try {
        await S.applyTx({ type: "ADJ", productId: job.id, loc: audit.loc, qty: qty, note: "월말 실사", txId: "aud_" + run + "_" + OPS.hashId(job.id), bizDate: S.today() });
        n++;
      } catch (e) { fail.push(job.name + ": " + (e.message || "실패")); }
    }
    audit.undo = { run: run, loc: audit.loc, before: before, created: created };
    try { localStorage.setItem(UNDO, JSON.stringify(audit.undo)); } catch (e) {}
    audit.msg = "실사 차이 " + n + "종을 반영했습니다" + (created.length ? " · 새 상품 " + created.length + "종" : "") + (fail.length ? " · 실패 " + fail.length + "건" : "");
    audit.err = fail.slice(0, 5).join(" / ");
    audit.preview = null;
    audit.guard = false;
    S.render();
  }
  async function undoAudit(S) {
    var u = audit.undo;
    if (!u) return;
    var map = await S.stockMap([u.loc]);
    var n = 0;
    var ids = Object.keys(u.before || {});
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var prev = u.before[id];
      var now = map[id + "_" + u.loc] || 0;
      if (now === prev) continue;
      await S.applyTx({ type: "ADJ", productId: id, loc: u.loc, qty: prev, note: "실사 되돌림", txId: "audu_" + u.run + "_" + OPS.hashId(id), bizDate: S.today() });
      n++;
    }
    audit.msg = "직전 실사 수량을 되돌렸습니다 (" + n + "종).";
    audit.undo = null;
    try { localStorage.removeItem(UNDO); } catch (e) {}
    S.render();
  }

  function bindMove(S) {
    document.querySelectorAll("[data-mvfrom]").forEach(function (b) { b.onclick = function () { move.from = b.getAttribute("data-mvfrom"); if (move.to === move.from) move.to = ""; S.render(); }; });
    document.querySelectorAll("[data-mvto]").forEach(function (b) { b.onclick = function () { var id = b.getAttribute("data-mvto"); if (id !== move.from) { move.to = id; S.render(); } }; });
    document.querySelectorAll("[data-mvq]").forEach(function (input) {
      input.onchange = function () {
        var line = move.lines.find(function (l) { return l.id === input.getAttribute("data-mvq"); });
        if (line) line.qty = Math.max(1, Math.round(Number(input.value) || 0));
      };
    });
    document.querySelectorAll("[data-mvdel]").forEach(function (b) { b.onclick = function () { move.lines = move.lines.filter(function (l) { return l.id !== b.getAttribute("data-mvdel"); }); S.render(); }; });
    wireFile(S, "mvPaste", "move", async function (got) {
      if (got.parsed.err) { move.err = got.parsed.err; S.render(); return; }
      var products = await S.products();
      var map = await S.stockMap([move.from]);
      var unknown = 0, blank = 0;
      (got.parsed.items || []).forEach(function (r) {
        var qty = r.qty != null ? r.qty : r.plan;
        if (qty == null) { blank++; return; }
        var hit = OPS.matchProduct(products, r);
        if (!hit.product) { unknown++; return; }
        var ex = move.lines.find(function (l) { return l.id === hit.product.id; });
        if (ex) ex.qty += qty;
        else move.lines.push({ id: hit.product.id, name: hit.product.name, code: hit.product.barcode || hit.product.sku || "", qty: qty, book: map[hit.product.id + "_" + move.from] || 0 });
      });
      move.note = "상품 " + move.lines.length + "종 읽음" + (unknown ? " · 전산에 없는 상품 " + unknown : "") + (blank ? " · 빈 줄 " + blank + "개 제외" : "");
      move.err = "";
      move.src = got.name;
      S.render();
    });
    var go = document.getElementById("mvGo");
    if (go) go.onclick = async function () {
      go.disabled = true;
      var run = "m" + Date.now().toString(36);
      var ok = 0, fail = [];
      for (var i = 0; i < move.lines.length; i++) {
        var l = move.lines[i];
        var qty = Math.round(Number(l.qty) || 0);
        if (!Number.isInteger(qty) || qty <= 0) { fail.push(l.name + ": 수량을 확인하세요"); continue; }
        try {
          await S.applyTx({ type: "MOVE", productId: l.id, loc: move.from, to: move.to, qty: qty, note: "상품 이동" + (move.src ? " " + move.src : ""), txId: "mv_" + run + "_" + OPS.hashId(l.id), bizDate: S.today() });
          ok++;
        } catch (e) { fail.push(l.name + ": " + (e.message || "실패")); }
      }
      move.lines = [];
      move.note = "이동 " + ok + "종" + (fail.length ? " · 실패 " + fail.length + "건" : "");
      move.err = fail.slice(0, 5).join(" / ");
      S.render();
    };
  }
  function bindClose(S) {
    document.querySelectorAll("[data-cym]").forEach(function (b) { b.onclick = function () { location.hash = "#/close?m=" + b.getAttribute("data-cym"); }; });
    document.querySelectorAll("[data-cstep]").forEach(function (b) {
      b.onclick = function () {
        var cur = (location.hash.split("m=")[1] || S.today().slice(0, 7)).slice(0, 7);
        location.hash = "#/close?m=" + shiftYm(cur, Number(b.getAttribute("data-cstep")));
      };
    });
    var print = document.getElementById("closePrint");
    if (print) print.onclick = function () { window.print(); };
  }

  global.OPS_UI = { inboundHtml: inboundHtml, auditHtml: auditHtml, moveHtml: moveHtml, closeHtml: closeHtml, esc: esc, fmt: fmt };
  var prevBoot = global.SMGC_BOOT;
  global.SMGC_BOOT = function (S) {
    if (prevBoot) prevBoot(S);
    boot(S);
  };
})(typeof window !== "undefined" ? window : globalThis);
