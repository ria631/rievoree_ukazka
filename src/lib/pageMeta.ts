import { useEffect } from "react"

/**
 * Title and description for the public pages (the SPA ships one index.html;
 * search engines render the page and read these). Restores the previous
 * values when the page unmounts.
 */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const before = { title: document.title, description: meta?.content, canonical: canonical?.href }
    document.title = title
    if (meta) meta.content = description
    if (canonical) canonical.href = new URL(location.pathname, location.origin).href
    return () => {
      document.title = before.title
      if (meta && before.description !== undefined) meta.content = before.description
      if (canonical && before.canonical) canonical.href = before.canonical
    }
  }, [title, description])
}
