/** Converts selected text using the locale conventions used by the Kortex editor. */
export function convertTextCase(text: string, choice: string): string {
  const normalizedChoice = choice.toLocaleLowerCase("pt-BR");
  if (normalizedChoice.includes("min")) return text.toLocaleLowerCase("pt-BR");
  if (normalizedChoice.includes("tít")) {
    return text.toLocaleLowerCase("pt-BR").replace(
      /(^|[.!?]\s+|\n+)(\p{L})/gu,
      (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("pt-BR"),
    );
  }
  return text.toLocaleUpperCase("pt-BR");
}
