import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/server/account.functions";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 15_000, refetchOnWindowFocus: true });
}

export type Me = NonNullable<ReturnType<typeof useMe>["data"]>;
