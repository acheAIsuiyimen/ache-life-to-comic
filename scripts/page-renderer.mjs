import {copyFile, mkdir} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resolveThemePalette, themeStyleAttribute} from "./theme-system.mjs";
import {interludeSvg} from "./svg-decorations.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDirectory, "..");
const pageCssPath = path.join(skillRoot, "assets", "templates", "page-system.css");
const fontDirectory = path.join(skillRoot, "assets", "fonts");

export const DESIGN_SYSTEM_VERSION = "ache-design-system/1.10.0";
export const MONTHLY_RENDERER_VERSION = "ache-monthly-renderer/2.8.0";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeLabel(route) {
  return {S: "日常", P: "照片", K: "知识", M: "会议", L: "长文"}[route] ?? route;
}

function readableDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (!match) return String(value ?? "");
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function readableMonth(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/u);
  if (!match) return String(value ?? "");
  return `${match[1]}年${Number(match[2])}月`;
}

function sentences(value) {
  const normalized = String(value ?? "").replace(/[ \t]+/gu, " ").trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function characterWeight(value) {
  return [...String(value ?? "")].reduce((total, character) => {
    if (/\s/u.test(character)) return total;
    return total + (/^[\x00-\x7F]$/u.test(character) ? 0.55 : 1);
  }, 0);
}

function splitLongUnit(unit, capacity) {
  if (characterWeight(unit) <= capacity) return [unit];
  const characters = [...unit];
  const parts = [];
  let current = "";
  for (const character of characters) {
    if (current && characterWeight(`${current}${character}`) > capacity) {
      parts.push(current.trim());
      current = character;
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitLongUnitExact(unit, capacity) {
  if (characterWeight(unit) <= capacity) return [unit];
  const parts = [];
  let current = "";
  for (const character of [...unit]) {
    if (current && characterWeight(`${current}${character}`) > capacity) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function textCapacity(route, hasVisual = false) {
  // K/M/L 文字页容量（字符权重）。贴纸/附件住在正文之后的留白区里，
  // 不占用文字容量，因此 hasVisual 不再扣减；文字会不会溢出由密度选择器
  // （按预估渲染高度选字号档位）和浏览器端 layout guard 双重兜底。
  return {K: 300, M: 280, L: 620}[route] ?? 290;
}

function trimTerminal(value) {
  return String(value ?? "").trim().replace(/[；;。！？!?]+$/u, "").trim();
}

// Wrap P0/P1/P2 priority tags and dash separators with hand-drawn emphasis
// spans so priorities and structure pop out of the meeting list.
// 顺序很关键：必须先包分隔线、再包优先级。反之优先级 <em> 的 class 名
// "ache-meeting-priority" 含连字符，会被分隔线正则二次匹配，把 HTML
// 标签打碎泄露成可见文本。
function highlightMeetingText(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/([﹣—-]\s*)/gu, '<span class="ache-meeting-sep">$1</span>')
    .replace(/(P[012])/gu, '<em class="ache-meeting-priority">$1</em>');
}

export function structureKnowledgeText(value) {
  const source = String(value ?? "").replace(/[ \t]+/gu, " ").trim();
  if (!source) return {mode: "prose", intro: "", steps: [], reflection: ""};
  const colon = source.search(/[：:]/u);
  if (colon < 0) return {mode: "prose", intro: source, steps: [], reflection: ""};

  const intro = trimTerminal(source.slice(0, colon));
  const tail = source.slice(colon + 1).trim();

  // Numbered steps, one per line ("1. 口喷\n2. 清理\n\n反应") — page-grammar
  // says 分号、冒号和换行都只是语法线索, so a numbered list is the same
  // step group as "口喷；清理。反应".
  if (/^\s*\d+[.、)]\s*\S/mu.test(tail)) {
    const steps = [];
    const rest = [];
    for (const line of tail.split(/\n+/u)) {
      const m = line.trim().match(/^\d+[.、)]\s*(.+)$/u);
      if (m && rest.length === 0) steps.push(trimTerminal(m[1]));
      else rest.push(line.trim());
    }
    if (steps.length >= 2) {
      return {mode: "sequence", intro, steps, reflection: trimTerminal(rest.filter(Boolean).join("，"))};
    }
  }

  const firstStop = tail.search(/[。！？!?]/u);
  const sequence = firstStop >= 0 ? tail.slice(0, firstStop) : tail;
  const reflection = firstStop >= 0 ? tail.slice(firstStop + 1).trim() : "";
  const steps = sequence.split(/[；;]/u).map(trimTerminal).filter(Boolean);
  if (steps.length < 2) return {mode: "prose", intro: source, steps: [], reflection: ""};
  return {mode: "sequence", intro, steps, reflection: trimTerminal(reflection)};
}

// Parse meeting text into structured sections — metadata, titled sections
// (一/二/三/四), bullet sub-items, numbered decisions/todos, and the closing
// "下次会议" line. The renderer then applies distinct hand-drawn treatments
// per kind instead of flattening everything into identical bullet points.
export function structureMeetingText(value) {
  const raw = String(value ?? "").replace(/\r\n/gu, "\n").trim();
  if (!raw) return {meta: [], sections: [], nextMeeting: ""};
  const lines = raw.split(/\n+/u).map((l) => l.trim()).filter(Boolean);

  const meta = [];
  const sections = [];
  let nextMeeting = "";
  let current = null;
  let inMeta = true;

  const sectionHeaderRe = /^[一二三四五六七八九十]+[、.．]\s*(.+)$/u;
  const numberedRe = /^(\d+)[.、)]\s*(.+)$/u;
  const bulletRe = /^[-•·]\s*(.+)$/u;
  const metaRe = /^(会议主题|会议时间|会议地点|参会人员|时间|地点|主题|主持人|记录人)[：:]\s*(.+)$/u;
  const nextRe = /^下次会议[：:]\s*(.+)$/u;

  for (const line of lines) {
    const nextMatch = line.match(nextRe);
    if (nextMatch) { nextMeeting = nextMatch[1].trim(); continue; }

    if (inMeta) {
      const mm = line.match(metaRe);
      if (mm) { meta.push({label: mm[1], value: mm[2].trim()}); continue; }
      // A non-meta line ends the meta block.
      inMeta = false;
    }

    const sh = line.match(sectionHeaderRe);
    if (sh) {
      const title = sh[1].trim();
      // 章节语气继承：决议/待办章节下的条目默认带章节语气，
      // 避免同一段决议里有的画圈有的打勾（关键词偶然命中）。
      const defaultTone = /决议|决定|结论/.test(title)
        ? "decision"
        : /待办|行动|任务|跟进|落实/.test(title)
          ? "todo"
          : null;
      current = {title, items: [], defaultTone};
      sections.push(current);
      continue;
    }

    const nm = line.match(numberedRe);
    const bm = line.match(bulletRe);
    // 以冒号结尾的短行是讨论子标题（"上周线上问题复盘："），
    // 不是列表条目——渲染为小标题，不参与标记和语气分类。
    const isSubhead = !nm && !bm && /[：:]\s*$/u.test(line) && characterWeight(line) <= 30;
    const item = nm
      ? {kind: "numbered", num: Number(nm[1]), text: nm[2].trim()}
      : bm
        ? {kind: "bullet", text: bm[1].trim()}
        : isSubhead
          ? {kind: "subhead", text: trimTerminal(line)}
          : {kind: "plain", text: line};

    // Classify item kind for visual treatment (决议/风险/待办).
    // 章节语气优先：决议章节里所有条目都是决议标记、待办章节里都是
    // 勾选框——同一张列表混用圆圈和勾看起来像排版错误。只有无语气
    // 章节（议题/讨论）才按关键词逐条分类。
    // 风险波浪线只给明示风险（"风险点：…"/含 风险/隐患/阻塞 等），
    // "问题复盘""可能影响"这类讨论常规措辞一律 context，避免满页波浪。
    const t = item.text;
    if (item.kind === "subhead") {
      item.tone = "context";
    } else if (current?.defaultTone) {
      item.tone = current.defaultTone;
    } else if (/P0|P1|P2|负责人|期限|截止|输出|完成|补充/.test(t) || /^(待办|行动|任务)/.test(t)) {
      item.tone = "todo";
    } else if (/^(风险|隐患|阻塞|未决|待确认)/u.test(t) || /风险|隐患|阻塞|延期|未决|待确认/u.test(t)) {
      item.tone = "risk";
    } else if (/决议|决定|结论|通过|确认|列为|必须|采用|优先/.test(t) || /^(决议|决定)/.test(t)) {
      item.tone = "decision";
    } else {
      item.tone = "context";
    }

    if (current) current.items.push(item);
    else {
      // Orphan lines before any section header → collect into a preface.
      if (!sections.length || sections[0].title !== "__preface__") {
        current = {title: "__preface__", items: []};
        sections.unshift(current);
      }
      current.items.push(item);
    }
  }
  return {meta, sections, nextMeeting};
}

// ——————————————————————————————————————————————————————————————
// 会议页语义分页：按"块"（元信息 / 章节 / 下次会议）排版，而不是按
// 字符数硬切。章节标题永远和它的第一条目同页（不孤儿），决议列表
// 不会和"三、会议决议"标题分家。高度按 760px 页宽、常规字号估算。
// ——————————————————————————————————————————————————————————————

// 正文可用高度预算（px @760 页宽）：3:4 页面 1013 高 − 页眉 ≈150
// − 页脚 ≈45 − 上下 padding ≈85 ≈ 733；再给留白区最小高度让位。
const MEETING_PAGE_BUDGET = 600;

function meetingLines(text, perLine = 40) {
  return Math.max(1, Math.ceil(characterWeight(text) / perLine));
}

// 单条目高度：行数×行高 + 条目间距。按 M regular（14.8px/1.65lh=24.5px
// 行高，条目 margin+padding ≈1.45em≈21px，标记列后约 40 字/行）对真实
// 渲染标定。
function meetingItemHeight(item) {
  if (item.kind === "subhead") return 42;
  return meetingLines(item.text) * 25 + 21;
}

function estimateMeetingSectionHeight(section) {
  const header = section.title === "__preface__" ? 0 : 48;
  return header + section.items.reduce((sum, it) => sum + meetingItemHeight(it), 0);
}

function estimateMeetingBlockHeight(block) {
  if (block.kind === "meta") {
    const chars = block.data.reduce((sum, m) => sum + characterWeight(`${m.label}${m.value}`), 0);
    return Math.max(1, Math.ceil(chars / 58)) * 24 + 16;
  }
  if (block.kind === "section") return estimateMeetingSectionHeight(block.data);
  return 50; // next-meeting strip
}

// Greedy pack by estimated height with a balance target, allowing long
// sections to split at item boundaries (header travels with its first
// items — never orphaned). Blocks keep reading order.
function paginateMeetingStructure(meet) {
  const blocks = [];
  if (meet.meta.length) blocks.push({kind: "meta", data: meet.meta});
  for (const sec of meet.sections) blocks.push({kind: "section", data: sec});
  if (meet.nextMeeting) blocks.push({kind: "next", data: meet.nextMeeting});
  if (!blocks.length) return [[{kind: "section", data: {title: "__preface__", items: []}}]];

  const heights = blocks.map(estimateMeetingBlockHeight);
  const total = heights.reduce((a, b) => a + b, 0);
  const pageCount = Math.max(1, Math.ceil(total / MEETING_PAGE_BUDGET));
  const target = total / pageCount;

  const pages = [[]];
  const pageHeight = [0];
  const pushUnit = (unit, h) => {
    pages[pages.length - 1].push(unit);
    pageHeight[pageHeight.length - 1] += h;
  };
  const openPage = () => {
    pages.push([]);
    pageHeight.push(0);
  };

  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi];
    let remaining = block.kind === "section" ? [...block.data.items] : null;
    let firstSlice = true;
    do {
      const curH = pageHeight[pageHeight.length - 1];
      const isEmpty = pages[pages.length - 1].length === 0;
      if (block.kind !== "section") {
        const h = heights[bi];
        if (!isEmpty && curH + h > MEETING_PAGE_BUDGET && curH >= target * 0.72) openPage();
        pushUnit(block, h);
        break;
      }
      // Section: measure header + item-by-item fill of the current page.
      const headerH = firstSlice && block.data.title !== "__preface__" ? 48 : 0;
      const slice = {title: block.data.title, items: [], continuation: !firstSlice};
      let sliceH = headerH;
      const room = () => Math.max(MEETING_PAGE_BUDGET, target) - (pageHeight[pageHeight.length - 1] + sliceH);
      if (!isEmpty && headerH && curH + headerH > MEETING_PAGE_BUDGET) {
        openPage();
      }
      while (remaining.length) {
        const itemH = meetingItemHeight(remaining[0]);
        const mustKeepOne = slice.items.length === 0 && firstSlice; // 标题至少带一条
        if (!mustKeepOne && itemH > room() && (slice.items.length || pageHeight[pageHeight.length - 1])) break;
        if (!mustKeepOne && pageHeight[pageHeight.length - 1] + sliceH + itemH > MEETING_PAGE_BUDGET) break;
        slice.items.push(remaining.shift());
        sliceH += itemH;
        if (pageHeight[pageHeight.length - 1] + sliceH >= target && remaining.length) {
          // 到达均衡目标：若整个剩余章节还能放进本页就继续，否则收页。
          const restH = remaining.reduce((s, it) => s + meetingItemHeight(it), 0);
          if (pageHeight[pageHeight.length - 1] + sliceH + restH > Math.max(MEETING_PAGE_BUDGET, target)) break;
        }
      }
      if (slice.items.length || slice.title !== "__preface__") {
        pushUnit({kind: "section", data: slice}, sliceH);
      }
      firstSlice = false;
      if (remaining.length) openPage();
    } while (remaining?.length);
  }

  // 均衡收尾：末页过轻（<78% 目标）时，从上一页尾部往末页搬内容。
  // 优先搬"章节尾部条目切片"（≥3 条才切，至少留 1 条，末页以
  // continuation 接续、阅读顺序不变）；切不了再整块搬迁。只动上一页
  // 尾部，不打乱章节内部顺序。
  for (let round = 0; round < 4 && pages.length > 1; round += 1) {
    const lastH = pageHeight[pageHeight.length - 1];
    if (lastH >= target * 0.78) break;
    const prev = pages[pages.length - 2];
    const tail = prev.length > 1 ? prev[prev.length - 1] : null;
    if (!tail || tail.kind !== "section") break;
    const prevH = pageHeight[pageHeight.length - 2];

    // 1) 尾部条目切片：搬到末页顶部，数量以"末页补齐到目标"为上限，
    //    同时保证上一页不被掏空（保留 ≥55% 目标）。
    if (tail.data.items.length >= 3) {
      const need = Math.min(target - lastH, prevH - target * 0.55);
      if (need > 0) {
        const moved = [];
        let movedH = 0;
        while (tail.data.items.length > 1) {
          const item = tail.data.items[tail.data.items.length - 1];
          const h = meetingItemHeight(item);
          if (moved.length && movedH + h > need) break;
          moved.unshift(tail.data.items.pop());
          movedH += h;
          if (movedH >= need * 0.6) break;
        }
        if (moved.length) {
          pages[pages.length - 1].unshift({kind: "section", data: {title: tail.data.title, items: moved, continuation: true}});
          pageHeight[pageHeight.length - 1] += movedH;
          pageHeight[pageHeight.length - 2] -= movedH;
          continue;
        }
      }
    }

    // 2) 整块搬迁：上一页搬完后仍不低于 55% 目标才搬。
    const h = estimateMeetingSectionHeight(tail.data);
    if (prevH - h < target * 0.55 || lastH + h > MEETING_PAGE_BUDGET) break;
    prev.pop();
    pageHeight[pageHeight.length - 2] -= h;
    pages[pages.length - 1].unshift(tail);
    pageHeight[pageHeight.length - 1] += h;
  }

  return pages.map((units) => ({
    meta: units.find((u) => u.kind === "meta")?.data ?? [],
    sections: units.filter((u) => u.kind === "section").map((u) => u.data),
    nextMeeting: units.find((u) => u.kind === "next")?.data ?? "",
    estimatedHeight: units.reduce((s, u) => s + (u.kind === "section" ? estimateMeetingSectionHeight(u.data) : estimateMeetingBlockHeight(u)), 0)
  }));
}

// Render one paginated meeting page (subset of the full structure).
function meetingBlocksMarkup(meet) {
  const html = [];
  if (meet.meta.length) {
    html.push(`<div class="ache-meeting-meta">${meet.meta.map((m) => `<span><b>${escapeHtml(m.label)}</b>${escapeHtml(m.value)}</span>`).join("")}</div>`);
  }
  for (const sec of meet.sections) {
    if (sec.title !== "__preface__" && !sec.continuation) {
      html.push(`<h3 class="ache-meeting-section">${escapeHtml(sec.title)}</h3>`);
    }
    let items = [];
    const flush = () => {
      if (items.length) {
        html.push(`<ul class="ache-meeting-list">${items.join("")}</ul>`);
        items = [];
      }
    };
    for (const it of sec.items) {
      if (it.kind === "subhead") {
        // 讨论子标题（"上周线上问题复盘"）：跳出列表，独立小标题。
        flush();
        html.push(`<h4 class="ache-meeting-subhead">${escapeHtml(it.text)}</h4>`);
        continue;
      }
      const toneClass = `ache-meeting-tone-${it.tone}`;
      if (it.kind === "numbered") {
        const marker = it.tone === "decision"
          ? `<span class="ache-meeting-num ache-meeting-num--decision">${it.num}</span>`
          : it.tone === "todo"
            ? `<span class="ache-meeting-check"><svg viewBox="0 0 20 20" width="1em" height="1em" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 10.5 L9 13.5 L15 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
            : `<span class="ache-meeting-num">${it.num}</span>`;
        items.push(`<li class="ache-meeting-li ${toneClass}">${marker}<span class="ache-meeting-text">${highlightMeetingText(it.text)}</span></li>`);
      } else if (it.kind === "bullet") {
        items.push(`<li class="ache-meeting-li ache-meeting-li--bullet ${toneClass}"><span class="ache-meeting-dash"></span><span class="ache-meeting-text">${highlightMeetingText(it.text)}</span></li>`);
      } else {
        items.push(`<li class="ache-meeting-li ache-meeting-li--plain ${toneClass}"><span class="ache-meeting-text">${highlightMeetingText(it.text)}</span></li>`);
      }
    }
    flush();
  }
  if (meet.nextMeeting) {
    html.push(`<div class="ache-meeting-next"><span class="ache-meeting-next-tag">下次</span><span class="ache-meeting-next-text">${escapeHtml(meet.nextMeeting)}</span></div>`);
  }
  return html.join("");
}

export function planTextComposition(value, route, bodyAssets = []) {
  const chunks = paginateText(value, route, bodyAssets);
  const knowledge = route === "K" ? structureKnowledgeText(value) : null;
  return {
    route,
    recipe: route === "K" && knowledge?.mode === "sequence"
      ? "knowledge-sequence-journal"
      : route === "M"
        ? "meeting-editorial-ledger"
        : route === "L"
          ? "longform-balanced-reading"
          : "text-journal",
    pageCount: chunks.length,
    chunks,
    knowledge,
    preflight: {
      semanticUnitsIntact: route !== "K" || knowledge?.mode !== "sequence" || knowledge.steps.length >= 2,
      targetFillRange: [0.62, 0.88],
      bottomDeadZoneMaximum: 0.25,
      illustrationGroupsMaximum: Math.ceil(Math.max(1, chunks.length) / 3)
    }
  };
}

function paginateLongform(value, firstCapacity, laterCapacity) {
  const paragraphs = String(value ?? "")
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n{2,}/u)
    .filter((item) => item.length > 0);
  if (paragraphs.length === 0) return [""];

  // 均衡分页：先按常规容量估总页数，再把总字数均摊到每一页——
  // 避免"第一页塞满、最后一页只有两行"的失衡排版。贴纸住在文字
  // 之后的留白区，不占文字容量，所以各页容量一致即可。
  const totalWeight = characterWeight(paragraphs.join(""));
  const baseCapacity = laterCapacity;
  const pageCount = Math.max(1, Math.ceil(totalWeight / baseCapacity));
  const balanced = Math.min(baseCapacity, Math.max(360, (totalWeight / pageCount) * 1.06));
  firstCapacity = balanced;
  laterCapacity = balanced;

  // A semantic unit must stay substantially smaller than a page. Otherwise a
  // single long paragraph becomes one almost-page-sized record and strands a
  // short opening paragraph on an empty page.
  const unitCapacity = Math.min(150, firstCapacity, laterCapacity);
  const records = paragraphs.flatMap((paragraph, paragraphIndex) => {
    const semanticPieces = paragraph.split(/(?<=[。！？!?；;])/u).filter(Boolean);
    const chunks = [];
    let current = "";
    for (const piece of semanticPieces) {
      if (characterWeight(piece) > unitCapacity) {
        if (current) chunks.push(current);
        chunks.push(...splitLongUnitExact(piece, unitCapacity));
        current = "";
      } else if (current && characterWeight(`${current}${piece}`) > unitCapacity) {
        chunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
    if (current) chunks.push(current);
    return chunks.map((text) => ({paragraphIndex, text}));
  });
  const serialize = (items) => {
    const groups = [];
    for (const item of items) {
      const previous = groups.at(-1);
      if (previous?.paragraphIndex === item.paragraphIndex) previous.text += item.text;
      else groups.push({...item});
    }
    return groups.map((item) => item.text).join("\n\n");
  };

  const pages = [];
  let current = [];
  for (const record of records) {
    const capacity = pages.length === 0 ? firstCapacity : laterCapacity;
    const candidate = serialize([...current, record]);
    if (current.length > 0 && characterWeight(candidate) > capacity) {
      pages.push(serialize(current));
      current = [record];
    } else {
      current.push(record);
    }
  }
  if (current.length > 0) pages.push(serialize(current));
  return pages;
}

function paginateText(value, route, bodyAssets = []) {
  const firstPageHasVisual = bodyAssets.length > 0;
  const firstCapacity = textCapacity(route, firstPageHasVisual);
  const laterCapacity = textCapacity(route, false);
  if (route === "L") return paginateLongform(value, firstCapacity, laterCapacity);
  const rawUnits = sentences(value);
  if (rawUnits.length === 0) return [""];
  const units = rawUnits.flatMap((unit) => splitLongUnit(unit, laterCapacity));
  const pages = [];
  let current = [];
  let pageIndex = 0;
  for (const unit of units) {
    const capacity = pageIndex === 0 ? firstCapacity : laterCapacity;
    const maxUnits = Number.POSITIVE_INFINITY;
    const candidate = [...current, unit].join("\n\n");
    if (current.length > 0 && (characterWeight(candidate) > capacity || current.length >= maxUnits)) {
      pages.push(current.join("\n\n"));
      current = [unit];
      pageIndex += 1;
    } else {
      current.push(unit);
    }
  }
  if (current.length > 0) pages.push(current.join("\n\n"));

  if (pages.length > 1) {
    const last = pages.at(-1);
    const previous = pages.at(-2);
    if (characterWeight(last) < laterCapacity * 0.28) {
      const previousUnits = sentences(previous);
      const moved = previousUnits.pop();
      if (moved && characterWeight(`${moved}\n\n${last}`) <= laterCapacity) {
        pages[pages.length - 2] = previousUnits.join("\n\n");
        pages[pages.length - 1] = `${moved}\n\n${last}`;
        if (!pages[pages.length - 2].trim()) pages.splice(pages.length - 2, 1);
      }
    }
  }
  if (route === "M" && pages.length > 1) {
    for (let index = 0; index < pages.length - 1; index += 1) {
      const left = sentences(pages[index]);
      const right = sentences(pages[index + 1]);
      while (left.length > 1 && characterWeight(left.join("\n\n")) > characterWeight(right.join("\n\n")) * 1.12) {
        const moved = left.at(-1);
        const nextRight = [moved, ...right];
        if (characterWeight(nextRight.join("\n\n")) > laterCapacity * 1.08) break;
        left.pop();
        right.unshift(moved);
      }
      pages[index] = left.join("\n\n");
      pages[index + 1] = right.join("\n\n");
    }
  }
  return pages;
}

function noteLines(text, count = 3) {
  const values = sentences(text);
  return values.length > 0 ? values.slice(0, count) : ["今天也被好好收进来了。"];
}

function titleClass(value) {
  const length = [...String(value ?? "").trim()].length;
  if (length >= 16) return "ache-title--long";
  if (length >= 11) return "ache-title--medium";
  return "ache-title--short";
}

function titleMarkup(value) {
  return escapeHtml(String(value ?? "").trim());
}

function imageMarkup(asset, className = "") {
  if (!asset?.src) return `<div class="ache-empty-visual">这一页的画面还在路上</div>`;
  const fit = asset.allowCrop === true && ["cover", "cover-allowed"].includes(asset.fit ?? asset.fitPolicy)
    ? "cover"
    : "contain";
  const ratio = asset.aspectClass ?? "unknown";
  const width = Number(asset.intrinsicWidth ?? asset.targetWidth ?? 0);
  const height = Number(asset.intrinsicHeight ?? asset.targetHeight ?? 0);
  const dimensions = width && height ? ` width="${width}" height="${height}"` : "";
  const cropSafety = fit === "cover" && asset.safeSubjectBounds ? "declared" : "not-applicable";
  return `<img class="${escapeHtml(className)} ache-image-${escapeHtml(ratio)}" src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.alt ?? "")}"${dimensions} data-required-image data-image-fit="${fit}" data-crop-safe-subject="${cropSafety}" data-asset-role="${escapeHtml(asset.role ?? "body-visual")}" data-aspect-class="${escapeHtml(ratio)}" data-background-mode="${escapeHtml(asset.backgroundMode ?? "opaque")}" data-transparency-status="${escapeHtml(asset.transparencyStatus ?? "unknown")}" data-detected-format="${escapeHtml(asset.detectedFormat ?? "unknown")}">`;
}

function assetFrameAttributes(asset = {}) {
  const width = Number(asset.frameContentWidth ?? asset.targetWidth ?? asset.intrinsicWidth ?? 0);
  const height = Number(asset.frameContentHeight ?? asset.targetHeight ?? asset.intrinsicHeight ?? 0);
  const edge = asset.edgeTreatment ?? (asset.role === "body-photo" ? "torn-paper-frame" : "flush");
  const ratio = width && height ? `${width} / ${height}` : "auto";
  const matched = asset.frameFitStatus ?? (width && height ? "matched" : "unknown");
  return {
    className: `ache-frame ache-frame-${edge}`,
    attributes: `data-edge-treatment="${escapeHtml(edge)}" data-frame-fit="${escapeHtml(matched)}" style="--ache-media-ratio:${escapeHtml(ratio)}"`
  };
}

function framedAssetMarkup(asset, {inline = false} = {}) {
  const frame = assetFrameAttributes(asset);
  const isTransparent = ["transparent-raster", "svg-vector"].includes(asset?.backgroundMode);
  const classes = `${frame.className}${inline ? " ache-frame-inline" : ""}${isTransparent ? " ache-frame-transparent" : ""}`;
  return `<div class="${classes}" ${frame.attributes}>${imageMarkup(asset)}</div>`;
}

function themeAttributes(subject = {}) {
  const theme = resolveThemePalette({
    styleId: subject.styleId ?? subject.style?.id ?? "02-snow-pastel",
    palette: subject.palette ?? null,
    source: subject.paletteSource ?? null
  });
  return `data-theme-source="${escapeHtml(theme.source)}" data-style-id="${escapeHtml(theme.styleId)}" style="${escapeHtml(themeStyleAttribute(theme))}"`;
}

// ——————————————————————————————————————————————————————————————
// 文字页密度 = 按"预估渲染高度"选字号档位，而不是按字符数。
// 原则：优先大字号（阅读舒适、页面饱满，填充率 62–88%），装不下才
// 降档；每档预算 = 正文可用高度 − 该档留白区最小高度 − 安全边。
// 这样"字符密度"和"眼睛看到的填充率"永远一致。
// ——————————————————————————————————————————————————————————————
const TEXT_PAGE_BODY_PX = 720;
// 与 page-system.css 的 .ache-sticker-zone--* min-height 对齐：
// 留白区只需容下"一枚贴着文字末尾的小贴纸"，不为它预留荒原。
const ZONE_MIN_PX = {short: 185, regular: 132, tight: 98};

// [每行字符权重, 行高 px] —— 按 760px 页宽（正文约 660px）标定。
// [每行字符权重, 行高 px, 段落间距 px] —— 按 page-system.css 在 760px
// 页宽（1cqw=7.6px，正文净宽 ≈660px）下的真实计算值标定：
//   short  font 19.38px/lh 1.72 → 33.3px/行，34 字/行，段距 .85em=16.5
//   regular font 16.57px/lh 1.68 → 27.8px/行，40 字/行，段距 14.1
//   dense  font 14.59px/lh 1.58 → 23.1px/行，45 字/行，段距 12.4
// M 条目有标记列占宽（≈32px），每行字数相应减少；K 步骤有序号列。
// 旧值按"想象字号"标定，比真实渲染高 ~1.5×，导致页面永远降档、
// 填充率只有 50% 上下——改后估算与眼睛看到的填充率一致。
const DENSITY_TYPE_SCALE = {
  L: {short: [34, 33.3, 16.5], regular: [40, 27.8, 14.1], dense: [45, 23.1, 12.4]},
  K: {short: [32, 33.3, 16.5], regular: [37, 27.8, 14.1], dense: [42, 23.1, 12.4]},
  M: {short: [35, 29.7, 14.9], regular: [41, 24.5, 12.6], dense: [43, 22.5, 12.0]}
};

function estimateTextHeight(route, text, densityKey) {
  const [perLine, lh, gap] = (DENSITY_TYPE_SCALE[route] ?? DENSITY_TYPE_SCALE.L)[densityKey];
  if (route === "K") {
    const k = structureKnowledgeText(text);
    if (k.mode === "sequence") {
      const intro = meetingLines(k.intro, perLine) * lh + 36;
      const steps = k.steps.reduce((sum, step) => sum + meetingLines(step, perLine - 5) * lh + 26, 0);
      const reflection = k.reflection ? lh + 26 : 0;
      return intro + steps + reflection + 24;
    }
  }
  const paras = String(text ?? "").split(/\n{2,}/u).filter(Boolean);
  return paras.reduce((sum, p) => sum + meetingLines(p, perLine) * lh + gap, 14);
}

// 返回 {density, room}：density 决定字号，room 决定留白区/贴纸档位。
function planTextPageDensity(route, text, preEstimated = null) {
  let density;
  let textHeight;
  if (preEstimated != null) {
    // M 页：语义分页按常规字号估算高度。内容轻的页升 short 大字号
    // 让文字先填满页面（会议页主角是结构化文字，贴纸只是收尾小
    // 点缀）。阈值按真实渲染反推：short 真实高 ≈ 估算 ×1.35，须
    // ≤ 正文高 − short 留白区最小高 − 安全边 = 720−185−12 = 523；
    // regular 估算即真实高，须 ≤ 720−132−12 = 576。
    density = preEstimated <= 390 ? "short" : preEstimated <= 570 ? "regular" : "dense";
    textHeight = preEstimated;
  } else {
    density = "dense";
    for (const key of ["short", "regular", "dense"]) {
      const zoneMin = key === "short" ? ZONE_MIN_PX.short : key === "regular" ? ZONE_MIN_PX.regular : ZONE_MIN_PX.tight;
      if (estimateTextHeight(route, text, key) <= TEXT_PAGE_BODY_PX - zoneMin - 12) {
        density = key;
        break;
      }
    }
    textHeight = estimateTextHeight(route, text, density);
  }
  const leftover = TEXT_PAGE_BODY_PX - textHeight;
  const room = leftover >= 200 ? "roomy" : leftover >= 140 ? "regular" : "tight";
  return {density, room, leftover};
}

function adaptiveVisualLayout(route, assets, requested) {
  if (requested && requested !== "auto") return requested;
  if (route === "S") return assets.length === 3 ? "vertical-relay" : assets.length === 2 ? "cinematic-pair" : "single-scene";
  if (assets.length === 1) return "single-journal";
  const ratios = assets.map((asset) => asset.aspectClass ?? "unknown");
  const landscapeCount = ratios.filter((value) => value.startsWith("landscape")).length;
  const portraitCount = ratios.filter((value) => value.startsWith("portrait")).length;
  if (assets.length === 2) return landscapeCount === 2 ? "cinematic-pair" : "scrapbook-pair";
  if (assets.length === 3) {
    if (landscapeCount >= 2) return "vertical-relay";
    if (portraitCount >= 2) return "journal-columns";
    return "journal-stagger";
  }
  return "evidence-strip";
}

function pageHeaderMarkup(episode, {pageIndex = 0, pageCount = 1, role = "body"} = {}) {
  const continuation = pageIndex > 0 ? " ache-page-head--continuation" : "";
  const count = pageCount > 1 ? ` · ${pageIndex + 1}/${pageCount}` : "";
  return `<header class="ache-page-head${continuation}">
    <p class="ache-kicker">${escapeHtml(routeLabel(episode.route))} · ${escapeHtml(readableDate(episode.displayDate))}${count}</p>
    <h2 class="ache-title ${titleClass(episode.title)}">${titleMarkup(episode.title)}</h2>
    ${role === "cover" ? '<div class="ache-title-mark"></div>' : ""}
  </header>`;
}

function footerMarkup({episode, pageNumber, pageRole}) {
  return `<footer class="ache-footer">
    <span>${escapeHtml(pageRole)}</span>
    <span>${escapeHtml(readableDate(episode.displayDate))} · ${String(pageNumber).padStart(2, "0")}</span>
  </footer>`;
}

function coverSheet(episode, asset, pageNumber) {
  const visualState = asset ? "has-visual" : "no-visual";
  return `<div class="ache-page-shell">
    <section class="ache-page ache-cover-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="cover" data-route="${escapeHtml(episode.route)}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {role: "cover"})}
        <main class="ache-cover-content ${visualState}" data-layout-zone="cover-background">
          <div class="ache-cover-visual">${imageMarkup(asset)}</div>
          <span class="ache-cover-stitch" aria-hidden="true"></span>
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "章节封面"})}
      </div>
    </section>
  </div>`;
}

function visualBodySheet(episode, assets, pageNumber, notes, pageIndex, pageCount, visualLayout) {
  const safeAssets = assets.slice(0, 3);
  const resolvedLayout = adaptiveVisualLayout(episode.route, safeAssets, visualLayout);
  return `<div class="ache-page-shell">
    <section class="ache-page ache-visual-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="body" data-route="${escapeHtml(episode.route)}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-visual-content ache-visual-layout-${escapeHtml(resolvedLayout)}" data-layout-zone="visual-body" data-visual-layout="${escapeHtml(resolvedLayout)}">
          <div class="ache-panel-stack ache-panel-count-${safeAssets.length}">
            ${safeAssets.map((asset, index) => {
              const frame = assetFrameAttributes(asset);
              return `<figure class="ache-panel ache-panel-${index + 1} ${frame.className}" ${frame.attributes}>${imageMarkup(asset)}</figure>`;
            }).join("")}
          </div>
          <div class="ache-note-strip">
            ${notes.slice(0, Math.max(1, safeAssets.length)).map((note, index) => `<p><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(note)}</p>`).join("")}
          </div>
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "正文"})}
      </div>
    </section>
  </div>`;
}

function paragraphMarkup(text, route) {
  if (route === "K") {
    const structured = structureKnowledgeText(text);
    if (structured.mode === "sequence") {
      return `<div class="ache-knowledge-intro"><span>看见的方法</span><p>${escapeHtml(structured.intro)}。</p></div>
        <ol class="ache-knowledge-steps">${structured.steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(step)}</p></li>`).join("")}</ol>
        ${structured.reflection ? `<p class="ache-knowledge-reflection">${escapeHtml(structured.reflection)}。</p>` : ""}`;
    }
  }
  if (route === "L") {
    return String(text ?? "")
      .split(/\n{2,}/u)
      .filter((unit) => unit.length > 0)
      .map((unit) => {
        const trimmed = unit.trim();
        const isPullquote = [...trimmed].length <= 64 && /^(?:[“"'‘]).*(?:[”"'’])$/su.test(trimmed);
        const className = isPullquote ? ' class="ache-longform-pullquote"' : "";
        return `<p${className}>${escapeHtml(unit).replaceAll("\n", "<br>")}</p>`;
      })
      .join("");
  }
  const units = sentences(text);
  return units.map((unit) => `<p>${escapeHtml(unit)}</p>`).join("");
}

// ——————————————————————————————————————————————————————————————
// 留白区贴纸 (whitespace-zone sticker): 文字先按 100% 宽度规律排版，
// 装饰（照片/SVG）只放在正文之后的"留白区"里。留白区是排版流中的
// 真实空间（flex 子项），不是绝对定位的浮层——所以贴纸在原理上
// 不可能遮住文字，也不可能飞出页面。尺寸与留白区高度随页面文字
// 密度自适应：字少贴大、字多贴小。
// ——————————————————————————————————————————————————————————————

function wrapTextOnly(textMarkup) {
  return `<div class="ache-text-full">${textMarkup}</div>`;
}

// Tiny string hash for deterministic sticker variation (corner + tilt).
function stickerRoll(seedSource) {
  let h = 2166136261 >>> 0;
  const str = String(seedSource);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// Photo sticker: white-frame taped polaroid living inside the zone.
// 贴纸锚定在留白区上部——紧挨文字结束的位置，像手帐里写完字
// 随手贴上去的贴纸；左右由种子决定。绝不飘到页面底部角落。
// caption：可选的手写小图注（如会议页"现场记录"），让内容轻的
// 照片读起来是"有意保留的现场原件"，而不是一张空白卡片。
function makeZonePhotoSticker(asset, variant, deg, caption = "") {
  const captionHtml = caption ? `<figcaption class="ache-zone-sticker-caption">${escapeHtml(caption)}</figcaption>` : "";
  return `<figure class="ache-zone-sticker ache-zone-sticker--photo ache-zone-sticker--${variant}" style="--sticker-tilt:${deg}deg" data-supporting-type="zone-photo"><div class="ache-taped-photo-frame">${imageMarkup(asset)}</div>${captionHtml}</figure>`;
}

// SVG sticker: transparent hand-drawn vignette + washi tape, inside the zone.
function makeZoneSvgSticker(svg, variant, deg, mini = false) {
  return `<figure class="ache-zone-sticker ache-zone-sticker--svg${mini ? " ache-zone-sticker--mini" : ""} ache-zone-sticker--${variant}" style="--sticker-tilt:${deg}deg" data-supporting-type="zone-svg">${svg}</figure>`;
}

// The whitespace zone after the text block. Real layout space (flex item),
// so the sticker inside it can never overlap the text above it.
// roomKey: roomy / regular / tight —— 由文字预估高度推导，贴纸尺寸随它缩放。
function stickerZoneMarkup(stickerInner, roomKey) {
  return `<div class="ache-sticker-zone ache-sticker-zone--${roomKey}" data-layout-zone="sticker-whitespace">${stickerInner}</div>`;
}

function zoneStickerVariant(seed, densityKey) {
  const roll = stickerRoll(seed);
  const side = roll < 0.5 ? "r" : "l";
  return {
    // 每页一枚贴纸，贴着文字末尾（留白区上部）——写完字随手一贴，
    // 不再配 mini 陪伴贴纸（散点破坏构图）。
    variant: side === "r" ? "mr" : "ml",
    deg: (stickerRoll(`${seed}|tilt`) * 5.5 - 2.75).toFixed(1),
    svgDensity: densityKey === "short" ? "sparse" : densityKey === "dense" ? "dense" : "normal"
  };
}

function episodeSvgSticker(episode, pageIndex, densityKey) {
  const theme = resolveThemePalette({
    styleId: episode.styleId ?? episode.style?.id ?? "02-snow-pastel",
    palette: episode.palette ?? null,
    source: episode.paletteSource ?? null
  });
  return interludeSvg({
    episodeId: episode.id ?? episode.title ?? "ep",
    pageIndex,
    colors: theme.colors,
    density: densityKey === "short" ? "sparse" : densityKey === "dense" ? "dense" : "normal",
    route: episode.route
  });
}

function textBodySheet(episode, text, pageNumber, pageIndex, pageCount, asset = null) {
  const kmlRoutes = new Set(["K", "M", "L"]);
  const isDecoRoute = kmlRoutes.has(episode.route);
  const recipe = planTextComposition(
    episode.text,
    episode.route,
    episode.visualAssets ?? episode.pageAssets ?? []
  ).recipe;
  const {density, room, leftover} = planTextPageDensity(episode.route, text);
  const densityKey = density;

  // 统一装饰策略：K/L 文字页在正文之后的留白区放一枚贴纸，贴着
  // 文字末尾。有配图素材且空间够用照片贴纸（胶带拍立得），否则用
  // 手绘 SVG 贴纸。文字始终 100% 宽度规律排版，贴纸绝不进入文字
  // 区域；留白太窄（<100px）时宁可不贴，保留干净的页脚呼吸。
  let zoneHtml = "";
  let supportingPlacement = "none";
  if (isDecoRoute && leftover >= 100) {
    const seed = `${episode.id ?? episode.title ?? "ep"}|${pageIndex}|zone`;
    const {variant, deg} = zoneStickerVariant(seed, densityKey);
    if (asset && leftover >= 140) {
      zoneHtml = stickerZoneMarkup(makeZonePhotoSticker(asset, variant, deg), room);
    } else {
      zoneHtml = stickerZoneMarkup(makeZoneSvgSticker(episodeSvgSticker(episode, pageIndex, densityKey), variant, deg), room);
    }
    supportingPlacement = "whitespace-zone";
  }

  const extraSectionClass = zoneHtml ? " ache-text-page--with-zone-sticker" : "";
  const textHtml = wrapTextOnly(paragraphMarkup(text, episode.route));
  return `<div class="ache-page-shell">
    <section class="ache-page ache-text-page ache-route-${escapeHtml(episode.route.toLowerCase())}${extraSectionClass} ache-density-${densityKey}" data-page-role="body" data-route="${escapeHtml(episode.route)}" data-supporting-visual-placement="${supportingPlacement}" data-density="${densityKey}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-text-layout ache-text-recipe-${escapeHtml(recipe)}" data-layout-zone="text-body" data-layout-content>
          ${textHtml}
          ${zoneHtml}
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "正文"})}
      </div>
    </section>
  </div>`;
}

// M 会议页：语义分页后的一个页面（结构块子集）+ 留白区装饰。
// 会议页文字优先、轻配图：重要内容永远排版成结构化文字，图片
// 资产最多只做一枚贴着文字末尾的小照片贴纸，绝不做"附件大卡"。
function meetingBodySheet(episode, meetPage, pageNumber, pageIndex, pageCount, assets = {}) {
  const {density, room, leftover} = planTextPageDensity("M", null, meetPage.estimatedHeight);
  const seed = `${episode.id ?? episode.title ?? "ep"}|${pageIndex}|zone`;
  const {variant, deg} = zoneStickerVariant(seed, density);

  let zoneInner = "";
  let supportingPlacement = "none";
  if (leftover >= 100) {
    if (assets.sticker && leftover >= 140) {
      zoneInner = makeZonePhotoSticker(assets.sticker, variant, deg, "现场记录");
    } else {
      zoneInner = makeZoneSvgSticker(episodeSvgSticker(episode, pageIndex, density), variant, deg);
    }
    supportingPlacement = "whitespace-zone";
  }
  const zoneHtml = zoneInner ? stickerZoneMarkup(zoneInner, room) : "";
  const extraSectionClass = zoneHtml ? " ache-text-page--with-zone-sticker" : "";

  return `<div class="ache-page-shell">
    <section class="ache-page ache-text-page ache-route-m${extraSectionClass} ache-density-${density}" data-page-role="body" data-route="M" data-supporting-visual-placement="${supportingPlacement}" data-density="${density}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-text-layout ache-text-recipe-meeting-editorial-ledger" data-layout-zone="text-body" data-layout-content>
          ${wrapTextOnly(meetingBlocksMarkup(meetPage))}
          ${zoneHtml}
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "正文"})}
      </div>
    </section>
  </div>`;
}

export function renderEpisodeSheets(episode, startPageNumber = 1) {
  const assets = episode.visualAssets ?? episode.pageAssets ?? [];
  const precomposedPages = assets.filter((asset) => asset.kind === "rendered-page");
  if (precomposedPages.length > 0) {
    return {
      html: precomposedPages.map((asset, index) => `<div class="ache-page-shell">
        <section class="ache-page ache-precomposed-page" data-page-role="${index === 0 ? "cover" : "body"}" data-route="${escapeHtml(episode.route)}" ${themeAttributes(episode)}>
          ${imageMarkup(asset)}
        </section>
      </div>`).join("\n"),
      pageCount: precomposedPages.length
    };
  }

  const declaredCoverAsset = assets.find((asset) => asset.role === "cover-visual") ?? null;
  const coverAsset = declaredCoverAsset ?? (episode.route === "P" ? null : assets[0] ?? null);
  const bodyAssets = assets.filter((asset) => asset !== coverAsset && asset.role !== "cover-visual");
  const pages = [coverSheet(episode, coverAsset, startPageNumber)];
  let pageNumber = startPageNumber + 1;

  if (["S", "P"].includes(episode.route)) {
    const usable = bodyAssets.length > 0
      ? bodyAssets
      : episode.route === "P" && coverAsset
        ? [coverAsset]
        : [];
    if (usable.length === 0) {
      pages.push(textBodySheet(episode, episode.text, pageNumber, 0, 1));
      return {html: pages.join("\n"), pageCount: pages.length};
    }
    const groups = [];
    for (let index = 0; index < usable.length; index += 3) groups.push(usable.slice(index, index + 3));
    const notes = noteLines(episode.text, Math.max(3, usable.length));
    groups.forEach((group, index) => {
      const visualLayout = episode.visualLayout ?? "auto";
      pages.push(visualBodySheet(
        episode,
        group,
        pageNumber + index,
        notes.slice(index * 3, index * 3 + 3),
        index,
        groups.length,
        visualLayout
      ));
    });
    return {html: pages.join("\n"), pageCount: pages.length};
  }

  // M 会议：语义块分页（标题不孤儿、决议不与标题分家）。
  // 文字优先、轻配图：会议图片最多挑一张，贴在留白最多的那页
  // （没地方就不贴，不硬塞）；其余图片资产不上页——会议纪要里
  // 的重要内容必须排版成文字，而不是当图片摆出来。
  if (episode.route === "M") {
    const meet = structureMeetingText(episode.text);
    const meetingPages = paginateMeetingStructure(meet);
    const stickerAsset = bodyAssets[0] ?? null;

    // 照片贴纸落在留白最多的页（留白 <150px 的页不贴，避免挤压）。
    let stickerIdx = -1;
    if (stickerAsset) {
      let bestLeft = 150;
      meetingPages.forEach((mp, i) => {
        const left = TEXT_PAGE_BODY_PX - mp.estimatedHeight;
        if (left > bestLeft) {
          bestLeft = left;
          stickerIdx = i;
        }
      });
    }

    meetingPages.forEach((mp, i) => {
      pages.push(meetingBodySheet(
        episode,
        mp,
        pageNumber + i,
        i,
        meetingPages.length,
        {sticker: i === stickerIdx ? stickerAsset : null}
      ));
    });
    return {html: pages.join("\n"), pageCount: pages.length};
  }

  const textPlan = planTextComposition(episode.text, episode.route, bodyAssets);
  const textChunks = textPlan.chunks;
  textChunks.forEach((text, index) => {
    pages.push(textBodySheet(
      episode,
      text,
      pageNumber + index,
      index,
      textChunks.length,
      bodyAssets[index] ?? null
    ));
  });
  return {html: pages.join("\n"), pageCount: pages.length};
}

export function renderMonthlyDocument(book, volume) {
  let nextPageNumber = volume.coverAsset ? 2 : 1;
  const episodes = volume.episodes.map((episode) => {
    const rendered = renderEpisodeSheets(episode, nextPageNumber);
    nextPageNumber += rendered.pageCount;
    return `<article class="ache-episode" data-episode-id="${escapeHtml(episode.episodeId)}">
      <div class="ache-episode-label"><span>第 ${String(episode.episodeNumber).padStart(2, "0")} 章</span><span>${escapeHtml(routeLabel(episode.route))}</span></div>
      <h2 class="ache-sr-only">${escapeHtml(episode.title)}</h2>
      ${rendered.html}
      ${episode.visualStatus === "visual-pending" ? '<p class="ache-pending">画面待补，文字和页码已经留下。</p>' : ""}
    </article>`;
  }).join("\n");
  const css = readFileSync(pageCssPath, "utf8");
  const monthlyCover = volume.coverAsset ? `<div class="ache-monthly-cover-wrap">
    <section class="ache-page ache-monthly-cover-page" data-page-role="monthly-cover" ${themeAttributes(volume)}>
      <div class="ache-monthly-cover-image">${imageMarkup(volume.coverAsset)}</div>
      <div class="ache-monthly-cover-type"><p>${escapeHtml(book.title)}</p><h1>${escapeHtml(readableMonth(volume.month))}</h1><span>${volume.episodes.length} 章 · 持续生长中</span></div>
    </section>
  </div>` : "";
  const runtimeGuard = `<script data-ache-layout-guard="1">
  (() => {
    const inspect = () => {
      const failures = [];
      document.querySelectorAll('.ache-page').forEach((page, index) => {
        if (page.scrollWidth > page.clientWidth + 1 || page.scrollHeight > page.clientHeight + 1) failures.push('overflow:' + (index + 1));
      });
      if (document.querySelector('[data-frame-fit="mismatch"],[data-frame-fit="unknown"]')) failures.push('frame-fit');
      if (document.querySelector('[data-asset-role="explanatory-vignette"]:not([data-transparency-status="verified-transparent"]),[data-asset-role="decorative-component"]:not([data-transparency-status="verified-transparent"])')) failures.push('unverified-transparent-component');
      if (document.querySelector('[data-image-fit="cover"]:not([data-crop-safe-subject="declared"])')) failures.push('unsafe-crop');
      // 贴纸几何自检：贴纸只允许待在正文之后的留白区里——
      // 不得压到文字区域（10px 容差覆盖旋转外接盒），不得超出页面边界。
      document.querySelectorAll('.ache-zone-sticker').forEach((sticker) => {
        const page = sticker.closest('.ache-page');
        if (!page) return;
        const rect = sticker.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        if (rect.left < pageRect.left - 1 || rect.right > pageRect.right + 1
          || rect.top < pageRect.top - 1 || rect.bottom > pageRect.bottom + 1) {
          failures.push('sticker-off-page');
        }
        const textEl = sticker.closest('.ache-text-layout')?.querySelector('.ache-text-full');
        if (textEl) {
          const textRect = textEl.getBoundingClientRect();
          const overlapX = Math.min(rect.right, textRect.right) - Math.max(rect.left, textRect.left);
          const overlapY = Math.min(rect.bottom, textRect.bottom) - Math.max(rect.top, textRect.top);
          if (overlapX > 10 && overlapY > 10) failures.push('sticker-covers-text');
        }
      });
      document.documentElement.dataset.acheLayoutStatus = failures.length ? 'FAIL' : 'PASS';
      document.documentElement.dataset.acheLayoutFailures = failures.join(',');
      if (failures.length) console.error('[ache-layout-guard]', failures.join(','));
    };
    if (document.readyState === 'complete') requestAnimationFrame(inspect);
    else window.addEventListener('load', () => requestAnimationFrame(inspect), {once: true});
  })();
  </script>`;
  return `<!doctype html>
<html lang="zh-CN" data-ache-layout-status="PENDING">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="ache-design-system" content="${DESIGN_SYSTEM_VERSION}">
  <meta name="ache-renderer" content="${MONTHLY_RENDERER_VERSION}">
  <title>${escapeHtml(book.title)} · ${escapeHtml(readableMonth(volume.month))}</title>
  <style>${css}</style>
</head>
<body>
  <main class="ache-volume">
    <header class="ache-volume-head"><h1>${escapeHtml(readableMonth(volume.month))}</h1><p>${escapeHtml(book.title)} · ${volume.episodes.length} 章</p></header>
    ${monthlyCover}
    ${episodes}
  </main>
  ${runtimeGuard}
</body>
</html>`;
}

export async function installRendererAssets(editionDirectory) {
  const target = path.join(editionDirectory, "assets", "system");
  await mkdir(target, {recursive: true});
  await Promise.all([
    copyFile(path.join(fontDirectory, "LXGWWenKaiGBScreen.ttf"), path.join(target, "LXGWWenKaiGBScreen.ttf")),
    copyFile(path.join(fontDirectory, "SmileySans-Oblique.woff2"), path.join(target, "SmileySans-Oblique.woff2")),
    copyFile(path.join(fontDirectory, "FONT-LICENSES.md"), path.join(target, "FONT-LICENSES.md"))
  ]);
}
