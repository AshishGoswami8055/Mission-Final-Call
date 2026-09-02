import fs from "node:fs";
import { applyCorsHeaders } from "../config/cors.js";

export const parseRangeHeader = (rangeHeader, totalSize) => {
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  const value = String(rangeHeader).trim().replace(/^bytes=/i, "");

  // Suffix range: bytes=-500 (last 500 bytes — browsers use this to read MP4 moov on huge files)
  if (value.startsWith("-")) {
    const suffix = parseInt(value.slice(1), 10);
    if (Number.isNaN(suffix) || suffix <= 0) {
      return { invalid: true };
    }
    const start = Math.max(0, totalSize - suffix);
    return { start, end: totalSize - 1, partial: true };
  }

  const match = /^(\d*)-(\d*)$/.exec(value);
  if (!match) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
    return { invalid: true };
  }

  end = Math.min(end, totalSize - 1);
  return { start, end, partial: true };
};

/**
 * Stream a local file with HTTP Range support (required for long MP4 seeks).
 */
export const streamLocalFile = ({
  req,
  res,
  absolutePath,
  contentType = "application/octet-stream",
  fileName = "",
  asAttachment = false,
}) => {
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  const stat = fs.statSync(absolutePath);
  const totalSize = stat.size;
  const range = parseRangeHeader(req.headers.range, totalSize);
  if (range.invalid) {
    applyCorsHeaders(req, res);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Range", `bytes */${totalSize}`);
    return res.status(416).end();
  }

  const { start, end, partial } = range;
  const bytesToSend = end - start + 1;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader("ETag", `"${totalSize}-${Math.floor(stat.mtimeMs)}"`);
  res.setHeader("Last-Modified", stat.mtime.toUTCString());
  if (fileName) {
    const disposition = asAttachment ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${fileName.replace(/"/g, "")}"`);
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  applyCorsHeaders(req, res);

  if (partial) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", String(bytesToSend));
  } else {
    res.status(200);
    res.setHeader("Content-Length", String(totalSize));
  }

  const stream = fs.createReadStream(absolutePath, { start, end });
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ message: "Stream failed" });
    } else {
      res.destroy();
    }
  });
  req.on("close", () => stream.destroy());
  stream.pipe(res);
};
