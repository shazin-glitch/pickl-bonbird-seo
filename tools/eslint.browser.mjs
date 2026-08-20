// no-undef only — catches ReferenceErrors that `node --check` cannot see.
const G = ["window","document","console","fetch","localStorage","sessionStorage","location",
 "navigator","setTimeout","setInterval","clearTimeout","clearInterval","alert","confirm","prompt",
 "FormData","Blob","URL","URLSearchParams","Image","FileReader","AbortSignal","AbortController",
 "Chart","google","Event","CustomEvent","requestAnimationFrame","btoa","atob","structuredClone",
 "IntersectionObserver","MutationObserver","CSS","DOMParser","XMLHttpRequest","getComputedStyle","history",
 // Defined in index.html, used by js/*.js at runtime (genuine cross-file globals):
 "esc","escJs","apiGet","apiPost","toast","state"];
export default [{
  languageOptions: { ecmaVersion: 2023, sourceType: "script",
    globals: Object.fromEntries(G.map(g => [g, "readonly"])) },
  rules: { "no-undef": "error" },
}];
