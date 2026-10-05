"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCsrfToken } from "@/lib/csrf-client";

const KEY = ["my-follows"] as const;

async function fetchFollowedIds(): Promise<string[]> {
  const response = await fetch("/api/me/follows");
  if (!response.ok) throw new Error("Failed to load followed members");
  return ((await response.json()) as { ids: string[] }).ids;
}

/**
 * The viewer's private "My people" ids, fetched once and shared by every
 * follow button on the page via the React Query cache. Toggling is
 * optimistic and rolls back if the request fails.
 */
export function useMemberFollows() {
  const queryClient = useQueryClient();
  const { data: ids } = useQuery({ queryKey: KEY, queryFn: fetchFollowedIds, staleTime: 60_000 });

  const mutation = useMutation({
    mutationFn: async ({ memberId, following }: { memberId: string; following: boolean }) => {
      const response = await fetch(`/api/members/${memberId}/follow`, {
        method: following ? "PUT" : "DELETE",
        headers: { "x-csrf-token": await getCsrfToken() },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't update your list.");
      }
    },
    onMutate: async ({ memberId, following }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<string[]>(KEY) ?? [];
      const rest = previous.filter((id) => id !== memberId);
      queryClient.setQueryData<string[]>(KEY, following ? [...rest, memberId] : rest);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return {
    loaded: ids !== undefined,
    isFollowing: (memberId: string) => ids?.includes(memberId) ?? false,
    setFollowing: (memberId: string, following: boolean) => mutation.mutate({ memberId, following }),
    pending: mutation.isPending,
  };
}
