export const DEAL_ID_PARAM = "CRM_Deal_ID";

function normalise(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Picks the Deal ID out of a generic key/value map (e.g. Creator widget params). */
export function getCrmDealIdFromParams(params: Record<string, unknown>): string | null {
  const direct = params[DEAL_ID_PARAM];
  if (direct !== undefined) return normalise(direct as string);
  // Tolerate case differences in how the Page parameter was named.
  const key = Object.keys(params).find((k) => k.toLowerCase() === DEAL_ID_PARAM.toLowerCase());
  return key ? normalise(params[key] as string) : null;
}

/**
 * Reads the CRM Deal ID from the current URL.
 * Returns null when missing or blank. This value is never rendered to the user.
 */
export function getCrmDealIdFromUrl(search: string = window.location.search): string | null {
  const params = new URLSearchParams(search);
  return normalise(params.get(DEAL_ID_PARAM));
}
