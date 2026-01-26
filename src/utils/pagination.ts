export interface PaginationParams {
  limit: number;
  cursor?: string;
  updatedSince?: Date;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export function parseLimit(raw: string | undefined, defaultLimit = 50, maxLimit = 200): number {
  if (!raw) return defaultLimit;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

export function parseUpdatedSince(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (isNaN(date.getTime())) return undefined;
  return date;
}

export function buildPaginatedResponse<T extends { id: string }>(
  items: T[],
  limit: number
): PaginatedResponse<T> {
  const hasMore = items.length > limit;
  const sliced = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null;
  
  return {
    items: sliced,
    nextCursor,
  };
}
