import api from "../api/client";

export const fetchYoutubeCookiesStatus = () => api.get("/settings/youtube-cookies");

export const uploadYoutubeCookiesFile = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/settings/youtube-cookies", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
