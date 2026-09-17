import { useEffect, useState } from "react";
import { getCreatorWidgetParams } from "../services/creatorService";
import { getCrmDealIdFromParams, getCrmDealIdFromUrl } from "../utils/queryParams";

interface CrmDealIdState {
  loading: boolean;
  crmDealId: string | null;
}

/**
 * Resolves the CRM Deal ID: URL query string first, then parameters passed
 * by the Creator Page through the widget SDK.
 */
export function useCrmDealId(): CrmDealIdState {
  const [state, setState] = useState<CrmDealIdState>(() => {
    const fromUrl = getCrmDealIdFromUrl();
    return { loading: fromUrl === null, crmDealId: fromUrl };
  });

  useEffect(() => {
    if (!state.loading) return;
    let cancelled = false;

    void getCreatorWidgetParams().then((params) => {
      if (cancelled) return;
      setState({ loading: false, crmDealId: getCrmDealIdFromParams(params) });
    });

    return () => {
      cancelled = true;
    };
  }, [state.loading]);

  return state;
}
