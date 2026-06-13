import { describe, expect, it } from "vitest";
import { validateProjectDescription, validateProjectName } from "./projectForm.js";

describe("validateProjectName", () => {
  it("空文字はエラーメッセージを返す", () => {
    expect(validateProjectName("")).toBe("プロジェクト名を入力してください");
  });

  it("空白のみもエラーメッセージを返す", () => {
    expect(validateProjectName("   ")).toBe("プロジェクト名を入力してください");
    expect(validateProjectName("　")).toBe("プロジェクト名を入力してください");
  });

  it("1文字以上入力されていればnull（エラーなし）", () => {
    expect(validateProjectName("新規サイト制作")).toBeNull();
    expect(validateProjectName("  a  ")).toBeNull();
  });
});

describe("validateProjectDescription", () => {
  it("空文字はエラーメッセージを返す", () => {
    expect(validateProjectDescription("")).toBe("プロジェクトの概要を入力してください");
  });

  it("空白のみもエラーメッセージを返す", () => {
    expect(validateProjectDescription("   ")).toBe("プロジェクトの概要を入力してください");
    expect(validateProjectDescription("　")).toBe("プロジェクトの概要を入力してください");
  });

  it("1文字以上入力されていればnull（エラーなし）", () => {
    expect(validateProjectDescription("コーポレートサイトの制作")).toBeNull();
    expect(validateProjectDescription("  概要  ")).toBeNull();
  });
});
