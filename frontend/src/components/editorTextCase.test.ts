import { describe, expect, it } from "vitest";
import { convertTextCase } from "./editorTextCase";

describe("editor text case conversion", () => {
  it("converts Portuguese text to uppercase using the pt-BR locale", () => {
    expect(convertTextCase("ação e coração", "MAIÚSCULAS")).toBe("AÇÃO E CORAÇÃO");
  });

  it("converts text to lowercase", () => {
    expect(convertTextCase("KORTEX SMARTCANVAS", "minúsculas")).toBe("kortex smartcanvas");
  });

  it("capitalizes sentence starts and each selected paragraph", () => {
    expect(convertTextCase("olá mundo. próxima frase\nnovo parágrafo", "Título"))
      .toBe("Olá mundo. Próxima frase\nNovo parágrafo");
  });

  it("handles Unicode letters", () => {
    expect(convertTextCase("istanbul e ação", "Título")).toBe("Istanbul e ação");
  });
});
