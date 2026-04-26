import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "../utils/constants.js";
import { cachedFetch } from "../utils/apiCache.js";

export function useEmissionsSummary() {
  return useQuery({
    queryKey: ["emissions", "summary"],
    queryFn: async () => cachedFetch(`${apiBaseUrl()}/emissions/summary`, 60_000),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useMapData() {
  return useQuery({
    queryKey: ["suppliers", "map"],
    queryFn: async () => {
      const data = await cachedFetch(`${apiBaseUrl()}/suppliers/map-data?limit=500`, 120_000);
      return Array.isArray(data) ? data : data?.suppliers || data?.features || [];
    },
    staleTime: 180_000,
    refetchInterval: 300_000,
  });
}
