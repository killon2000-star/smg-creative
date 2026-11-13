/* SMG 크리에이티브 업데이트: 콜라보 팝업 일정, 준비 체크리스트, 끝난 팝업 비교 요약. v4 */
(function (global) {
  var STAGES = [
    { id: "contract", name: "계약", anchor: "start", offset: -14 },
    { id: "inbound", name: "굿즈 입고", anchor: "start", offset: -7 },
    { id: "promo", name: "홍보", anchor: "start", offset: -3 },
    { id: "open", name: "오픈", anchor: "start", offset: 0 },
    { id: "teardown", name: "철수", anchor: "end", offset: 0 }
  ];
  var WD = ["일", "월", "화", "수", "목", "금", "토"];
  var METRICS = [
    ["a", "총매출", "원"],
    ["days", "운영일수", "일"],
    ["perDay", "일평균 매출", "원"],
    ["q", "판매 수량", "개"],
    ["st", "소진율", "%"],
    ["rate", "마진율", "%"],
    ["profit", "이익", "원"],
    ["tgtPct", "목표 달성률", "%"]
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    return Number(Math.round(Number(n) || 0)).toLocaleString("ko-KR");
  }
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }
  function one(n) {
    return (Math.round(n * 10) / 10).toFixed(1);
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function isoOf(d) {
    return d.toISOString().slice(0, 10);
  }
  function utc(iso) {
    return new Date(iso + "T00:00:00Z");
  }
  function addDays(iso, n) {
    var d = utc(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return isoOf(d);
  }
  function pretty(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    var p = iso.split("-").map(Number);
    var wd = WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return p[0] + "." + pad(p[1]) + "." + pad(p[2]) + "(" + wd + ")";
  }
  function shiftMonth(ym, delta) {
    var p = ym.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1 + delta, 1));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1);
  }
  function monthGrid(ym) {
    var p = ym.split("-").map(Number);
    var y = p[0];
    var m = p[1];
    var first = new Date(Date.UTC(y, m - 1, 1));
    var padN = first.getUTCDay();
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var cells = [];
    var i;
    for (i = 0; i < padN; i++) {
      var d0 = new Date(Date.UTC(y, m - 1, 1 - (padN - i)));
      cells.push({ iso: isoOf(d0), inMonth: false, day: d0.getUTCDate() });
    }
    for (i = 1; i <= days; i++) {
      var d1 = new Date(Date.UTC(y, m - 1, i));
      cells.push({ iso: isoOf(d1), inMonth: true, day: i });
    }
    while (cells.length % 7) {
      var last = utc(cells[cells.length - 1].iso);
      last.setUTCDate(last.getUTCDate() + 1);
      cells.push({ iso: isoOf(last), inMonth: false, day: last.getUTCDate() });
    }
    return {
      y: y,
      m: m,
      cells: cells,
      weeks: cells.length / 7,
      start: ym + "-01",
      end: ym + "-" + pad(days)
    };
  }
  function validRange(p) {
    return !!(p && p.start && /^\d{4}-\d{2}-\d{2}$/.test(p.start) && (!p.end || p.end >= p.start));
  }
  function endOf(p) {
    return p.end && p.end >= p.start ? p.end : p.start;
  }
  function covers(p, day) {
    if (!validRange(p)) return false;
    return p.start <= day && endOf(p) >= day;
  }
  function hitsMonth(p, grid) {
    if (!validRange(p)) return false;
    return p.start <= grid.end && endOf(p) >= grid.start;
  }
  function statusOf(p, today) {
    if (!p || !validRange(p)) return "날짜 미정";
    if (p.statusOverride === "예정" || p.statusOverride === "진행중" || p.statusOverride === "종료") return p.statusOverride;
    if (today < p.start) return "예정";
    if (p.end && today > p.end) return "종료";
    return "진행중";
  }
  function statusClass(st) {
    if (st === "진행중") return "near";
    if (st === "종료") return "ok";
    if (st === "예정") return "pb";
    return "low";
  }
  function chipClass(st) {
    if (st === "진행중") return "st-go";
    if (st === "종료") return "st-done";
    if (st === "예정") return "st-soon";
    return "st-none";
  }
  function placeOf(p, locs) {
    var loc = (locs || []).find(function (l) { return l.id === p.locationId; });
    var name = loc ? loc.name : "";
    if (name && p.venue) return name + " · " + p.venue;
    return name || p.venue || "장소 미지정";
  }
  function kindOf(p) {
    return p.kind === "ip" ? "IP" : "콜라보";
  }
  function dueOf(p, stage) {
    var base = stage.anchor === "end" ? p.end : p.start;
    if (!base || !/^\d{4}-\d{2}-\d{2}$/.test(base)) return "";
    if (p.end && p.start && p.end < p.start) return "";
    return addDays(base, stage.offset);
  }
  function prepDone(prep, id) {
    var v = prep && prep[id];
    return !!(v && v.done === true);
  }
  function checklistModel(p, today) {
    return STAGES.map(function (stage) {
      var due = dueOf(p, stage);
      var done = prepDone(p.prep, stage.id);
      var overdue = !!(due && today && due < today && !done);
      return { id: stage.id, name: stage.name, due: due, done: done, overdue: overdue, at: (p.prep && p.prep[stage.id] && p.prep[stage.id].at) || "" };
    });
  }
  function money(n) {
    return fmt(n) + "원";
  }
  function metricValue(item, key) {
    if (key === "perDay") return item.days > 0 && finite(item.perDay) ? item.perDay : null;
    if (key === "st") return finite(item.st) ? item.st : null;
    if (key === "rate" || key === "profit") return item.hasCost && finite(item[key]) ? item[key] : null;
    if (key === "tgtPct") return Number(item.target) > 0 && finite(item.tgtPct) ? item.tgtPct : null;
    if (key === "a" || key === "q" || key === "days") return finite(item[key]) ? item[key] : null;
    return null;
  }
  function formatMetric(key, value, unit) {
    if (unit === "원") return money(value);
    if (unit === "%") return one(value) + "%";
    if (unit === "일" || unit === "개") return fmt(value) + unit;
    return String(value);
  }
  function rankLine(rows) {
    if (!rows || rows.length < 2) return null;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var avg = rows.reduce(function (s, r) { return s + r.value; }, 0) / rows.length;
    var tops = rows.filter(function (r) { return r.value === max; });
    return { max: max, avg: avg, tops: tops, n: rows.length, above: max > avg + 1e-9 };
  }
  function ipTop(item) {
    var list = (item.IP || []).filter(function (ip) { return ip && finite(ip.a) && item.a > 0; });
    if (!list.length) return null;
    var top = list.slice().sort(function (a, b) { return b.a - a.a; })[0];
    return { ip: top.ip, a: top.a, pct: top.a / item.a * 100 };
  }
  function compareModel(items, today, marginLine) {
    var line = finite(marginLine) ? marginLine : 20;
    var summary = [];
    var good = [];
    var bad = [];
    var warn = [];
    var usable = items.filter(function (it) { return statusOf(it.p, today) !== "예정" && statusOf(it.p, today) !== "날짜 미정"; });
    var planned = items.filter(function (it) { return statusOf(it.p, today) === "예정" || statusOf(it.p, today) === "날짜 미정"; });
    summary.push("선택한 팝업 " + items.length + "개를 저장된 집계 숫자로 비교합니다.");
    if (planned.length) {
      summary.push("시작 전·날짜 미정 " + planned.length + "개(" + planned.map(function (it) { return it.p.name; }).join(", ") + ")는 매출 비교에서 제외했습니다.");
    }
    METRICS.forEach(function (spec) {
      var key = spec[0];
      var label = spec[1];
      var unit = spec[2];
      var rows = usable.map(function (it) {
        var value = metricValue(it, key);
        return value == null ? null : { item: it, value: value };
      }).filter(Boolean);
      var ranked = rankLine(rows);
      if (!ranked) return;
      var names = ranked.tops.map(function (r) { return r.item.p.name; }).join(", ");
      var shown = formatMetric(key, ranked.max, unit);
      var avgShown = formatMetric(key, ranked.avg, unit);
      summary.push(label + " 1위 " + names + " " + shown + " (비교 " + ranked.n + "개 평균 " + avgShown + ")");
      if (ranked.above) {
        var pct = (ranked.max - ranked.avg) / Math.abs(ranked.avg) * 100;
        good.push(label + " · " + names + " " + shown + " · 평균 " + avgShown + " 대비 " + (pct >= 0 ? "+" : "") + one(pct) + "%");
      }
      if (key === "perDay") {
        rows.forEach(function (r) {
          if (r.value < ranked.avg - 1e-9) {
            var gap = (r.value - ranked.avg) / Math.abs(ranked.avg) * 100;
            bad.push(r.item.p.name + " 일평균 매출 " + money(r.value) + " · 평균 " + money(ranked.avg) + " 대비 " + one(gap) + "%");
          }
        });
      }
    });
    usable.forEach(function (it) {
      var name = it.p.name;
      var stt = statusOf(it.p, today);
      if (finite(it.st) && it.st < 50) {
        var stLine = name + " 소진율 " + one(it.st) + "% (50% 미만)";
        bad.push(stLine);
        warn.push(stLine);
      }
      if (it.hasCost && finite(it.rate) && it.rate < line) {
        var rateLine = name + " 마진율 " + one(it.rate) + "% · 기준 " + one(line) + "% 미만";
        bad.push(rateLine);
        warn.push(rateLine);
      }
      if (Number(it.target) > 0 && finite(it.tgtPct) && it.tgtPct < 100) {
        var tgtLine = name + " 목표 달성률 " + one(it.tgtPct) + "% · 목표 " + money(it.target) + " · 실적 " + money(it.a);
        bad.push(tgtLine);
        warn.push(tgtLine);
      }
      if (it.a > 0 && it.hasCost === false) warn.push(name + " 이익·마진율은 원가 숫자가 없어 계산하지 않았습니다.");
      if ((stt === "종료" || stt === "진행중") && it.days > 0 && !finite(it.st)) warn.push(name + " 소진율을 계산할 재고 숫자가 없습니다.");
      if (stt === "진행중") {
        var till = (it.S && it.S.to) || today;
        warn.push(name + "은 진행중이라 매출 집계는 " + pretty(it.p.start) + " ~ " + pretty(till) + "입니다.");
      }
    });
    var ended = usable.filter(function (it) { return statusOf(it.p, today) === "종료" && it.days > 0 && finite(it.perDay); });
    var rec;
    if (!ended.length) rec = "종료되어 일평균 매출이 계산된 팝업이 없어 다음 팝업 기준을 추천하지 않습니다.";
    else {
      var max = Math.max.apply(null, ended.map(function (it) { return it.perDay; }));
      var tops = ended.filter(function (it) { return it.perDay === max; });
      rec = "종료된 팝업 가운데 일평균 매출이 가장 높은 것은 " + tops.map(function (it) { return it.p.name; }).join(", ") + "입니다. 일평균 " + money(max) + ".";
      if (tops.length === 1) {
        var oneTop = tops[0];
        rec += " 운영 " + fmt(oneTop.days) + "일, 총매출 " + money(oneTop.a) + ".";
        var ip = ipTop(oneTop);
        if (ip && ip.ip) rec += " IP 매출 1위는 " + ip.ip + " " + money(ip.a) + "(" + one(ip.pct) + "%)입니다.";
      }
      rec += " 다음 팝업의 매출 기준으로 이 숫자를 참고합니다.";
    }
    if (!good.length) good.push("평균보다 높은 지표가 없습니다.");
    if (!bad.length) bad.push("숫자로 확인된 문제점이 없습니다.");
    if (!warn.length) warn.push("숫자로 확인된 경고가 없습니다.");
    return { summary: summary, good: good, bad: bad, rec: rec, warn: warn, marginLine: line };
  }
  function barsHtml(items, key, title, unit) {
    var rows = items.map(function (it) {
      var value = metricValue(it, key);
      return value == null ? null : { name: it.p.name, value: value };
    }).filter(Boolean);
    if (!rows.length) return "";
    rows.sort(function (a, b) { return b.value - a.value; });
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    return '<div class="card cmpchart"><h3>' + esc(title) + '</h3><div class="cmpbars">' + rows.map(function (r) {
      var w = max > 0 ? Math.max(0, Math.min(100, r.value / max * 100)) : 0;
      return '<div class="cmpbar"><span class="cmpname">' + esc(r.name) + '</span><span class="cmptrack" aria-hidden="true"><i style="width:' + w + '%"></i></span><span class="cmpval">' + esc(formatMetric(key, r.value, unit)) + '</span></div>';
    }).join("") + "</div></div>";
  }
  function listHtml(lines) {
    return "<ul class=\"insl\">" + lines.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") + "</ul>";
  }
  function renderCompare(items, today, marginLine) {
    var m = compareModel(items, today, marginLine);
    var cards = [
      ["요약", listHtml(m.summary)],
      ["잘한 점", listHtml(m.good)],
      ["문제점", listHtml(m.bad)],
      ["다음 팝업 추천", "<p>" + esc(m.rec) + "</p>"],
      ["경고", m.warn.length === 1 && m.warn[0].indexOf("없습니다") >= 0 ? "<p>" + esc(m.warn[0]) + "</p>" : m.warn.map(function (w) { return '<div class="warnb">' + esc(w) + "</div>"; }).join("")]
    ];
    return '<section class="updcmp" id="updcmp"><div class="updcharts">' + barsHtml(items, "perDay", "일평균 매출", "원") + barsHtml(items, "a", "총매출", "원") + '</div><div class="updgrid">' + cards.map(function (c) {
      return '<article class="card"><h3>' + c[0] + "</h3>" + c[1] + "</article>";
    }).join("") + "</div></section>";
  }
  function metaText(row) {
    if (row.done) return "완료" + (row.at ? " " + pretty(row.at) : "");
    if (!row.due) return "예정일 없음";
    if (row.overdue) return "예정일 지남 · " + pretty(row.due);
    return "예정 " + pretty(row.due);
  }
  function renderChecklist(p, today, editable) {
    var rows = checklistModel(p, today);
    var done = rows.filter(function (r) { return r.done; }).length;
    var pct = rows.length ? Math.round(done / rows.length * 100) : 0;
    var overdue = rows.filter(function (r) { return r.overdue; }).length;
    return '<section class="card prep" id="prep"><div class="prephd"><h3>팝업 준비 체크리스트</h3><div class="prepprog"><div class="prepbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div><b>' + done + "/" + rows.length + " · " + pct + '%</b></div></div><p class="muted">예정일은 시작일·종료일에서 계산합니다. 계약 14일 전, 굿즈 입고 7일 전, 홍보 3일 전, 오픈은 시작일, 철수는 종료일입니다.' + (overdue ? " 기한이 지난 미완료 " + overdue + "건." : "") + '</p><div class="prepgrid">' + rows.map(function (row) {
      return '<label class="preprow' + (row.overdue ? " isover" : "") + (row.done ? " isdone" : "") + '"><span class="prepck"><input type="checkbox" data-stage="' + row.id + '"' + (row.done ? " checked" : "") + (editable ? "" : " disabled") + ' aria-label="' + esc(row.name) + '"> <span class="prepname">' + esc(row.name) + '</span></span><span class="prepmeta">' + esc(metaText(row)) + "</span></label>";
    }).join("") + "</div></section>";
  }
  function renderCalendar(opts) {
    var items = opts.items || [];
    var locs = opts.locs || [];
    var today = opts.today;
    var params = opts.params || new URLSearchParams();
    var ym = params.get("m") || "";
    if (!/^\d{4}-\d{2}$/.test(ym) || Number(ym.slice(5)) < 1 || Number(ym.slice(5)) > 12) ym = today.slice(0, 7);
    var grid = monthGrid(ym);
    var want = params.get("d") || "";
    var sel = grid.cells.some(function (c) { return c.inMonth && c.iso === want; }) ? want : (grid.cells.some(function (c) { return c.inMonth && c.iso === today; }) ? today : grid.start);
    var undated = items.filter(function (it) { return !validRange(it.p); });
    var monthItems = items.filter(function (it) { return hitsMonth(it.p, grid); });
    function count(st) {
      return monthItems.filter(function (it) { return statusOf(it.p, today) === st; }).length;
    }
    var prev = shiftMonth(ym, -1);
    var next = shiftMonth(ym, 1);
    var cur = today.slice(0, 7);
    function dayPops(iso) {
      return items.filter(function (it) { return covers(it.p, iso); }).sort(function (a, b) {
        return String(a.p.start).localeCompare(String(b.p.start)) || String(a.p.name).localeCompare(String(b.p.name), "ko");
      });
    }
    var selected = dayPops(sel);
    var head = '<div class="caltop"><div class="caltitle"><h2>' + grid.y + "년 " + grid.m + '월</h2><a href="#/popups">팝업 목록</a></div><div class="calnav" role="group" aria-label="달 이동"><a class="btn sec" href="#/popcal?m=' + prev + '">이전 달</a><a class="btn sec' + (ym === cur ? " on" : "") + '" href="#/popcal?m=' + cur + '">이번달</a><a class="btn sec" href="#/popcal?m=' + next + '">다음 달</a></div></div>';
    var leg = '<div class="calleg" aria-label="이 달 팝업 수"><span class="badge near">진행중 ' + count("진행중") + '</span><span class="badge pb">예정 ' + count("예정") + '</span><span class="badge ok">종료 ' + count("종료") + "</span></div>";
    var und = undated.length ? '<section class="undated"><h3>날짜 미정 <span class="su">' + undated.length + '건</span></h3><div class="undated-row">' + undated.map(function (it) {
      return '<a class="undchip" href="#/popup?id=' + encodeURIComponent(it.p.id) + '" title="' + esc(it.p.name) + '"><b>' + esc(it.p.name) + "</b><span>" + esc(kindOf(it.p)) + "</span></a>";
    }).join("") + "</div></section>" : "";
    var dow = WD.map(function (d) { return '<div class="caldow">' + d + "</div>"; }).join("");
    var cells = grid.cells.map(function (c) {
      if (!c.inMonth) return '<div class="calcell isOut"><span class="calnum">' + c.day + "</span></div>";
      var pops = dayPops(c.iso);
      var names = pops.map(function (it) {
        var st = statusOf(it.p, today);
        return '<span class="calchip ' + chipClass(st) + '">' + esc(it.p.name) + "</span>";
      }).join("");
      var more = pops.length > 1 ? '<span class="calmore">+' + (pops.length - 1) + "</span>" : "";
      var cls = "calcell" + (c.iso === sel ? " isSel" : "") + (c.iso === today ? " isToday" : "");
      return '<a class="' + cls + '" href="#/popcal?m=' + ym + "&d=" + c.iso + '" aria-label="' + grid.m + "월 " + c.day + "일 팝업 " + pops.length + '개"><span class="calnum">' + c.day + '</span><span class="calnames">' + names + more + "</span></a>";
    }).join("");
    var detailBody = selected.length ? selected.map(function (it) {
      var st = statusOf(it.p, today);
      var range = pretty(it.p.start) + (it.p.end ? " ~ " + pretty(it.p.end) : " ~ 종료일 없음");
      return '<article class="calitem"><div class="calkv"><span>이름</span><b><a href="#/popup?id=' + encodeURIComponent(it.p.id) + '">' + esc(it.p.name) + '</a></b><span>상태</span><b><span class="badge ' + statusClass(st) + '">' + esc(st) + '</span></b><span>구분</span><b>' + esc(kindOf(it.p)) + (it.p.ip ? " · " + esc(it.p.ip) : "") + '</b><span>장소</span><b>' + esc(placeOf(it.p, locs)) + '</b><span>기간</span><b>' + esc(range) + '</b></div><a class="btn sec calgo" href="#/popup?id=' + encodeURIComponent(it.p.id) + '">팝업 상세</a></article>';
    }).join("") : '<p class="muted">이 날짜의 팝업이 없습니다.</p>' + (monthItems.length ? '<h3 class="calmoreh">이 달의 팝업</h3>' + monthItems.map(function (it) {
      return '<article class="calitem"><div class="calkv"><span>이름</span><b><a href="#/popup?id=' + encodeURIComponent(it.p.id) + '">' + esc(it.p.name) + '</a></b><span>상태</span><b>' + esc(statusOf(it.p, today)) + '</b><span>기간</span><b>' + esc(pretty(it.p.start) + " ~ " + pretty(it.p.end || it.p.start)) + '</b></div><a class="btn sec calgo" href="#/popup?id=' + encodeURIComponent(it.p.id) + '">팝업 상세</a></article>';
    }).join("") : '<p class="muted">이 달에 날짜가 있는 팝업이 없습니다.</p>');
    return '<section class="calpage" id="calpage" data-weeks="' + grid.weeks + '">' + head + leg + und + '<div class="calbody"><div class="calgrid" style="--weeks:' + grid.weeks + '" role="grid" aria-label="' + grid.y + "년 " + grid.m + '월 달력">' + dow + cells + '</div><aside class="caldetail card"><h3>' + esc(pretty(sel)) + '</h3><div class="caldl">' + detailBody + "</div></aside></div></section>";
  }
  function fitNames(root) {
    if (!root) return;
    root.querySelectorAll(".calnames").forEach(function (line) {
      var chips = [].slice.call(line.querySelectorAll(".calchip"));
      var more = line.querySelector(".calmore");
      line.classList.add("isFit");
      chips.forEach(function (c) { c.hidden = false; c.classList.remove("ellip"); });
      if (chips.length <= 1) {
        if (more) more.hidden = true;
        if (chips[0]) chips[0].classList.add("ellip");
        return;
      }
      if (more) more.hidden = true;
      var overflow = function () { return line.scrollWidth > line.clientWidth + 1; };
      if (!overflow()) return;
      var hidden = 0;
      for (var i = chips.length - 1; i >= 1; i--) {
        chips[i].hidden = true;
        hidden++;
        if (more) {
          more.hidden = false;
          more.textContent = "+" + hidden;
        }
        if (!overflow()) return;
      }
      if (chips[0]) chips[0].classList.add("ellip");
      if (more) {
        more.hidden = false;
        more.textContent = "+" + (chips.length - 1);
      }
    });
  }
  function fitCalendar() {
    var page = document.getElementById("calpage");
    if (!page) return;
    var head = document.querySelector("header");
    var main = document.querySelector("main");
    var pad = 0;
    if (main) {
      var cs = getComputedStyle(main);
      pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    }
    var h = window.innerHeight - ((head && head.offsetHeight) || 0) - pad;
    page.style.height = Math.max(320, h) + "px";
    fitNames(page);
  }
  function bindCalendar() {
    fitCalendar();
    if (!global.__smgcCalFit) {
      global.__smgcCalFit = function () { fitCalendar(); };
      window.addEventListener("resize", global.__smgcCalFit);
    }
  }
  function replacePrep(item, stageId, done, today) {
    var prev = Object.assign({}, item.p.prep || {});
    prev[stageId] = done ? { done: true, at: today } : { done: false };
    item.p.prep = prev;
    return prev;
  }
  function bindChecklist(S, item, today) {
    var root = document.getElementById("prep");
    if (!root) return;
    root.querySelectorAll("input[type=checkbox]").forEach(function (input) {
      input.addEventListener("change", function () {
        var stageId = input.getAttribute("data-stage");
        if (!STAGES.some(function (s) { return s.id === stageId; }) || !S.canEdit()) {
          input.checked = !input.checked;
          return;
        }
        var snapshot = Object.assign({}, item.p.prep || {});
        var prep = replacePrep(item, stageId, input.checked, today);
        input.disabled = true;
        S.setDoc(S.doc(S.db, "popups", item.p.id), { prep: prep, updatedAt: S.stamp() }, { merge: true }).then(function () {
          root.outerHTML = renderChecklist(item.p, today, true);
          bindChecklist(S, item, today);
        }).catch(function (e) {
          item.p.prep = snapshot;
          input.checked = !input.checked;
          input.disabled = false;
          alert("저장 실패: " + (e && e.code === "permission-denied" ? "권한 없음" : (e && e.message) || ""));
        });
      });
    });
  }
  function after(S, path, params) {
    if (path === "/popups") {
      var row = document.querySelector("#pcmp");
      if (row && row.parentElement && !document.getElementById("popcalink")) {
        row.insertAdjacentHTML("afterend", ' <a class="btn sec" id="popcalink" href="#/popcal">일정 달력</a>');
      }
      return;
    }
    if (path === "/popcal") {
      bindCalendar();
      return;
    }
    var pack = global.__smgcPop;
    if (!pack || !pack.ms) return;
    if (path === "/popup") {
      var id = params.get("id");
      var item = pack.ms.find(function (it) { return it.p && it.p.id === id; });
      var host = document.querySelector("#app > .card");
      if (!item || !host || document.getElementById("prep")) return;
      var today = S.today();
      host.insertAdjacentHTML("afterend", renderChecklist(item.p, today, !!S.canEdit()));
      bindChecklist(S, item, today);
      return;
    }
    if (path === "/popcmp") {
      var ids = (params.get("ids") || "").split(",").filter(Boolean);
      var items = ids.map(function (pid) {
        return pack.ms.find(function (it) { return it.p && it.p.id === pid; });
      }).filter(Boolean);
      var first = document.querySelector("#app > .card");
      if (items.length < 2 || !first || document.getElementById("updcmp")) return;
      first.insertAdjacentHTML("afterend", renderCompare(items, pack.t || S.today(), S.marginLine()));
    }
  }
  global.POPUP_UPDATE = {
    STAGES: STAGES,
    esc: esc,
    fmt: fmt,
    pretty: pretty,
    monthGrid: monthGrid,
    statusOf: statusOf,
    covers: covers,
    validRange: validRange,
    checklistModel: checklistModel,
    compareModel: compareModel,
    renderCalendar: renderCalendar,
    renderChecklist: renderChecklist,
    renderCompare: renderCompare,
    fitNames: fitNames,
    fitCalendar: fitCalendar
  };
  global.SMGC_BOOT = function (S) {
    S.routes["/popcal"] = function (params) {
      if (!S.canPopups()) return Promise.resolve('<div class="err">권한이 없습니다.</div>');
      return S.loadPopups().then(function (pack) {
        return S.locations(true).catch(function () { return []; }).then(function (locs) {
          return renderCalendar({ items: pack.ms || [], locs: locs || [], params: params, today: pack.t || S.today() });
        });
      }).catch(function () {
        return '<div class="err">팝업 일정을 불러오지 못했습니다.</div>';
      });
    };
    global.SMGC_AFTER = function (path, params) {
      try {
        after(S, path, params);
      } catch (e) {
        console.error(e);
      }
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
