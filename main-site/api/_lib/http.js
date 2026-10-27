// Reaching the upstream feeds, for every layer in api/_layers/: LTA DataMall (AccountKey, paged
// 500 records at a time with $skip) and data.gov.sg (its v2 real-time API and the older v1, with
// the optional x-api-key). The keys are read from the environment here and go nowhere but the
// upstream's own request headers: never into a reply, a log line or an error message.

export const LTA_BASE = "https://datamall2.mytransport.sg/ltaodataservice";
export const DGS_V2 = "https://api-open.data.gov.sg/v2/real-time/api";
export const DGS_V1 = "https://api.data.gov.sg/v1";

const TIMEOUT_MS = 15_000;
const LTA_PAGE = 500;
// More pages than any LTA dataset this app reads has (bus stops are about 11).
const LTA_MAX_PAGES = 40;
const LTA_PARALLEL = 4;

// An upstream that answered badly. `status` is what the API route replies with: 502 when the
// feed itself failed, 503 when this deploy hasn't got the key it needs.
export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function getJson(url, { headers = {}, timeout = TIMEOUT_MS } = {}) {
  let r;
  try {
    r = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeout), cache: "no-store" });
  } catch (err) {
    throw new UpstreamError(`${new URL(url).host} didn't answer (${err.name})`);
  }
  if (!r.ok) throw new UpstreamError(`${new URL(url).host} replied ${r.status}`);
  try {
    return await r.json();
  } catch {
    throw new UpstreamError(`${new URL(url).host} sent something that isn't JSON`);
  }
}

export const hasLtaKey = () => Boolean(process.env.LTA_ACCOUNT_KEY);

function ltaKey() {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) throw new UpstreamError("LTA_ACCOUNT_KEY isn't set", 503);
  return key;
}

// One page of an LTA dataset: its `value` rows.
export async function lta(path, params = {}) {
  const url = new URL(`${LTA_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const data = await getJson(url, { headers: { AccountKey: ltaKey() } });
  return Array.isArray(data?.value) ? data.value : [];
}

// Every row of a paged LTA dataset, LTA_PARALLEL pages at a time, until a page comes back short.
export async function ltaAll(path, params = {}) {
  const rows = [];
  let skip = 0;
  for (let round = 0; round * LTA_PARALLEL < LTA_MAX_PAGES; round++) {
    const pages = await Promise.all(
      Array.from({ length: LTA_PARALLEL }, (_, i) => lta(path, { ...params, $skip: skip + i * LTA_PAGE }))
    );
    let done = false;
    for (const page of pages) {
      rows.push(...page);
      if (page.length < LTA_PAGE) done = true;
    }
    if (done) break;
    skip += LTA_PARALLEL * LTA_PAGE;
  }
  return rows;
}

const dgsHeaders = () => (process.env.DATA_GOV_KEY ? { "x-api-key": process.env.DATA_GOV_KEY } : {});

// data.gov.sg's v2 real-time API: its `data`, or an error when `code` isn't 0.
export async function dataGov(path, params = {}) {
  const url = new URL(`${DGS_V2}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const body = await getJson(url, { headers: dgsHeaders() });
  if (body?.code !== 0 && body?.code !== undefined) throw new UpstreamError(`data.gov.sg ${path} answered code ${body.code}`);
  return body?.data ?? null;
}

// data.gov.sg's older v1 API, which still carries the taxi and traffic camera feeds.
export async function dataGovV1(path) {
  return getJson(`${DGS_V1}${path}`, { headers: dgsHeaders() });
}
