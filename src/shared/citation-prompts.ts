/** System prompt snippets for each citation standard */
export const CITATION_PROMPTS: Record<string, string> = {
  '法学引注手册': `脚注格式（《法学引注手册》规范）：
- 中文著作：作者：《书名》，出版社出版年版，第X页。
- 中文期刊：作者：《文章名》，载《期刊名》年第X期。
- 中文文集：作者：《文章名》，载主编者主编：《文集名》，出版社出版年版，第X页。
- 外文著作：Author, *Title* (Publisher Year), p. X.
- 外文期刊：Author, "Article Title", *Journal* Vol. X, No. X (Year).
- 法律法规：《法规名》第X条。
- 司法案例：案件名，法院（案号）。
- 网络资源：作者：《标题》，载网站名年月日，URL。`,

  'GB/T 7714': `脚注格式（GB/T 7714 国家标准）：
- 专著：[序号] 作者.书名[M].出版地:出版者,出版年:页码.
- 期刊：[序号] 作者.文章题名[J].期刊名,年,卷(期):页码.
- 学位论文：[序号] 作者.题名[D].保存地点:保存单位,年份.
- 网络文献：[序号] 作者.题名[EB/OL].(发表日期)[引用日期].URL.
- 会议论文：[序号] 作者.题名[C]//会议名.出版地:出版者,出版年:页码.`,

  'APA 7th': `Footnote format (APA 7th Edition):
- Book: Author, A. A. (Year). *Title of work*. Publisher.
- Journal: Author, A. A. (Year). Title of article. *Journal Name*, *Volume*(Issue), Pages. https://doi.org/xxx
- Edited book chapter: Author, A. A. (Year). Title of chapter. In E. E. Editor (Ed.), *Title of book* (pp. xx-xx). Publisher.
- Website: Author, A. A. (Year, Month Day). *Title*. Site Name. URL`,

  'Chicago': `Footnote format (Chicago Manual of Style):
- Book (note): Author, *Title* (Place: Publisher, Year), Page.
- Book (bibliography): Author. *Title*. Place: Publisher, Year.
- Journal (note): Author, "Article Title," *Journal Name* Volume, no. Issue (Year): Pages.
- Journal (bibliography): Author. "Article Title." *Journal Name* Volume, no. Issue (Year): Pages.`,
}

/**
 * Get citation format prompt snippet for a given template group.
 * Returns empty string if group not found.
 */
export function getCitationPrompt(group: string | null): string {
  if (!group) return ''
  return CITATION_PROMPTS[group] || ''
}
