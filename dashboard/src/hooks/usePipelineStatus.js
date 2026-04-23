import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "../utils/constants.js";
import { cachedFetch } from "../utils/apiCache.js";

export function usePipelineStatus() {
  return useQuery({
    queryKey: ["pipeline", "status"],
    queryFn: async () => cachedFetch(`${apiBaseUrl()}/pipeline/status`, 15_000),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}
