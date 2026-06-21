import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-727SXJPM-CJc5OjD8.js";
import { _ as __name } from "./index-qjTFK59O.js";
import "./chunk-FMBD7UC4-Diq7LrCY.js";
import "./chunk-ND2GUHAM-B-tKuZJF.js";
import "./chunk-55IACEB6-DiS2GV3l.js";
import "./chunk-2J33WTMH-CZdQ86AG.js";
var diagram = {
  parser: classDiagram_default,
  get db() {
    return new ClassDB();
  },
  renderer: classRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.class) {
      cnf.class = {};
    }
    cnf.class.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
