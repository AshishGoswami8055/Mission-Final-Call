import { useState } from "react";
import api from "../api/client";

export const useVocabularyImport = () => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");

  const previewImport = async ({ file, text, type }) => {
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("type", type);
      if (file) form.append("file", file);
      if (text) form.append("text", text);
      const response = await api.post("/vocabulary/import-preview", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(response.data);
      return response.data;
    } catch (requestError) {
      const message = requestError.response?.data?.message || "Could not preview import.";
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  };

  const commitImport = async (type) => {
    if (!preview?.rows?.length) return null;
    setCommitting(true);
    setError("");
    try {
      const validRows = preview.rows
        .filter((row) => !row.errors?.length)
        .map((row) => row.data);
      const response = await api.post("/vocabulary/import-commit", {
        type,
        rows: validRows,
      });
      return response.data;
    } catch (requestError) {
      const message = requestError.response?.data?.message || "Could not import vocabulary.";
      setError(message);
      throw requestError;
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setError("");
  };

  return { preview, loading, committing, error, previewImport, commitImport, reset };
};

export default useVocabularyImport;
