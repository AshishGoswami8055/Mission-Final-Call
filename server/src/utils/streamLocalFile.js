import fs from "node:fs";
import { applyCorsHeaders } from "../config/cors.js";

export const parseRangeHeader = (rangeHeader, totalSize) => {
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
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

  const totalSize = fs.statSync(absolutePath).size;
  const range = parseRangeHeader(req.headers.range, totalSize);
  if (range.invalid) {
    res.setHeader("Content-Range", `bytes */${totalSize}`);
    return res.status(416).end();
  }

  const { start, end, partial } = range;
  const bytesToSend = end - start + 1;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
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
