/** Keep catalog identifiers available to the app without showing them in chat prose. */
export function hideProductIds(text: string, productIds: readonly string[]): string {
  const ids = [...new Set(productIds.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!ids.length) return text;

  const alternatives = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const labeledId = "(?:商品|产品|服务)?[ \\t]*(?:ID|编号)[ \\t]*[:：#]?[ \\t]*[“\"'‘`]?(?:" +
    alternatives +
    ")[”\"'’`]?";
  const bareId = `(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`;
  return text.replace(new RegExp(`${labeledId}|${bareId}`, "giu"), "")
    .replace(/[ \t]+([，,。.；;])/g, "$1");
}
