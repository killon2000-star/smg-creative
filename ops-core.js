/* SMG 크리에이티브: 엑셀 탭 고르기, 입고·실사·이동 표 읽기, 일정 묶기, 마감 숫자.
   창고·하부장 분리는 다루지 않습니다. 화면 문구는 ops-update.js 에 있습니다. */
(function (global) {
  var COUNT_WORDS = ["실입고수량", "실제수량확인", "실제수량", "수량확인", "확인수량", "실제재고", "현장수량", "실재고", "실수량", "실입고", "실수령", "센수량", "실사"];
  var SCHED_SUB = /사전\s*예약|예약제|예약|특전|할인|후기|(?:^|\s)MD(?:\s|$)|오픈|이용/;
  var SCHED_STOP = { "콜라보": 1, "카페": 1, "팝업": 1, "스토어": 1, "팝업스토어": 1, "전시": 1, "기념": 1, "방송": 1, "애니메이션": 1, "주년": 1, "시즌": 1, "주말": 1, "평일": 1, "한정": 1, "당초": 1, "조기": 1, "종료": 1, "영업": 1, "the": 1, "final": 1, "season": 1, "pop": 1, "up": 1, "store": 1, "new": 1, "coming": 1, "soon": 1, "popup": 1, "light": 1, "shadow": 1, "cafe": 1, "box": 1, "smg": 1, "tv": 1 };
  var SCHED_TYPES = { popup: "팝업", cafe: "카페", exhibit: "전시" };
  var FILE_SKIP = { "복사본": 1, "최종": 1, "수정": 1, "파일": 1, "시트": 1, "엑셀": 1, "홀딩스": 1, "물류": 1, "일정": 1, "입고": 1, "실사": 1, "수량": 1, "예정": 1 };

  function normHead(s) { return String(s == null ? "" : s).replace(/[\s\n\r\t()（）\[\]{}:：·.\-_/]/g, "").toLowerCase(); }
  function normName(s) { return String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase(); }
  function cleanLabel(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
  function countWord(label) {
    var c = normHead(label);
    if (!c) return "";
    var best = "";
    for (var i = 0; i < COUNT_WORDS.length; i++) {
      var w = COUNT_WORDS[i];
      if (c.indexOf(normHead(w)) >= 0 && w.length > best.length) best = w;
    }
    return best;
  }
  function countNum(v) {
    var t = String(v == null ? "" : v).replace(/[₩,원\s]/g, "").replace(/(개|ea|pcs)$/i, "");
    if (t === "" || t === "-") return null;
    var n = Number(t);
    return isNaN(n) ? null : n;
  }
  function isDateCell(s) { return /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(s); }
  function isTimeCell(s) { return /^\d{1,2}:\d{2}(\s*[~\-～]\s*\d{1,2}:\d{2})?$/.test(s); }
  function isMemoCell(s) { return /^DP\s*수량/i.test(s) || /수량\s*[:：]\s*\d/.test(s); }
  function isBarcodeCell(s) { return /^880\d{9,12}$/.test(s) || /^\d{12,14}$/.test(s); }
  function isPlainNum(s) { return /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^-?\d+(\.\d+)?$/.test(s); }
  function isPrivateHead(label) { return /수령|담당|전화|연락|휴대폰|핸드폰|주소|address|phone|tel|mobile/.test(normHead(label)); }
  function isPhoneCell(s) { return /(?:^|\D)01[016789][-\s]?\d{3,4}[-\s]?\d{4}(?:\D|$)/.test(String(s || "")); }
  function peelQty(s) {
    var m = String(s == null ? "" : s).trim().match(/^(.*[가-힣A-Za-z_])\s+(\d{1,3}(?:,\d{3})+|\d{1,6})$/);
    return m ? { text: m[1].trim(), n: countNum(m[2]) } : { text: String(s == null ? "" : s).trim(), n: null };
  }
  function rowBlank(r) { return !(r || []).some(function (c) { return String(c == null ? "" : c).trim(); }); }
  function isLabelCell(s) {
    var n = normHead(s);
    if (!n || n.length > 30) return false;
    if (countWord(s)) return true;
    return /^(no|번호|순번|구분)$/.test(n) || /바코드|상품명|품명|품번|옵션|입고|거래처|상품종류|비고|예정일|수량|재고|코드|품목|상품/.test(n);
  }
  function headerish(row) {
    var cells = (row || []).map(function (c) { return String(c == null ? "" : c).trim(); }).filter(Boolean);
    if (cells.length < 2 || cells.some(function (c) { return isBarcodeCell(c) || isDateCell(c); })) return false;
    var hits = 0;
    cells.forEach(function (c) {
      var n = normHead(c);
      if (countWord(c) || /바코드|상품명|품명|품번|입고|거래처|상품종류|비고|예정일|수령|수량|재고|코드/.test(n) || n === "no") hits++;
    });
    return hits >= 2;
  }
  function mapLabels(labels) {
    var bc = -1, name = -1, nameKo = -1;
    labels.forEach(function (h, i) {
      var n = normHead(h);
      if (!n) return;
      if (/바코드|barcode|ean|jan|upc|gtin/.test(n) && !/상품명|품명/.test(n)) { if (bc < 0) bc = i; }
      if (/토스/.test(n)) return;
      if (/한글/.test(n) && /상품명|품명/.test(n)) nameKo = i;
      else if (/상품명|품명|제품명|품목명/.test(n)) { if (name < 0) name = i; }
      else if (/품번|상품코드|품목코드/.test(n) && name < 0 && nameKo < 0) name = i;
    });
    if (nameKo >= 0) name = nameKo;
    return { qty: -1, prod: bc >= 0 ? bc : name, bc: bc, name: name, countCol: false, planCol: -1, actCol: -1 };
  }
  function planRank(h) {
    var n = normHead(h);
    if (!n || /실입고|판매수량|dp수량|판매가|구매제한|재고/.test(n)) return 0;
    if (n === "입고수량") return 70;
    if (n === "예정수량") return 60;
    if (n === "발주수량") return 50;
    if (n === "입고수량합계") return 15;
    return 0;
  }
  function actualRank(h) {
    var n = normHead(h);
    if (!n || /판매수량|dp수량|판매가|구매제한/.test(n)) return 0;
    if (n.indexOf("실입고수량") >= 0) return 100;
    if (n.indexOf("실입고") >= 0) return 90;
    if (n.indexOf("실제수량확인") >= 0) return 85;
    if (/실재고|실제수량|실사/.test(n)) return 80;
    return 0;
  }
  function genericRank(h) {
    var n = normHead(h);
    if (!n || planRank(h) || actualRank(h) || /판매수량|dp수량|판매가|구매제한|재고/.test(n)) return 0;
    if (n === "수량" || n === "개수" || n === "qty") return 40;
    return 0;
  }
  function catalogHead(labels) { return labels.some(function (h) { return /판매가|구매제한|이미지|옵션명|토스상품명|pos등록/.test(normHead(h)); }); }
  function rowHeaderScore(row) {
    var cells = (row || []).map(function (c) { return String(c == null ? "" : c).trim(); }).filter(Boolean);
    if (cells.length < 2 || cells.some(isBarcodeCell)) return 0;
    var labels = cells.filter(isLabelCell).length;
    var nums = cells.filter(function (c) { return isPlainNum(c); }).length;
    if (labels < 2 || (nums > 1 && nums >= labels)) return 0;
    return labels * 10 - nums * 3;
  }
  function headerTail(row) {
    var cells = (row || []).map(function (c) { return String(c == null ? "" : c).trim(); }).filter(Boolean);
    if (!cells.length || cells.some(isBarcodeCell) || cells.some(function (c) { return isPlainNum(c) && !isLabelCell(c); })) return false;
    return cells.every(isLabelCell);
  }
  function bodyNums(rows, start, col) {
    var n = 0;
    for (var i = start; i < Math.min(rows.length, start + 80); i++) {
      var v = String((rows[i] || [])[col] == null ? "" : (rows[i] || [])[col]).trim();
      if (!v || v === "-" || isBarcodeCell(v) || isDateCell(v) || isTimeCell(v)) continue;
      if (countNum(v) != null) n++;
    }
    return n;
  }
  function refineQtyMap(labels, rows, start, map, mode) {
    var plan = -1, planR = 0, act = -1, actR = 0, gen = -1, genR = 0;
    labels.forEach(function (h, i) {
      if (!bodyNums(rows, start, i)) return;
      var pr = planRank(h), ar = actualRank(h), gr = genericRank(h);
      if (ar > actR) { actR = ar; act = i; }
      if (pr > planR) { planR = pr; plan = i; }
      if (gr > genR) { genR = gr; gen = i; }
    });
    mode = mode || "plan";
    if (plan < 0 && act < 0 && gen >= 0) { if (mode === "plan") plan = gen; else act = gen; }
    else if (mode === "plan" && act >= 0 && plan < 0) { plan = act; act = -1; }
    else if ((mode === "actual" || mode === "count" || mode === "move") && act < 0 && plan >= 0 && gen < 0) { act = plan; plan = -1; }
    var qty = act >= 0 ? act : (mode === "plan" ? plan : -1);
    return { prod: map.prod, bc: map.bc, name: map.name, planCol: plan, actCol: act, qty: qty, countCol: act >= 0, planLabel: plan >= 0 ? cleanLabel(labels[plan]) : "", qtyLabel: qty >= 0 ? cleanLabel(labels[qty]) : "" };
  }
  function findHeader(rows) {
    var best = -1, bestS = 0, i;
    for (i = 0; i < Math.min(rows.length, 80); i++) {
      var s = rowHeaderScore(rows[i]);
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best < 0) {
      for (i = 0; i < rows.length; i++) {
        if (!headerish(rows[i])) continue;
        var labels0 = rows[i].map(cleanLabel);
        var map0 = refineQtyMap(labels0, rows, i + 1, mapLabels(labels0), "plan");
        if (map0.qty >= 0 || map0.prod >= 0 || map0.bc >= 0) return { start: i, end: i, labels: labels0, map: map0 };
      }
      return null;
    }
    var start = best, end = best;
    while (start > 0 && best - start < 4 && (rowHeaderScore(rows[start - 1]) > 0 || headerTail(rows[start - 1]))) start--;
    while (end + 1 < rows.length && end - start < 5 && (rowHeaderScore(rows[end + 1]) > 0 || headerTail(rows[end + 1]))) end++;
    var width = Math.max.apply(null, [0].concat(rows.slice(start, end + 1).map(function (r) { return (r || []).length; })));
    var labels = [];
    for (var k = 0; k < width; k++) {
      var parts = [];
      for (var r = start; r <= end; r++) {
        var v = cleanLabel((rows[r] || [])[k] || "");
        if (v && parts.indexOf(v) < 0) parts.push(v);
      }
      labels.push(parts.join(" "));
    }
    return { start: start, end: end, labels: labels, map: refineQtyMap(labels, rows, end + 1, mapLabels(labels), "plan") };
  }
  function guessHeaderless(dataRows) {
    var cols = Math.max.apply(null, [0].concat(dataRows.map(function (r) { return r.length; })));
    var stats = [];
    for (var c = 0; c < cols; c++) {
      var n = 0, bc = 0, date = 0, time = 0, memo = 0, num = 0, sku = 0, text = 0;
      dataRows.forEach(function (r) {
        var v = String(r[c] == null ? "" : r[c]).trim();
        if (!v || v === "-") return;
        n++;
        if (isBarcodeCell(v)) bc++;
        else if (isDateCell(v)) date++;
        else if (isTimeCell(v)) time++;
        else if (isMemoCell(v)) memo++;
        else if (isPlainNum(v)) num++;
        else if (/_[0-9]{2}_|[A-Za-z]{2,}_/.test(v)) sku++;
        else if (/[가-힣A-Za-z]{2,}/.test(v)) text++;
      });
      stats.push({ c: c, n: n, bc: bc, date: date, time: time, memo: memo, num: num, sku: sku, text: text });
    }
    function ok(s) { return s.n && s.date / s.n < 0.5 && s.time / s.n < 0.5 && s.memo / s.n < 0.5; }
    var bcCol = stats.filter(function (s) { return s.bc >= 1; }).sort(function (a, b) { return b.bc - a.bc; })[0];
    var nameCol = stats.filter(function (s) { return ok(s) && (!bcCol || s.c !== bcCol.c) && s.sku + s.text >= 1 && s.num / Math.max(1, s.n) < 0.5; }).sort(function (a, b) { return (b.sku * 3 + b.text) - (a.sku * 3 + a.text); })[0];
    var anchor = Math.max(bcCol ? bcCol.c : -1, nameCol ? nameCol.c : -1);
    var qty = stats.filter(function (s) { return s.c > anchor && ok(s) && s.bc === 0 && s.num / Math.max(1, s.n) >= 0.6; }).sort(function (a, b) { return a.c - b.c; })[0];
    return { prod: bcCol ? bcCol.c : (nameCol ? nameCol.c : -1), qty: qty ? qty.c : -1, bc: bcCol ? bcCol.c : -1, name: nameCol ? nameCol.c : -1, countCol: false, planCol: -1, actCol: -1, planLabel: "", qtyLabel: "" };
  }
  function sheetScore(name, rows, mode) {
    var peek = (rows || []).slice(0, 80);
    var header = findHeader(peek);
    if (!header) return { score: 0 };
    var map = refineQtyMap(header.labels, peek, header.end + 1, header.map, mode || "plan");
    var actN = map.actCol >= 0 ? bodyNums(peek, header.end + 1, map.actCol) : 0;
    var planN = map.planCol >= 0 ? bodyNums(peek, header.end + 1, map.planCol) : 0;
    var rawAct = header.labels.reduce(function (b, h, i) { return Math.max(b, actualRank(h) && bodyNums(peek, header.end + 1, i) ? actualRank(h) : 0); }, 0);
    var rawPlan = header.labels.reduce(function (b, h, i) { return Math.max(b, planRank(h) && bodyNums(peek, header.end + 1, i) ? planRank(h) : 0); }, 0);
    if ((header.map.bc < 0 && header.map.name < 0) || (actN + planN === 0 && rawAct + rawPlan === 0)) return { score: 0 };
    var score = rawAct * 100 + Math.min(actN, 60) + rawPlan * 10 + Math.min(planN, 40);
    if (rawAct && rawPlan) score += 500;
    var tab = normHead(name);
    if (/물류|입고/.test(tab)) score += 80;
    if (mode === "count" && /실사|재고/.test(tab)) score += 40;
    if (catalogHead(header.labels)) score -= 2000;
    var sale = header.labels.findIndex(function (h) { return normHead(h).indexOf("판매수량") >= 0; });
    var realAct = header.labels.findIndex(function (h) { return actualRank(h) >= 90; });
    if (sale >= 0 && bodyNums(peek, header.end + 1, sale) > 0 && (realAct < 0 || bodyNums(peek, header.end + 1, realAct) === 0)) score -= 1000;
    if (/출고정보|매대|노션/.test(tab) && !rawAct && !rawPlan) score -= 400;
    return { score: score, planLabel: map.planLabel, qtyLabel: map.qtyLabel };
  }
  function chooseSheet(list, mode) {
    var ranked = (list || []).map(function (s) {
      return { name: s.name, rows: s.rows, sc: sheetScore(s.name, s.rows, mode) };
    }).filter(function (s) { return s.sc.score > 0; }).sort(function (a, b) { return b.sc.score - a.sc.score; });
    if (!ranked.length) return null;
    var warns = [];
    if (ranked[1] && ranked[1].sc.score >= ranked[0].sc.score * 0.85) warns.push("다른 탭 '" + ranked[1].name + "'도 비슷합니다.");
    return { name: ranked[0].name, rows: ranked[0].rows, warns: warns, sc: ranked[0].sc };
  }
  function readLineText(tab, planLabel, qtyLabel) {
    var where = tab ? "'" + tab + "' 탭을 읽었어요" : "표를 읽었어요";
    var bits = [];
    if (planLabel) bits.push("예정 = " + planLabel);
    if (qtyLabel) bits.push("수량 = " + qtyLabel);
    return where + (bits.length ? " · " + bits.join(" · ") : "");
  }
  function clipBigo(rows) {
    var h = findHeader(rows || []);
    if (!h) return rows || [];
    var b = h.labels.findIndex(function (x) { var n = normHead(x); return n === "비고" || n.indexOf("비고") === 0; });
    if (b < 0) return rows || [];
    return (rows || []).map(function (r) { return (r || []).slice(0, b); });
  }
  function foldItems(items) {
    var groups = new Map();
    items.forEach(function (r, idx) {
      var key = r.bc ? "b:" + r.bc : "n:" + normHead(r.name || "#" + idx);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    var out = [];
    groups.forEach(function (rows, key) {
      var opts = [];
      rows.forEach(function (r) { if (r.opt && opts.indexOf(r.opt) < 0) opts.push(r.opt); });
      if (key.indexOf("b:") === 0 && opts.length > 1) { out.push(Object.assign({}, rows.find(function (r) { return r.name && !r.opt; }) || rows[0], { lines: 1 })); return; }
      if (rows.length === 1) { out.push(Object.assign({}, rows[0], { lines: 1 })); return; }
      var base = rows.find(function (r) { return r.name; }) || rows[0];
      var plans = rows.map(function (r) { return r.plan; }).filter(function (v) { return v != null; });
      var qtys = rows.map(function (r) { return r.qty; }).filter(function (v) { return v != null; });
      out.push(Object.assign({}, base, {
        plan: plans.length ? plans.reduce(function (a, b) { return a + b; }, 0) : null,
        qty: qtys.length ? qtys.reduce(function (a, b) { return a + b; }, 0) : null,
        blank: !qtys.length,
        lines: rows.length
      }));
    });
    return out;
  }
  function qtyWarns(items) {
    var vals = [];
    items.forEach(function (r) { if (r.plan > 0) vals.push(r.plan); if (r.qty > 0) vals.push(r.qty); });
    if (vals.length < 4) return [];
    var s = vals.slice().sort(function (a, b) { return b - a; });
    var warns = [];
    if (s[0] >= 1000 && s.length > 1 && s[0] >= s[1] * 2.5) warns.push("다른 줄보다 수량이 훨씬 큰 상품이 있습니다.");
    if (items.some(function (r) { return r.plan > 0 && r.qty > 0 && Math.abs(r.qty - r.plan) >= 30 && Math.abs(r.qty - r.plan) / r.plan >= 0.5; })) warns.push("예정과 실입고가 크게 다른 상품이 있습니다.");
    return warns;
  }
  function shelfOnly(labels) {
    var wh = labels.findIndex(function (h) { var n = normHead(h); return /창고/.test(n) && !/하부장|물류|보관/.test(n); });
    var shelf = labels.findIndex(function (h) { return /하부장/.test(normHead(h)); });
    return wh >= 0 && shelf >= 0;
  }
  function countParseRows(rows, pick) {
    var mode = (pick && pick.mode) || "plan";
    var list = clipBigo(rows || []);
    var header = findHeader(list);
    if (header && shelfOnly(header.labels) && mode === "count" && actualRank && header.labels.every(function (h) { return actualRank(h) < 80 && planRank(h) === 0; })) {
      var hasReal = header.labels.some(function (h) { return actualRank(h) >= 80 || genericRank(h) > 0 || planRank(h) > 0; });
      if (!hasReal) return { err: "창고와 하부장 칸만 있습니다. 이 앱은 그 둘을 나누지 않습니다. 실사 수량 칸이 있는 표를 올려 주세요." };
    }
    var data = [];
    list.forEach(function (r, i) {
      if (rowBlank(r)) return;
      if (header && i >= header.start && i <= header.end) return;
      if (header && i < header.start) return;
      if (headerish(r)) return;
      data.push(r);
    });
    var body = data.length ? data : list.filter(function (r) { return !rowBlank(r) && !headerish(r); });
    if (!body.length) return { err: "표에서 데이터 줄을 찾지 못했습니다." };
    var map = header ? refineQtyMap(header.labels, list, header.end + 1, header.map, mode) : guessHeaderless(body);
    var labels = header ? header.labels : [];
    if (pick && pick.prod != null) {
      var sample = "";
      body.some(function (r) { sample = String(r[pick.prod] == null ? "" : r[pick.prod]).trim(); return !!sample; });
      map = Object.assign({}, map, { prod: pick.prod, bc: isBarcodeCell(sample) ? pick.prod : map.bc, name: isBarcodeCell(sample) ? map.name : pick.prod });
    }
    if (pick && pick.qty != null) map = Object.assign({}, map, { qty: pick.qty, countCol: true });
    if (pick && pick.plan != null) map = Object.assign({}, map, { planCol: pick.plan });
    if (map.prod < 0 && map.bc < 0 && map.name < 0) return { err: "상품 칸(바코드·상품명)을 찾지 못했습니다." };
    if (header && shelfOnly(labels) && map.qty < 0) return { err: "창고와 하부장 칸만 있습니다. 이 앱은 그 둘을 나누지 않습니다. 실사 수량 칸이 있는 표를 올려 주세요." };
    var width = Math.max.apply(null, [labels.length].concat(body.slice(0, 40).map(function (r) { return r.length; })));
    var bigo = labels.findIndex(function (h) { return normHead(h) === "비고" || normHead(h).indexOf("비고") === 0; });
    function vals(c) { return body.map(function (r) { return String(r[c] == null ? "" : r[c]).trim(); }).filter(Boolean); }
    var cols = [];
    for (var c = 0; c < width; c++) {
      if (bigo >= 0 && c > bigo) continue;
      var label = cleanLabel(labels[c] || "");
      var vs = vals(c);
      if (isPrivateHead(label) || (vs.length && (vs.filter(isPhoneCell).length / vs.length >= 0.3 || vs.filter(function (v) { return /주소\s*[:：]/.test(v); }).length / vs.length >= 0.3))) continue;
      var n = normHead(label);
      var numeric = vs.length && vs.filter(isPlainNum).length / vs.length >= 0.6;
      var role = "";
      if (n && /바코드|barcode|ean|jan|upc|gtin/.test(n) && !/상품명|품명/.test(n)) role = "prod";
      else if (n && /상품명|품명|제품명|품목명|품번|상품코드|품목코드/.test(n)) role = "prod";
      else if (n && !/^(no|번호|순번)$/.test(n) && (countWord(label) || /수량|재고|현재고|개수|qty/.test(n)) && (numeric || !!countWord(label))) role = "qty";
      else if (!n && !header && numeric && vs.every(function (v) { return !isPhoneCell(v) && !isDateCell(v) && !isTimeCell(v); })) role = "qty";
      else if (!n && !header && vs.filter(isBarcodeCell).length >= 1) role = "prod";
      else if (!n && !header && vs.filter(function (v) { return /[가-힣A-Za-z]{2,}/.test(v) && !isMemoCell(v) && !isTimeCell(v) && !isDateCell(v); }).length >= 1 && !numeric) role = "prod";
      if (role) cols.push({ i: c, role: role, label: label || ("칸 " + (c + 1)) });
    }
    function cell(r, i) { return i >= 0 ? String(r[i] == null ? "" : r[i]).trim() : ""; }
    var vendCol = labels.findIndex(function (h) { return /거래처/.test(normHead(h)) && !/수령/.test(normHead(h)); });
    var planCol = map.planCol >= 0 ? map.planCol : -1;
    var ipCol = labels.findIndex(function (h) { return normHead(h) === "ip"; });
    var optCol = labels.findIndex(function (h) { return /옵션/.test(normHead(h)) && !/상품명|품명/.test(normHead(h)); });
    var items = [];
    body.forEach(function (r) {
      var filled = (r || []).map(function (c) { return String(c == null ? "" : c).trim(); }).filter(Boolean);
      if (filled.length && !filled.some(isBarcodeCell) && filled.every(isLabelCell)) return;
      var stop = bigo >= 0 ? bigo : (r || []).length;
      var bc = cell(r, map.bc).replace(/^'+/, "");
      if (!isBarcodeCell(bc)) {
        bc = "";
        for (var c2 = 0; c2 < stop; c2++) {
          var t = String((r || [])[c2] == null ? "" : (r || [])[c2]).trim();
          if (isBarcodeCell(t)) { bc = t; break; }
        }
      }
      var name = cell(r, map.name >= 0 ? map.name : (map.bc !== map.prod ? map.prod : -1));
      if (map.name < 0 && map.prod >= 0 && map.prod !== map.bc && !isBarcodeCell(cell(r, map.prod))) name = cell(r, map.prod);
      var opt = cell(r, optCol);
      if (opt && !isLabelCell(opt) && name && name.indexOf(opt) < 0) name = (name + " " + opt).trim();
      var peeled = peelQty(name);
      name = peeled.text;
      if (/^(합계|총계|소계|total)$/i.test(name)) return;
      if (!bc && isLabelCell(name)) return;
      var qty = null, blank = false;
      if (map.qty >= 0) {
        var q = cell(r, map.qty);
        if (!q || isLabelCell(q)) blank = true;
        else qty = countNum(q);
      }
      if (blank && map.countCol) qty = null;
      else if ((qty == null || blank) && !map.countCol && peeled.n != null) { qty = peeled.n; blank = false; }
      if (!bc && !name && (blank || qty == null)) return;
      if (!bc && !name && !/[가-힣A-Za-z]/.test((r || []).join(" "))) return;
      var planRaw = cell(r, planCol);
      var plan = planRaw === "" || isLabelCell(planRaw) ? null : countNum(planRaw);
      items.push({
        name: name,
        bc: bc,
        sku: /_|[A-Za-z]{2,}\d/.test(name) ? name : "",
        qty: blank ? null : qty,
        plan: plan,
        blank: blank,
        countCol: !!map.countCol,
        vendor: cell(r, vendCol),
        ip: cell(r, ipCol),
        opt: opt && !isLabelCell(opt) ? opt : ""
      });
    });
    var folded = foldItems(items);
    var prodLabel = cleanLabel(labels[map.bc >= 0 ? map.bc : map.prod] || "") || (map.bc >= 0 ? "바코드" : "상품");
    var qtyLabel = map.qtyLabel || cleanLabel(labels[map.qty] || "") || "";
    var planLabel = map.planLabel || (planCol >= 0 ? cleanLabel(labels[planCol]) : "");
    return { items: folded, cols: cols, prod: map.prod, qty: map.qty, prodLabel: prodLabel, qtyLabel: qtyLabel, planLabel: planLabel, countCol: !!map.countCol, warns: qtyWarns(folded) };
  }
  function parsePasteTable(text) {
    var s = String(text || "").replace(/^\uFEFF/, "");
    var sep = s.indexOf("\t") >= 0 ? "\t" : ",";
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"' && cur === "") q = true;
      else if (c === sep) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c !== "\r") cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }
  function guessIpCat(name) {
    var m = String(name || "").trim().match(/^([A-Za-z]+_?\d+)[_\s-]+(.+)$/);
    if (!m) return { ip: "", cat: "" };
    return { ip: m[1], cat: (m[2].split(/[_\s]/)[0] || "") };
  }
  function fileIp(fileName, cell, name) {
    var blob = [fileName, cell, name].filter(Boolean).join(" ");
    if (/진격의 거인|AOT_26|AOT26/i.test(blob)) return { ip: "진격의 거인", raw: String(cell || "").trim() };
    var written = String(cell || "").trim();
    if (written) return { ip: written, raw: written };
    var g = guessIpCat(name);
    if (g.ip) return { ip: g.ip, raw: "" };
    var base = String(fileName || "").replace(/\.(xlsx|xls|csv|xlsm)$/i, "");
    var tok = base.split(/[\s_\-()[\]\.]+/).filter(function (t) {
      return /[가-힣A-Za-z]{2,}/.test(t) && !FILE_SKIP[t] && !/^\d+$/.test(t);
    })[0];
    return { ip: tok || "", raw: "" };
  }
  function productDraft(row, fileName) {
    var name = String(row.name || "");
    var bc = String(row.bc || "").replace(/\D/g, "");
    var ip = fileIp(fileName, row.ip, name);
    var id = bc || "";
    return { id: id, sku: id, barcode: bc, name: name, ip: ip.ip, category: ip.ip || "", price: 0, safetyStock: 0 };
  }
  function matchProduct(products, row) {
    var bc = String(row.bc || "").trim();
    var list = products || [];
    if (bc) {
      var hits = list.filter(function (p) { return p.barcode === bc || p.sku === bc || p.id === bc; });
      if (hits.length === 1) return { product: hits[0], multi: false };
      if (hits.length > 1) return { product: null, multi: true };
    }
    var name = normName(row.name);
    if (name) {
      var byName = list.filter(function (p) { return normName(p.name) === name; });
      if (byName.length === 1) return { product: byName[0], multi: false };
      if (byName.length > 1) return { product: null, multi: true };
    }
    return { product: null, multi: false };
  }
  function auditPreview(parsed, products, stockOf) {
    if (!parsed || parsed.err) return { err: (parsed && parsed.err) || "표를 읽지 못했습니다." };
    var matched = [], freshMap = new Map(), missing = [];
    (parsed.items || []).forEach(function (r) {
      var noQty = r.blank || r.qty == null;
      if (!r.bc && noQty) { missing.push(Object.assign({}, r, { why: "바코드·실사 수량 없음" })); return; }
      if (noQty) { missing.push(Object.assign({}, r, { why: "실사 수량 없음" })); return; }
      var hit = matchProduct(products, r);
      if (hit.multi) { missing.push(Object.assign({}, r, { why: "같은 이름 상품이 여러 개입니다" })); return; }
      if (!hit.product) {
        var key = r.bc || normName(r.name);
        var prev = freshMap.get(key);
        if (prev) { prev.qty += Math.max(0, r.qty || 0); prev.lines++; }
        else freshMap.set(key, { key: key, bc: r.bc || "", name: r.name, qty: r.qty, ip: r.ip || "", vendor: r.vendor || "", lines: r.lines || 1 });
        return;
      }
      var book = stockOf(hit.product.id);
      var found = matched.find(function (m) { return m.id === hit.product.id; });
      if (found) { found.qty += Math.max(0, r.qty); found.lines++; found.diff = found.qty - found.book; }
      else matched.push({ id: hit.product.id, name: hit.product.name, code: hit.product.barcode || hit.product.sku || "", qty: Math.max(0, r.qty), book: book, diff: Math.max(0, r.qty) - book, lines: r.lines || 1 });
    });
    var seen = {};
    matched.forEach(function (m) { seen[m.id] = 1; });
    var absent = (products || []).filter(function (p) { return stockOf(p.id) !== 0 && !seen[p.id]; }).length;
    return { matched: matched, fresh: Array.from(freshMap.values()), missing: missing, absent: absent, blankN: (parsed.items || []).filter(function (r) { return r.blank || r.qty == null; }).length, qtyLabel: parsed.qtyLabel || "", planLabel: parsed.planLabel || "", warns: parsed.warns || [] };
  }
  function auditDrops(preview) {
    return (preview.matched || []).filter(function (m) { return m.book > 0 && (m.qty === 0 || m.qty <= m.book * 0.7); });
  }
  function inboundHits(draft, ids, barcodes) {
    if (!draft || draft.done) return 0;
    var n = 0;
    (draft.items || []).concat(draft.extra || []).forEach(function (x) {
      if ((x.id && ids[x.id]) || (x.bc && barcodes[x.bc])) n++;
    });
    return n;
  }
  function pendingSales(days, products, applied, loc) {
    var out = [];
    var index = {};
    (products || []).forEach(function (p) {
      if (p.barcode) index["b:" + p.barcode] = p;
      if (p.sku) index["s:" + p.sku] = p;
      if (p.id) index["s:" + p.id] = p;
      if (p.name) index["n:" + normName(p.name)] = index["n:" + normName(p.name)] || p;
    });
    (days || []).forEach(function (day) {
      (day.items || []).forEach(function (it) {
        var p = (it.k && (index["b:" + it.k] || index["s:" + it.k])) || index["n:" + normName(it.n)];
        if (!p) return;
        var sold = Math.round(Number(it.q) || 0);
        if (!(sold > 0)) return;
        var posId = String(loc || "") + "_" + day.date + "_" + p.id;
        posId = posId.replace(/\//g, "_");
        var done = Number((applied || {})[posId] || 0);
        var todo = sold - done;
        if (!(todo > 0)) return;
        var prev = out.find(function (r) { return r.posId === posId; });
        if (prev) { prev.qty += sold; prev.todo = prev.qty - prev.done; }
        else out.push({ date: day.date, id: p.id, name: p.name, qty: sold, done: done, todo: todo, posId: posId });
      });
    });
    return out;
  }
  function hashId(s) {
    var h = 2166136261;
    var t = String(s);
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function schedVenueKey(v) {
    var s = String(v || "");
    if (/수원/.test(s)) return "수원";
    if (/리밋션|LIMITION/i.test(s)) return "홍대 리밋션";
    if (/뮤지엄|MUSEUM/i.test(s)) return "홍대 뮤지엄";
    if (/오마케/.test(s)) return "오마케";
    if (/신촌/.test(s)) return "신촌";
    if (/BOX|홍대카페|홍대 카페/.test(s)) return "홍대 카페";
    var t = s.replace(/\([^)]*\)/g, "").trim();
    return t || "기타";
  }
  function schedTypeOf(venue, title, section) {
    var t = venue + " " + title + " " + section;
    if (/전시|뮤지엄/.test(t)) return "exhibit";
    if (/카페|BOX|오마케/.test(t)) return "cafe";
    return "popup";
  }
  function schedTokens(title) {
    var raw = String(title || "").replace(/\([^)]*\)/g, " ").replace(/사전\s*예약/g, " ");
    var parts = raw.split(/[^\uac00-\ud7a3A-Za-z0-9]+/).filter(Boolean);
    var out = [];
    parts.forEach(function (p) {
      var t = p.toLowerCase();
      if (t.length < 2 || SCHED_STOP[t] || /^\d+$/.test(t)) return;
      out.push(t);
    });
    return out;
  }
  function schedOverlap(a, b) { return !!(a.start && a.end && b.start && b.end && a.start <= b.end && b.start <= a.end); }
  function schedCovers(e, day) { return !!(e && e.start && e.end && e.start <= day && e.end >= day); }
  function schedGroups(events) {
    var items = (events || []).filter(function (e) { return e && !e.undated && e.start && e.end; });
    function isSub(e) { return SCHED_SUB.test(e.title || ""); }
    var groups = items.filter(function (e) { return !isSub(e); }).map(function (main) { return { main: main, kids: [] }; });
    items.filter(isSub).forEach(function (sub) {
      var tok = {};
      schedTokens(sub.title).forEach(function (t) { tok[t] = 1; });
      var best = null, score = 0;
      groups.forEach(function (g) {
        if (g.main.venueKey !== sub.venueKey || !schedOverlap(g.main, sub)) return;
        var shared = schedTokens(g.main.title).filter(function (t) { return tok[t] && t.length >= 3; });
        var s = shared.reduce(function (n, t) { return n + t.length; }, 0);
        if (shared.length && s > score) { score = s; best = g; }
      });
      if (best) best.kids.push(sub);
      else groups.push({ main: sub, kids: [] });
    });
    groups.forEach(function (g) { g.kids.sort(function (a, b) { return (a.start || "").localeCompare(b.start || "") || a.title.localeCompare(b.title, "ko"); }); });
    return groups;
  }
  function monthEnd(ym) {
    var p = ym.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1], 0));
    return ym + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function schedParseYmd(tok, baseYear) {
    var s = String(tok || "");
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { d: m[1] + "-" + m[2] + "-" + m[3] };
    m = s.match(/(\d{4})-(\d{2})(?!\d)/);
    if (m) return { d: m[1] + "-" + m[2] + "-01", partial: "month" };
    m = s.match(/(?:^|[^\d])(\d{2})-(\d{2})(?!\d)/);
    if (m && baseYear) return { d: baseYear + "-" + m[1] + "-" + m[2], rel: true };
    return null;
  }
  function parseSchedText(text) {
    var lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    var section = "", source = "x", rows = [], skipped = [];
    lines.forEach(function (raw, idx) {
      var line = raw.trim();
      if (!line || line.indexOf("<!--") === 0) return;
      if (line.charAt(0) === "#") {
        section = line.replace(/^#+\s*/, "");
        var level = (line.match(/^#+/) || ["#"])[0].length;
        if (level <= 2) {
          if (/^2[\.\s]|내부 엑셀|내부 예정/.test(section)) source = "plan";
          else if (/^1[\.\s]|공식\s*X|공식/.test(section)) source = "x";
        }
        return;
      }
      if (line.charAt(0) !== "-") return;
      var body = line.replace(/^-\s*/, "");
      var bits = body.split("|").map(function (s) { return s.trim(); });
      if (bits.length < 3) { skipped.push({ n: idx + 1, line: line, why: "날짜 | 장소 | 행사 이름 으로 나누지 않았습니다" }); return; }
      var datePart = bits[0], venue = bits[1] || "", title = bits[2] || "";
      var rest = bits.slice(3).filter(Boolean);
      var link = "";
      if (rest.length && /^https?:\/\//i.test(rest[rest.length - 1])) link = rest.pop();
      var note = rest.filter(function (s) { return s !== "내부 엑셀"; }).join(" · ");
      if (!title) { skipped.push({ n: idx + 1, line: line, why: "행사 이름이 없습니다" }); return; }
      var src = source;
      if (/\[내부\]|내부 엑셀|내부 예정/.test(body)) src = "plan";
      if (/\[공식\]/.test(body)) src = "x";
      var timeM = datePart.match(/(\d{1,2}:\d{2})/);
      var undated = /미정/.test((datePart.split("~")[0] || "")) && !/\d{4}-\d{2}/.test(datePart);
      var row = { on: true, source: src, venue: venue, venueKey: schedVenueKey(venue), type: schedTypeOf(venue, title, section), title: title, time: timeM ? timeM[1] : "", note: note, link: link, section: section };
      if (undated) {
        rows.push(Object.assign(row, { start: "", end: "", undated: true, open: true, warn: "날짜가 미정이라 날짜 미정에 둡니다" }));
        return;
      }
      var halves = datePart.split("~");
      var a = schedParseYmd(halves[0]);
      if (!a || !a.d) { skipped.push({ n: idx + 1, line: line, why: "시작 날짜를 읽지 못했습니다" }); return; }
      var start = a.d, end = a.d, warn = "", open = false;
      if (a.partial) warn = "시작 일이 없어 그달 1일로 봤습니다";
      if (halves[1] != null) {
        if (/미정|미기재|\?|없음/.test(halves[1]) && !/\d{4}-\d{2}-\d{2}/.test(halves[1])) {
          open = true;
          end = a.partial ? monthEnd(start.slice(0, 7)) : start;
          warn = (warn ? warn + " · " : "") + (a.partial ? "종료 일이 없어 그달 전체로 표시합니다" : "종료일이 없어 시작일만 표시합니다");
        } else {
          var b = schedParseYmd(halves[1], +start.slice(0, 4));
          if (!b) warn = (warn ? warn + " · " : "") + "종료 날짜를 읽지 못해 하루로 봤습니다";
          else {
            end = b.d;
            if (b.rel && end.slice(5, 7) < start.slice(5, 7)) end = (+start.slice(0, 4) + 1) + end.slice(4);
            if (b.partial) { end = monthEnd(end.slice(0, 7)); warn = (warn ? warn + " · " : "") + "종료 일이 없어 그달 말로 봤습니다"; }
          }
        }
      } else if (a.partial) end = monthEnd(start.slice(0, 7));
      if (end < start) { var swap = start; start = end; end = swap; }
      rows.push(Object.assign(row, { start: start, end: end, undated: false, open: open, warn: warn, hold: /대안|기타 메모/.test(section) }));
    });
    return { rows: rows, skipped: skipped };
  }
  function addNum(bag, key, n) {
    if (!Number.isFinite(n)) return;
    bag[key] = (bag[key] || 0) + n;
    bag[key + "N"] = (bag[key + "N"] || 0) + 1;
  }
  function closeModel(input) {
    var days = input.days || [];
    var locs = input.locs || [];
    var tx = input.tx || [];
    var stock = input.stock || [];
    var popups = input.popups || [];
    var salesKnown = input.salesKnown === true;
    var byDay = {};
    var byLoc = {};
    var amount = null, qty = null;
    if (salesKnown) {
      amount = 0; qty = 0;
      days.forEach(function (d) {
        var a = Number(d.amount), q = Number(d.qty);
        if (Number.isFinite(a)) { amount += a; byDay[d.date] = byDay[d.date] || { date: d.date, amount: 0, qty: 0 }; byDay[d.date].amount += a; }
        if (Number.isFinite(q)) { qty += q; byDay[d.date] = byDay[d.date] || { date: d.date, amount: 0, qty: 0 }; byDay[d.date].qty += q; }
        if (d.locationId) {
          byLoc[d.locationId] = byLoc[d.locationId] || { id: d.locationId, amount: 0, qty: 0, days: 0 };
          if (Number.isFinite(a)) byLoc[d.locationId].amount += a;
          if (Number.isFinite(q)) byLoc[d.locationId].qty += q;
          byLoc[d.locationId].days++;
        }
      });
    }
    var locName = {};
    locs.forEach(function (l) { locName[l.id] = l.name; });
    var locRows = Object.keys(byLoc).map(function (id) { return Object.assign({ name: locName[id] || id }, byLoc[id]); });
    var dayRows = Object.keys(byDay).sort().map(function (k) { return byDay[k]; });
    var inn = 0, out = 0, innN = 0, outN = 0, txKnown = Array.isArray(input.tx);
    tx.forEach(function (t) {
      var q = Number(t.qty);
      if (!Number.isFinite(q)) return;
      if (t.type === "IN") { inn += q; innN++; }
      if (t.type === "OUT") { out += q; outN++; }
    });
    var kinds = 0, units = 0, valued = 0, value = 0, noPrice = 0, zero = 0, neg = 0;
    stock.forEach(function (s) {
      var q = Number(s.qty);
      if (!Number.isFinite(q)) return;
      kinds++;
      units += q;
      if (q === 0) zero++;
      if (q < 0) neg++;
      var price = Number(s.price);
      if (q > 0 && Number.isFinite(price) && price > 0) { valued++; value += Math.round(price * q); }
      else if (q > 0) noPrice++;
    });
    var profit = null, profitQty = 0, profitSales = 0;
    if (input.profit && Number.isFinite(input.profit.profit)) {
      profit = input.profit.profit;
      profitQty = input.profit.qty || 0;
      profitSales = input.profit.sales || 0;
    }
    return {
      ym: input.ym,
      salesKnown: salesKnown,
      amount: salesKnown && days.length ? amount : null,
      qty: salesKnown && days.length ? qty : null,
      dayRows: dayRows,
      locRows: locRows,
      txKnown: txKnown,
      inboundQty: txKnown ? inn : null,
      outboundQty: txKnown ? out : null,
      inboundN: innN,
      outboundN: outN,
      stockKinds: kinds,
      stockUnits: units,
      stockValue: valued ? value : null,
      stockValued: valued,
      stockNoPrice: noPrice,
      stockZero: zero,
      stockNeg: neg,
      popups: popups,
      profit: profit,
      profitQty: profitQty,
      profitSales: profitSales
    };
  }

  var api = {
    normHead: normHead, countNum: countNum, chooseSheet: chooseSheet, sheetScore: sheetScore, readLineText: readLineText,
    countParseRows: countParseRows, parsePasteTable: parsePasteTable, fileIp: fileIp, productDraft: productDraft,
    matchProduct: matchProduct, auditPreview: auditPreview, auditDrops: auditDrops, inboundHits: inboundHits,
    pendingSales: pendingSales, hashId: hashId, parseSchedText: parseSchedText, schedGroups: schedGroups,
    schedCovers: schedCovers, schedVenueKey: schedVenueKey, schedTypeOf: schedTypeOf, SCHED_TYPES: SCHED_TYPES,
    monthEnd: monthEnd, closeModel: closeModel, actualRank: actualRank, planRank: planRank
  };
  global.OPS = api;
})(typeof window !== "undefined" ? window : globalThis);
