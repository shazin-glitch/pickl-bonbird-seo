const G = ["require","module","exports","process","console","fetch","Buffer","__dirname","__filename",
 "setTimeout","setInterval","clearTimeout","clearInterval","URL","URLSearchParams","AbortSignal",
 "AbortController","TextEncoder","TextDecoder","crypto","structuredClone","Blob","FormData","btoa","atob"];
export default [{
  languageOptions: { ecmaVersion: 2023, sourceType: "commonjs",
    globals: Object.fromEntries(G.map(g => [g, "readonly"])) },
  rules: { "no-undef": "error" },
}];
