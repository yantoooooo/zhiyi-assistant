export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const MAX_DOCUMENT_TEXT = 30_000;

const allowedExtensions = new Set(["pdf", "docx", "txt", "md", "csv", "jpg", "jpeg", "png", "webp", "gif"]);
const imageMimeByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export type AttachmentInput = { name: string; type: string; size: number; data: Buffer };
export type PreparedAttachments = { documentText: string; images: Array<{ name: string; mimeType: string; base64: string }> };

export function validateAttachments(files: AttachmentInput[]) {
  if (files.length > MAX_ATTACHMENTS) throw new Error(`一次最多上传 ${MAX_ATTACHMENTS} 个附件。`);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > 20 * 1024 * 1024) throw new Error("附件总大小不能超过 20 MB。");
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) throw new Error(`“${file.name}”超过 10 MB 限制。`);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.has(extension)) throw new Error(`暂不支持“${file.name}”的文件格式。`);
    const expectedImageType = imageMimeByExtension[extension];
    if ((file.type.startsWith("image/") || expectedImageType) && file.type && file.type !== expectedImageType) throw new Error(`“${file.name}”的文件类型与扩展名不匹配。`);
  }
}

export async function prepareAttachments(files: AttachmentInput[]): Promise<PreparedAttachments> {
  const documents: string[] = [];
  const images: PreparedAttachments["images"] = [];
  let remainingText = MAX_DOCUMENT_TEXT;

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (imageMimeByExtension[extension]) {
      images.push({ name: file.name, mimeType: imageMimeByExtension[extension], base64: file.data.toString("base64") });
      continue;
    }

    let text: string;
    if (extension === "pdf") {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await getDocument({ data: new Uint8Array(file.data), useWorkerFetch: false }).promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 30); pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      }
      text = pages.join("\n");
    } else if (extension === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: file.data });
      text = result.value;
    } else {
      text = file.data.toString("utf8");
    }

    const normalized = text.replace(/\u0000/g, "").trim();
    if (!normalized && ["pdf", "docx"].includes(extension)) throw new Error(`“${file.name}”中未提取到可读取文字，扫描版 PDF 请改为上传页面截图。`);
    const cleaned = normalized.slice(0, remainingText);
    if (cleaned) {
      documents.push(`附件「${file.name}」内容：\n${cleaned}`);
      remainingText = Math.max(0, remainingText - cleaned.length);
    }
  }

  return { documentText: documents.join("\n\n"), images };
}
