import { useState, useEffect, useRef, useCallback } from "react";

export function useEntitySearch(api, entityType, options = {}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  const debounceTimer = useRef(null);
  const requestId = useRef(0);
  const searchOptions = options;

  const search = useCallback(async (searchTerm, { append = false, limit, offset } = {}) => {
    const currentId = ++requestId.current;
    const term = String(searchTerm || "").trim();
    const opts = { limit, offset, company_id: searchOptions.companyId };

    setLoading(true);
    setError(null);

    try {
      const response = await api.searchEntities(entityType, term, opts);

      if (currentId !== requestId.current) return;

      if (append) {
        setResults((prev) => [...prev, ...(response.results || [])]);
      } else {
        setResults(response.results || []);
      }
      setHasMore(response.hasMore || false);
      setTotal(response.total || 0);
    } catch (err) {
      if (currentId !== requestId.current) return;
      setError(err.message || "Search failed");
      if (!append) setResults([]);
    } finally {
      if (currentId === requestId.current) setLoading(false);
    }
  }, [api, entityType, searchOptions.companyId]);

  const debouncedSearch = useCallback((value) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      search(value, { limit: 50, offset: 0 });
    }, 150);
  }, [search]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    search(query, { append: true, limit: 50, offset: results.length });
  }, [loading, hasMore, search, query, results.length]);

  const refresh = useCallback(() => {
    search(query, { limit: 50, offset: 0 });
  }, [search, query]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    hasMore,
    total,
    error,
    debouncedSearch,
    loadMore,
    refresh,
    search
  };
}
