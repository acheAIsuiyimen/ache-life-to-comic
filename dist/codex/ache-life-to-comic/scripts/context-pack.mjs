export const CONTEXT_PACK_VERSION = "ache-context/1.0.0";

const DEFAULT_LIMITS = {
  maxChars: 12000,
  maxRecent: 5,
  maxRelevant: 3,
  maxPinned: 20,
  maxPending: 10
};

function charCount(value) {
  return Array.from(JSON.stringify(value ?? null)).length;
}

function normalizedRecords(records = []) {
  return records.filter(Boolean).map((record) => ({
    id: String(record.id ?? ""),
    title: String(record.title ?? ""),
    summary: String(record.summary ?? ""),
    reason: String(record.reason ?? ""),
    tags: Array.isArray(record.tags) ? record.tags.slice(0, 8) : [],
    recordedAt: record.recordedAt ?? null
  }));
}

function appendBounded(target, key, candidates, maxItems, budget) {
  target[key] = [];
  let omitted = 0;
  for (const candidate of candidates.slice(0, maxItems)) {
    const next = [...target[key], candidate];
    const trial = {...target, [key]: next};
    if (charCount(trial) > budget) {
      omitted += 1;
      continue;
    }
    target[key] = next;
  }
  omitted += Math.max(0, candidates.length - maxItems);
  return omitted;
}

export function buildContextPack(input, limits = {}) {
  const applied = {...DEFAULT_LIMITS, ...limits};
  const contentBudget = Math.max(1000, applied.maxChars - 512);
  const profile = {
    bookId: input.profile?.bookId ?? null,
    title: input.profile?.title ?? null,
    style: input.profile?.style ?? null,
    character: input.profile?.character ?? null,
    publication: input.profile?.publication ?? null,
    continuity: input.profile?.continuity ?? "weak",
    forbidden: input.profile?.forbidden ?? []
  };
  const pack = {
    version: CONTEXT_PACK_VERSION,
    budget: applied,
    profile,
    currentVolume: input.currentVolume ?? null,
    pinned: [],
    recentSummaries: [],
    relevantRecords: [],
    pendingTasks: [],
    selectionLog: [],
    omissions: {}
  };

  const groups = [
    ["pinned", normalizedRecords(input.pinned), applied.maxPinned, "user-pinned"],
    ["recentSummaries", normalizedRecords(input.recentSummaries), applied.maxRecent, "latest-form-summary"],
    ["relevantRecords", normalizedRecords(input.relevantRecords), applied.maxRelevant, "explicit-tag-or-direct-relevance"],
    ["pendingTasks", normalizedRecords(input.pendingTasks), applied.maxPending, "unfinished-visual-or-sync"]
  ];

  for (const [key, records, max, reason] of groups) {
    const omitted = appendBounded(pack, key, records, max, contentBudget);
    pack.omissions[key] = omitted;
    if (pack[key].length > 0) {
      pack.selectionLog.push({
        group: key,
        reason,
        selectedIds: pack[key].map((record) => record.id)
      });
    }
  }
  pack.fullHistoryLoaded = false;
  pack.omissionReason = "bounded-context-keeps-response-stable-as-the-book-grows";
  pack.charCount = charCount(pack);
  if (pack.charCount > applied.maxChars) {
    throw new Error("Context pack base profile exceeds maxChars");
  }
  return pack;
}
