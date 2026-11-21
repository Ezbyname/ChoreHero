// Fills {placeholders} in a copy string: formatCopy('{n} / {max}', { n: 3, max: 5 }).
export function formatCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
