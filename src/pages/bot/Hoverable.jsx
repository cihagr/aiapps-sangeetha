import React, { useState } from "react";

// Renders `as` with a base style, swapping to hover/focus/active styles on the
// matching pointer/focus state. Replaces the design's style-hover/style-focus
// declarations. Style props are already-parsed React style objects.
export default function Hoverable({ as = "div", base, hover, focus, active, children, ...rest }) {
  const [h, setH] = useState(false);
  const [f, setF] = useState(false);
  const [a, setA] = useState(false);
  // Merged, not swapped. A hover/focus/active style holds only the declarations that
  // change, so replacing the whole object dropped the rest — padding, border,
  // border-radius, display — and the element collapsed. Being smaller, it fell out
  // from under the pointer, mouseleave restored the base style, the element grew back
  // under the pointer and mouseenter fired again: that loop is the flicker.
  // Merging also leaves the styles that repeat every declaration behaving exactly as
  // before, since each of those overrides every key it cares about.
  const style = { ...base, ...(f && focus), ...(h && hover), ...(a && active) };
  const wrap = (fn, cb) => (e) => { cb(e); if (fn) fn(e); };
  return React.createElement(
    as,
    {
      ...rest,
      style,
      onMouseEnter: wrap(rest.onMouseEnter, () => hover && setH(true)),
      onMouseLeave: wrap(rest.onMouseLeave, () => { setH(false); setA(false); }),
      onFocus: wrap(rest.onFocus, () => focus && setF(true)),
      onBlur: wrap(rest.onBlur, () => setF(false)),
      onMouseDown: wrap(rest.onMouseDown, () => active && setA(true)),
      onMouseUp: wrap(rest.onMouseUp, () => setA(false)),
    },
    children
  );
}
