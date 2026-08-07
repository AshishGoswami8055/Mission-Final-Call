import { useMemo, useState } from "react";

const INITIAL_FILTERS = {
  search: "",
  type: "all",
  difficulty: "",
  status: "",
  examTag: "",
  rootWord: "",
  sort: "due",
};

export const useVocabularyFilters = (initial = {}) => {
  const [filters, setFilters] = useState({ ...INITIAL_FILTERS, ...initial });
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const resetFilters = () => setFilters({ ...INITIAL_FILTERS, ...initial });
  const query = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== "" && value !== "all")
      ),
    [filters]
  );
  return { filters, setFilter, setFilters, resetFilters, query };
};

export default useVocabularyFilters;
