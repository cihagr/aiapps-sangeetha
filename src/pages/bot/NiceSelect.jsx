import React, { useState, useRef, useEffect } from "react";
import { css as S } from "./css";
import Hoverable from "./Hoverable";

// Custom select with a fixed-position menu (escapes overflow clipping).
export default function NiceSelect({ value, options = [], placeholder = "Select...", invalid = false, height = 40, onSelect }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const reposition = () => setOpen((o) => { if (o && rootRef.current) setRect(rootRef.current.getBoundingClientRect()); return o; });
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, []);

  const openMenu = () => { setRect(rootRef.current ? rootRef.current.getBoundingClientRect() : null); setOpen(true); };
  const cur = options.find((o) => o.value === value);
  const border = invalid ? "#f87171" : open ? "#006ce0" : "#e2e8f0";
  const ring = open ? (invalid ? "box-shadow:0 0 0 3px rgba(248,113,113,0.18);" : "box-shadow:0 0 0 3px rgba(0,108,224,0.15);") : "";
  const menuStyle = (() => {
    const r = rect, top = r ? r.bottom + 6 : 0, left = r ? r.left : 0, width = r ? r.width : 0;
    return `position:fixed;top:${top}px;left:${left}px;width:${width}px;z-index:99999;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 12px 28px -8px rgba(15,23,42,0.22);padding:6px;max-height:260px;overflow-y:auto`;
  })();

  return (
    <div ref={rootRef} style={S("position:relative;font-family:'Open Sans',sans-serif;width:100%")}>
      <button type="button" onClick={() => (open ? setOpen(false) : openMenu())}
        style={S(`display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;height:${height}px;padding:0 12px;border:1px solid ${border};border-radius:8px;background:#fff;font-family:inherit;font-size:.8125rem;cursor:pointer;outline:none;text-align:left;${ring}`)}>
        <span style={S(cur ? "color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" : "color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{cur ? cur.label : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={S(`flex-shrink:0;transition:transform .15s;transform:rotate(${open ? 180 : 0}deg)`)}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={S(menuStyle)}>
          {options.map((o, i) => {
            const sel = o.value === value;
            return (
              <Hoverable key={i} as="button" type="button"
                onClick={() => { setOpen(false); if (onSelect) onSelect(o.value); }}
                base={S(`display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;padding:9px 12px;border:0;border-radius:7px;background:${sel ? "#eff6ff" : "transparent"};color:${sel ? "#006ce0" : "#334155"};font-family:inherit;font-size:.8125rem;font-weight:${sel ? 600 : 400};cursor:pointer;text-align:left`)}
                hover={S(sel ? "background:#eff6ff" : "background:#f1f5f9")}>
                <span>{o.label}</span>
                {sel && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#006ce0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </Hoverable>
            );
          })}
        </div>
      )}
    </div>
  );
}
