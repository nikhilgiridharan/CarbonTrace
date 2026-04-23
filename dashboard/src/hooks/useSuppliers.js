import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "../utils/constants.js";
import { cachedFetch } from "../utils/apiCache.js";

export function useSuppliers(params = {}) {
  return useQuery({
    queryKey: ["suppliers", "list", params],
    queryFn: async () => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) q.append(k, String(v));
      }
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return cachedFetch(`${apiBaseUrl()}/suppliers${suffix}`, 60_000);
    },
    staleTime: 60_000,
  });
}
