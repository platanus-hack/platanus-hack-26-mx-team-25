import { ai as Utils, aj as Color } from "./index-DDmip2-6.js";
const channel = (color, channel2) => {
  return Utils.lang.round(Color.parse(color)[channel2]);
};
export {
  channel as c
};
