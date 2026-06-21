import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-727SXJPM-BemlCIhT.js";
import { _ as __name } from "./index-DDmip2-6.js";
import "./chunk-FMBD7UC4-CEFE1Vr7.js";
import "./chunk-ND2GUHAM-COzVqFKt.js";
import "./chunk-55IACEB6-Ch2mD_eP.js";
import "./chunk-2J33WTMH-CccHHgGZ.js";
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
