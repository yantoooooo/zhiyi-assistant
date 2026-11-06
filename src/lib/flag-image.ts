/** Only resolve the country flag files exposed by the Cyberantt image directory. */
export function flagImageSource(image: string): string | null {
  if (!image) return null;
  try {
    const url = new URL(image, "https://assets.invalid");
    const match = url.pathname.match(/^\/dev-api\/profile\/DownloadImg\/flags\/4x3\/([a-z]{2})\.svg$/i);
    return match ? `/api/account/flag?code=${match[1].toLowerCase()}` : null;
  } catch { return null; }
}
