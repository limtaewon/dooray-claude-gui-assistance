/** 확장자 → Monaco 언어. 목록에 없으면 plaintext 로 두고 하이라이트를 포기한다. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell', py: 'python', java: 'java', kt: 'kotlin', go: 'go',
  rs: 'rust', sql: 'sql', xml: 'xml', toml: 'ini', ini: 'ini'
}

/** 경로의 확장자로 Monaco 언어를 고른다. 확장자가 없거나 모르는 형식이면 plaintext. */
export function languageOf(path: string): string {
  return LANGUAGE_BY_EXTENSION[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
}
