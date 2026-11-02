import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { KEYBOARD_LAYOUTS, TEMPLATES, CONTEXT_MENU_CONFIG } from '../services/constants';
import { templateToHTML, renderMathHTML } from '@/utils/mathConverters';

// --- STYLES ---
const customStyles = `
    .math-keyboard {
        background: #1e2124;
        user-select: none;
        touch-action: none;
        width: 896px;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 10000;
        pointer-events: auto;
    }
    
    /* Grid row structure - flexible columns based on content */
    .math-keyboard-row {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 8px;
        margin-bottom: 8px;
    }
    
    .math-key-wrapper {
        display: flex;
    }
    
    .math-keyboard-key {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #282b30;
        color: #f0f0f0;
        border: none;
        border-radius: 6px;
        font-size: 18px;
        font-weight: 500;
        position: relative;
        transition: all 0.1s ease;
        height: 48px;
        width: 100%;
        padding: 8px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    
    .math-keyboard-key:hover {
        background: #32363c;
    }
    
    .math-keyboard-key:active {
        background: #4f545c;
        transform: scale(0.96);
    }
    
    .math-keyboard-key .sub-label {
        position: absolute;
        bottom: 4px;
        right: 6px;
        font-size: 10px;
        color: #72767d;
        font-weight: 400;
    }
    
    /* Group key container */
    .math-key-group-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
        height: 100%;
        width: 100%;
    }
    
    .math-key-group-row {
        display: grid;
        gap: 4px;
        flex: 1;
    }
    
    /* Small cursor for sub/superscripts */
    .small-cursor {
        caret-color: #60a5fa;
    }
    
    .small-cursor::selection {
        background-color: rgba(96, 165, 250, 0.3);
    }
    
    :not(.small-cursor) sup, :not(.small-cursor) sub {
        font-size: 0.7em;
    }
    
    .small-cursor sup, .small-cursor sub, .small-cursor .vk-num, .small-cursor .vk-den {
        font-size: 1em;
    }
    
    /* Enhanced cursor styles for all math elements */
    sup[contenteditable="true"], sub[contenteditable="true"] {
        caret-color: #60a5fa;
        font-size: inherit;
        min-width: 0.5ch;
        display: inline-block;
    }
    
    sup[contenteditable="true"]:focus, sub[contenteditable="true"]:focus {
        outline: 1px solid rgba(96, 165, 250, 0.3);
        outline-offset: 1px;
        border-radius: 2px;
    }
    
    /* Math cursor placeholder for block removal */
    .math-cursor-placeholder {
        caret-color: #60a5fa !important;
        font-size: inherit !important;
        min-width: 1ch !important;
        display: inline-block !important;
        background: rgba(96, 165, 250, 0.1) !important;
        border-radius: 2px !important;
        padding: 0 1px !important;
        margin: 0 1px !important;
        transition: all 0.15s ease !important;
    }
    
    .math-cursor-placeholder:focus {
        outline: 1px solid rgba(96, 165, 250, 0.5) !important;
        outline-offset: 1px !important;
        background: rgba(96, 165, 250, 0.2) !important;
    }
    
    .math-cursor-placeholder::selection {
        background-color: rgba(96, 165, 250, 0.3) !important;
    }
    
    /* Fraction styling */
    .vk-frac {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        line-height: 1;
        vertical-align: -0.2em; /* nudge up for better inline alignment */
        margin: 0 0.125em;
        white-space: nowrap;
    }
    
    .vk-frac .vk-num, .vk-frac .vk-den {
        display: inline-block;
        min-width: 0.6ch;
        text-align: center;
        padding: 0 0.1em;
        line-height: 1;
        caret-color: #60a5fa; /* Blue cursor for visibility */
        font-size: inherit; /* Inherit font size for proper cursor sizing */
    }
    
    .vk-frac .vk-num:focus, .vk-frac .vk-den:focus {
        outline: 1px solid rgba(96, 165, 250, 0.3);
        outline-offset: 1px;
        border-radius: 2px;
    }
    
    .vk-frac .vk-bar {
        border-top: 1px solid currentColor;
        width: 100%;
        margin: 1px 0;
    }
    
    /* Matrix styling */
    .vk-matrix {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        margin: 0 0.125em;
        line-height: 1;
    }
    
    .vk-matrix-paren {
        font-size: 1.1em;
        line-height: 1;
        font-weight: 400;
        vertical-align: baseline;
    }

    .vk-matrix:has(tbody tr + tr) .vk-matrix-paren {
        font-size: 2em;
    }
    
    .vk-matrix table {
        border-collapse: collapse;
        display: inline-table;
        margin: 0 0.2em;
    }
    
    .vk-matrix td {
        padding: 0.2em 0.4em;
        text-align: center;
        caret-color: #60a5fa; /* Blue cursor for visibility */
        font-size: inherit; /* Inherit font size for proper cursor sizing */
    }
    
    .vk-matrix td:focus {
        outline: 1px solid rgba(96, 165, 250, 0.3);
        outline-offset: 1px;
        border-radius: 2px;
    }
    
    /* Square root styling */
    .vk-sqrt {
        display: inline-flex;
        align-items: center;
        vertical-align: -0.1em;
        white-space: nowrap;
    }
    
    .vk-sqrt-content {
        caret-color: #60a5fa; /* Blue cursor for visibility */
        font-size: inherit; /* Inherit font size for proper cursor sizing */
    }
    
    .vk-sqrt-content:focus {
        outline: 1px solid rgba(96, 165, 250, 0.3);
        outline-offset: 1px;
        border-radius: 2px;
    }
    
    /* Context menu */
    .context-menu {
        position: absolute;
        background: #2f3136;
        border: 1px solid #4f545c;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        z-index: 10100;
        color: #dcddde;
        font-size: 14px;
        min-width: 220px;
        overflow: hidden;
    }
    
    .context-menu-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        cursor: pointer;
        transition: background 0.1s;
    }
    
    .context-menu-item:hover {
        background: #40444b;
    }
    
    .context-menu-divider {
        height: 1px;
        background: #4f545c;
        margin: 4px 0;
    }

    /* Square root container should be inline and not force line breaks */
    .vk-sqrt {
        display: inline-flex;
        align-items: center;
        vertical-align: -0.1em;
        white-space: nowrap;
    }
    
    .context-submenu-container {
        position: absolute;
        left: 100%;
        top: -5px;
    }
    
    /* Header styling */
    .math-keyboard header {
        padding: 8px 0 12px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        margin-bottom: 12px;
    }
`;


// --- CORE LOGIC ---
const useMathInput = () => {
    const lastFocused = useRef(null);
    const savedRange = useRef(null);
    const savedInputSelection = useRef({ start: null, end: null, direction: "none" });

    const saveNativeSelection = useCallback((el) => {
        if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
        const start = typeof el.selectionStart === "number" ? el.selectionStart : null;
        const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
        const direction = el.selectionDirection || "none";
        savedInputSelection.current = { start, end, direction };
    }, []);

    const restoreNativeSelection = useCallback((el) => {
        if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
        const { start, end, direction } = savedInputSelection.current || {};
        if (typeof start === "number" && typeof end === "number") {
            try {
                el.focus();
                el.setSelectionRange(start, end, direction || "none");
            } catch {
                // Ignore selection restore failures on unsupported input types.
            }
        }
    }, []);

    // -----------------------------
    // Save caret position
    // -----------------------------
    const saveSelection = useCallback(() => {
        if (!lastFocused.current) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        if (lastFocused.current.contains(range.commonAncestorContainer)) {
            savedRange.current = range.cloneRange();
        }
    }, []);

    // -----------------------------
    // Restore caret position
    // -----------------------------
    const restoreSelection = useCallback(() => {
        if (!savedRange.current || !lastFocused.current) return;
        lastFocused.current.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
    }, []);

    // -----------------------------
    // Insert HTML / Text into contentEditable
    // -----------------------------
    const insert = useCallback((content, isHtml = false) => {
        restoreSelection();
        const el = lastFocused.current;
        if (!el) return;

        // Handle space to exit math blocks (fractions/matrices/sqrt) and superscript/subscript
        if (content === ' ' && el.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                let node = range.startContainer;
                if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;

                // If inside fraction/matrix/sqrt editable areas, move caret outside block then add a space
                if (node && node.closest) {
                    // Prefer the whole math block if present
                    const blockEl = node.closest('.vk-frac, .vk-matrix, .vk-sqrt');
                    const currentEditable = node.closest('.vk-num, .vk-den, .vk-matrix td, .vk-sqrt-content');
                    const target = blockEl || currentEditable;
                    if (target) {
                        // Create a dedicated editable placeholder after the math block
                        const placeholder = document.createElement('span');
                        placeholder.className = 'math-cursor-placeholder';
                        placeholder.setAttribute('contenteditable', 'true');
                        placeholder.textContent = ' ';
                        const parentBlock = target.closest('.vk-frac, .vk-matrix, .vk-sqrt') || target;
                        parentBlock.parentNode.insertBefore(placeholder, parentBlock.nextSibling);

                        setTimeout(() => {
                            placeholder.focus();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(placeholder);
                            newRange.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                            placeholder.dispatchEvent(new Event('input', { bubbles: true }));
                        }, 0);
                        return;
                    }
                }

                // Find the nearest sup/sub element
                while (node && node !== el) {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.tagName.toLowerCase() === 'sup' || node.tagName.toLowerCase() === 'sub')) {
                        // Insert an editable placeholder after the sup/sub and focus it
                        const placeholder = document.createElement('span');
                        placeholder.className = 'math-cursor-placeholder';
                        placeholder.setAttribute('contenteditable', 'true');
                        placeholder.textContent = ' ';
                        node.parentNode.insertBefore(placeholder, node.nextSibling);

                        setTimeout(() => {
                            placeholder.focus();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(placeholder);
                            newRange.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                            placeholder.dispatchEvent(new Event('input', { bubbles: true }));
                        }, 0);
                        return;
                    }
                    node = node.parentNode;
                }
            }
        }

        // CONTENTEDITABLE INSERT
        if (el.isContentEditable) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();

            if (isHtml) {
                // Insert HTML inline at caret using execCommand, with a safe fallback
                const markerId = `cursor-${Date.now()}`;
                const html = content.replace("◻", `<span id="${markerId}"></span>`);

                let ok = false;
                try {
                    if (document.execCommand) {
                        ok = document.execCommand('insertHTML', false, html);
                    }
                } catch {}

                if (!ok) {
                    const temp = document.createElement("div");
                    temp.innerHTML = html;
                    const frag = document.createDocumentFragment();
                    while (temp.firstChild) frag.appendChild(temp.firstChild);
                    range.insertNode(frag);
                }

                const marker = el.querySelector(`#${markerId}`);
                if (marker) {
                    const newRange = document.createRange();
                    newRange.selectNode(marker);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    marker.remove();
                }
            } else {
                // Prefer execCommand for robust text insertion in contentEditable
                // If inserting a space while inside <sup>/<sub>, move caret outside first
                try {
                    if (typeof content === 'string' && content === ' ') {
                        let node = range.startContainer;
                        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
                        let supOrSub = null;
                        let p = node;
                        while (p && p !== el) {
                            if (p.nodeType === Node.ELEMENT_NODE) {
                                const tag = p.tagName;
                                if (tag === 'SUP' || tag === 'SUB') { supOrSub = p; break; }
                            }
                            p = p.parentNode;
                        }
                        if (supOrSub) {
                            const outRange = document.createRange();
                            outRange.setStartAfter(supOrSub);
                            outRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(outRange);
                        }
                    }
                } catch {}
                const ok = document.execCommand && document.execCommand('insertText', false, content);
                if (!ok) {
                    range.deleteContents();
                const node = document.createTextNode(content);
                range.insertNode(node);

                const newRange = document.createRange();
                newRange.setStartAfter(node);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                }
            }

            saveSelection();
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }

        // TEXTAREA / INPUT INSERT FALLBACK
        else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            const inputEl = el;
            restoreNativeSelection(inputEl);
            const fallbackPos = typeof inputEl.value === "string" ? inputEl.value.length : 0;
            const start = typeof inputEl.selectionStart === "number" ? inputEl.selectionStart : (
                typeof savedInputSelection.current.start === "number" ? savedInputSelection.current.start : fallbackPos
            );
            const end = typeof inputEl.selectionEnd === "number" ? inputEl.selectionEnd : (
                typeof savedInputSelection.current.end === "number" ? savedInputSelection.current.end : start
            );
            const cleaned = isHtml ? content.replace(/<[^>]*>/g, "") : content;

            inputEl.value = 
                inputEl.value.slice(0, start) + 
                cleaned + 
                inputEl.value.slice(end);

            const pos = start + cleaned.length;
            inputEl.setSelectionRange(pos, pos);
            saveNativeSelection(inputEl);

            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }, [restoreSelection, saveSelection, restoreNativeSelection, saveNativeSelection]);

    // -----------------------------
    // Helper function to maintain cursor sizing
    // -----------------------------
    const maintainCursorSizing = useCallback((targetElement) => {
        if (!targetElement) return;
        
        // Ensure proper cursor sizing for the target element
        const computedStyle = window.getComputedStyle(targetElement);
        const fontSize = computedStyle.fontSize;
        
        // Apply cursor sizing styles
        targetElement.style.caretColor = '#60a5fa';
        targetElement.style.fontSize = fontSize || 'inherit';
        
        // Add focus styles if it's a math element
        if (targetElement.matches('.vk-num, .vk-den, .vk-matrix td, sup[contenteditable="true"], sub[contenteditable="true"], .vk-sqrt-content, .math-cursor-placeholder')) {
            targetElement.style.outline = '1px solid rgba(96, 165, 250, 0.3)';
            targetElement.style.outlineOffset = '1px';
            targetElement.style.borderRadius = '2px';
            
            // Prevent unwanted clearing for fraction elements
            if (targetElement.matches('.vk-num, .vk-den')) {
                // Don't clear existing content when focusing
                const currentContent = targetElement.textContent;
                console.log('Fraction element focused:', targetElement.className, 'content:', currentContent);
                if (currentContent && currentContent !== '◻' && currentContent.trim() !== '') {
                    // Content exists, don't interfere
                    console.log('Preserving existing content:', currentContent);
                    return;
                }
            }
        }
        
        // Trigger input event to ensure cursor updates
        targetElement.dispatchEvent(new Event("input", { bubbles: true }));
    }, []);

    // -----------------------------
    // Insert Templates (fraction, matrix, sqrt, sup, etc.)
    // -----------------------------
    const insertTemplate = useCallback((key, override) => {
        const template = override || TEMPLATES[key];
        if (!template) return insert(key, false);

        const t = template.text;
        // If caret is inside a sup/sub and user is inserting a non-power template (e.g., sqrt/frac/matrix),
        // first place the caret OUTSIDE the sup/sub, then proceed with insertion.
        if (lastFocused.current?.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                let node = range.startContainer;
                if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
                if (node && node.closest) {
                    const supEl = node.closest('sup');
                    const subEl = node.closest('sub');
                    const supSub = supEl || subEl;
                    if (supSub && key !== 'sup' && key !== 'sub' && key !== 'pow') {
                        const placeholder = document.createElement('span');
                        placeholder.className = 'math-cursor-placeholder';
                        placeholder.setAttribute('contenteditable', 'true');
                        placeholder.textContent = ' ';
                        supSub.parentNode.insertBefore(placeholder, supSub.nextSibling);

                        setTimeout(() => {
                            placeholder.focus();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(placeholder);
                            newRange.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                            // Re-run the same template insertion now that we're outside sup/sub
                            insertTemplate(key, override);
                        }, 0);
                        return;
                    }
                }
            }
        }

        // SUPERSCRIPT
        if (key === "sup" && lastFocused.current?.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                // Check if we're already in a sup element
                let currentElement = range.startContainer;
                while (currentElement && currentElement.nodeType !== Node.ELEMENT_NODE) {
                    currentElement = currentElement.parentNode;
                }
                
                if (currentElement?.tagName?.toLowerCase() === 'sup') {
                    // Already in a sup, just place cursor at end
                    const newRange = document.createRange();
                    newRange.selectNodeContents(currentElement);
                    newRange.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else if (!range.collapsed) {
                    // Handle text selection
                    const wrapper = document.createElement('sup');
                    wrapper.setAttribute('contenteditable', 'true');
                    range.surroundContents(wrapper);
                    // Place caret inside the sup at the end
                    const newRange = document.createRange();
                    newRange.selectNodeContents(wrapper);
                    newRange.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else {
                    // Insert empty sup and place cursor inside it
                    const wrapper = document.createElement('sup');
                    wrapper.setAttribute('contenteditable', 'true');
                    
                    // Insert the sup with a zero-width space to ensure it's editable
                    const textNode = document.createTextNode('\u200B');
                    wrapper.appendChild(textNode);
                    
                    range.deleteContents();
                    range.insertNode(wrapper);
                    
                    // Place cursor inside the sup
                    const newRange = document.createRange();
                    newRange.setStart(textNode, 1);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                saveSelection();
                return;
            }
        }

        // SUBSCRIPT
        if (key === "sub" && lastFocused.current?.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                // Check if we're already in a sub element
                let currentElement = range.startContainer;
                while (currentElement && currentElement.nodeType !== Node.ELEMENT_NODE) {
                    currentElement = currentElement.parentNode;
                }
                
                if (currentElement?.tagName?.toLowerCase() === 'sub') {
                    // Already in a sub, just place cursor at end
                    const newRange = document.createRange();
                    newRange.selectNodeContents(currentElement);
                    newRange.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else if (!range.collapsed) {
                    // Handle text selection
                    const wrapper = document.createElement('sub');
                    wrapper.setAttribute('contenteditable', 'true');
                    range.surroundContents(wrapper);
                    // Place caret inside the sub at the end
                    const newRange = document.createRange();
                    newRange.selectNodeContents(wrapper);
                    newRange.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else {
                    // Insert empty sub and place cursor inside it
                    const wrapper = document.createElement('sub');
                    wrapper.setAttribute('contenteditable', 'true');
                    
                    // Insert the sub with a zero-width space to ensure it's editable
                    const textNode = document.createTextNode('\u200B');
                    wrapper.appendChild(textNode);
                    
                    range.deleteContents();
                    range.insertNode(wrapper);
                    
                    // Place cursor inside the sub
                    const newRange = document.createRange();
                    newRange.setStart(textNode, 1);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                saveSelection();
                return;
            }
        }

        // FRACTION HTML
        if (key === "frac" && lastFocused.current?.isContentEditable) {
            const html = `<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">◻</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">◻</span></span>`;
            insert(html, true);
            
            // Position cursor in the numerator after insertion
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    
                    // Find the inserted fraction
                    const frac = container.nodeType === Node.TEXT_NODE ? 
                        container.parentElement?.closest('.vk-frac') : 
                        container.closest('.vk-frac');
                    
                    if (frac) {
                        const numerator = frac.querySelector('.vk-num');
                        if (numerator) {
                            console.log('Fraction numerator found, current content:', numerator.textContent);
                            // Only clear if it's a placeholder, not if there's existing content
                            if (numerator.textContent === '◻') {
                                console.log('Clearing placeholder');
                                numerator.textContent = '';
                            } else {
                                console.log('Preserving existing numerator content:', numerator.textContent);
                            }
                            const newRange = document.createRange();
                            newRange.selectNodeContents(numerator);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                        }
                    }
                }
            }, 10);
            return;
        }

        // MATRIX HTML (generic NxM)
        if (key === "matrix" && lastFocused.current?.isContentEditable) {
            // parse template string: "[◻ & ◻ \\ ◻ & ◻]"
            const rows = t.slice(1, -1).split("\\\\");
            const tableRows = rows.map(r => {
                return "<tr>" + 
                    r.split("&").map(c => `<td contenteditable="true">${c.trim()}</td>`).join("") +
                    "</tr>";
            }).join("");

            const html = `<span class="vk-matrix" contenteditable="false"><span class="vk-matrix-paren">[</span><table><tbody>${tableRows}</tbody></table><span class="vk-matrix-paren">]</span></span>`;
            insert(html, true);
            
            // Position cursor in the first cell after insertion
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    
                    // Find the inserted matrix
                    const matrix = container.nodeType === Node.TEXT_NODE ? 
                        container.parentElement?.closest('.vk-matrix') : 
                        container.closest('.vk-matrix');
                    
                    if (matrix) {
                        const firstCell = matrix.querySelector('td');
                        if (firstCell) {
                            // Clear the placeholder and position cursor
                            firstCell.textContent = '';
                            const newRange = document.createRange();
                            newRange.selectNodeContents(firstCell);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                        }
                    }
                }
            }, 10);
            return;
        }

        // INTEGRAL / SUM / LOG / ANY TEMPLATE WITH sup/sub (except 'sup' and 'sub' which are handled above)
        if (key !== "sup" && key !== "sub" && (t.includes("_{ ") || t.includes("^\{"))) {
            const html = t
                .replace(/\^\{(.+?)\}/g, `<sup contenteditable="true">$1</sup>`)
                .replace(/\_\{(.+?)\}/g, `<sub contenteditable="true">$1</sub>`);
            insert(html, true);
            
            // Position cursor in the first editable area after insertion
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    
                    // Find the inserted template
                    const template = container.nodeType === Node.TEXT_NODE ? 
                        container.parentElement : 
                        container;
                    
                    // Look for first sup, sub, or contenteditable element
                    const editableElement = template.querySelector('sup[contenteditable="true"], sub[contenteditable="true"]');
                    if (editableElement) {
                        // Clear the placeholder and position cursor
                        editableElement.textContent = '';
                        const newRange = document.createRange();
                        newRange.selectNodeContents(editableElement);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        saveSelection();
                    }
                }
            }, 10);
            return;
        }

        // GENERAL TEMPLATE WITH CURSOR POSITIONING
        if (template.cursor !== undefined) {
            // Insert the template with a cursor marker at the specified position
            const markerId = `cursor-${Date.now()}`;
            const beforeCursor = t.substring(0, template.cursor);
            const afterCursor = t.substring(template.cursor);
            const html = `${beforeCursor}<span id="${markerId}" contenteditable="true"></span>${afterCursor}`;
            insert(html, true);
            
            // Position cursor at the marker location
            setTimeout(() => {
                const marker = document.querySelector(`#${markerId}`);
                if (marker) {
                    const sel = window.getSelection();
                    if (sel) {
                        const newRange = document.createRange();
                        newRange.selectNodeContents(marker);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        saveSelection();
                        
                        // Replace marker with a zero-width space to maintain cursor position
                        const textNode = document.createTextNode('\u200B');
                        marker.parentNode.replaceChild(textNode, marker);
                        
                        // Set cursor to the text node
                        const finalRange = document.createRange();
                        finalRange.setStart(textNode, 0);
                        finalRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(finalRange);
                        saveSelection();
                    }
                }
            }, 10);
            return;
        }

        // DEFAULT (plain insert)
        insert(t, false);
    }, [insert]);

    // Helper function to convert sup/sub content to normal text
    const convertSupSubToNormalText = useCallback((element) => {
        if (!element) return '';
        
        const content = element.textContent || '';
        const parent = element.parentNode;
        
        // Get the text before the sup/sub element
        const prevText = element.previousSibling?.textContent || '';
        
        // For superscript, we might want to add special formatting if needed
        // For now, just return the content as normal text
        return content;
    }, []);

    // -----------------------------
    // Helper function to escape from math blocks
    // -----------------------------
    const escapeFromMathBlock = useCallback((currentElement) => {
        if (!currentElement) return;
        
        // Handle standalone sup/sub elements - convert to normal text
        if (currentElement.matches('sup, sub')) {
            const parent = currentElement.parentNode;
            const content = convertSupSubToNormalText(currentElement);
            
            // Create a text node with the content (convert to normal text)
            const textNode = document.createTextNode(content);
            
            // Replace the sup/sub element with normal text
            parent.replaceChild(textNode, currentElement);
            
            // Create a placeholder for cursor positioning after the text
            const placeholder = document.createElement('span');
            placeholder.textContent = '';
            placeholder.setAttribute('contenteditable', 'true');
            placeholder.className = 'math-cursor-placeholder';
            
            // Insert the placeholder after the text
            parent.insertBefore(placeholder, textNode.nextSibling);
            
            // Focus the placeholder with proper sizing
            setTimeout(() => {
                placeholder.focus();
                const sel = window.getSelection();
                const newRange = document.createRange();
                newRange.selectNodeContents(placeholder);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                
                // Maintain cursor sizing
                maintainCursorSizing(placeholder);
                saveSelection();
                
                // Trigger change event for React components
                const event = new Event('input', { bubbles: true });
                parent.dispatchEvent(event);
            }, 10);
            return;
        }
        
        const parentBlock = currentElement.closest('.vk-frac, .vk-matrix, .vk-sqrt');
        if (!parentBlock) return;
        
        // Create a placeholder after the math block
        const placeholder = document.createElement('span');
        placeholder.textContent = '';
        placeholder.setAttribute('contenteditable', 'true');
        placeholder.className = 'math-cursor-placeholder';
        
        // Insert the placeholder after the math block
        parentBlock.parentNode.insertBefore(placeholder, parentBlock.nextSibling);
        
        // Focus the placeholder with proper sizing
        setTimeout(() => {
            placeholder.focus();
            const sel = window.getSelection();
            const newRange = document.createRange();
            newRange.selectNodeContents(placeholder);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            
            // Maintain cursor sizing
            maintainCursorSizing(placeholder);
            saveSelection();
        }, 10);
    }, [maintainCursorSizing, saveSelection]);

    // -----------------------------
    // handle actions (backspace, left, right, enter)
    // -----------------------------
    const handleAction = useCallback((action) => {
        restoreSelection();
        const sel = window.getSelection();

        if (action === "backspace") {
            const hostEditor = lastFocused.current;
            // Handle backspace within math blocks
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const container = range.startContainer;
                const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
                
                // If in a math block and it's empty, navigate out or remove block
                if (element.matches('.vk-num, .vk-den, .vk-matrix td, sup[contenteditable="true"], sub[contenteditable="true"], .vk-sqrt-content')) {
                    
                    const parentBlock = element.closest('.vk-frac, .vk-matrix, .vk-sqrt');
                    const textContent = element.textContent.trim();
                    
                    if (textContent === '' || textContent === '◻') {
                        // Check if we should exit the block or remove it entirely
                        if (parentBlock) {
                            const allEditableParts = parentBlock.querySelectorAll('.vk-num, .vk-den, .vk-matrix td, sup[contenteditable="true"], sub[contenteditable="true"], .vk-sqrt-content');
                            const allEmpty = Array.from(allEditableParts).every(part => 
                                part.textContent.trim() === '' || part.textContent.trim() === '◻'
                            );
                            
                            if (allEmpty) {
                                // Remove the entire math block and position cursor with proper sizing
                                const placeholder = document.createElement('span');
                                placeholder.textContent = '';
                                placeholder.setAttribute('contenteditable', 'true');
                                placeholder.className = 'math-cursor-placeholder';
                                
                                parentBlock.replaceWith(placeholder);
                                
                                // Position cursor in the placeholder with proper sizing
                                setTimeout(() => {
                                    placeholder.focus();
                                    const newRange = document.createRange();
                                    newRange.selectNodeContents(placeholder);
                                    newRange.collapse(true);
                                    sel.removeAllRanges();
                                    sel.addRange(newRange);
                                    
                                    // Maintain cursor sizing
                                    maintainCursorSizing(placeholder);
                                    saveSelection();
                                    hostEditor?.dispatchEvent(new Event('input', { bubbles: true }));
                                }, 10);
                                
                                hostEditor?.dispatchEvent(new Event('input', { bubbles: true }));
                                return;
                            } else {
                                // Just exit this specific part and go to next/previous
                                const editableParts = Array.from(allEditableParts);
                                const currentIndex = editableParts.indexOf(element);
                                
                                if (currentIndex > 0) {
                                    // Go to previous part
                                    const prevPart = editableParts[currentIndex - 1];
                                    prevPart.focus();
                                    const newRange = document.createRange();
                                    newRange.selectNodeContents(prevPart);
                                    newRange.collapse(false);
                                    sel.removeAllRanges();
                                    sel.addRange(newRange);
                                    
                                    // Maintain cursor sizing
                                    maintainCursorSizing(prevPart);
                                    saveSelection();
                                    return;
                                } else if (currentIndex < editableParts.length - 1) {
                                    // Go to next part
                                    const nextPart = editableParts[currentIndex + 1];
                                    nextPart.focus();
                                    const newRange = document.createRange();
                                    newRange.selectNodeContents(nextPart);
                                    newRange.collapse(true);
                                    sel.removeAllRanges();
                                    sel.addRange(newRange);
                                    
                                    // Maintain cursor sizing
                                    maintainCursorSizing(nextPart);
                                    saveSelection();
                                    return;
                                }
                            }
                        }
                    }
                }

                // If caret is collapsed directly AFTER a math block
                if (range.collapsed) {
                    let targetToDelete = null;
                    if (container.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                        let prev = container.previousSibling;
                        while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent === '') {
                            prev = prev.previousSibling;
                        }
                        if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.matches('.vk-matrix, .vk-frac, .vk-sqrt')) {
                            targetToDelete = prev;
                        } else if (!prev && container.parentElement?.previousElementSibling?.matches('.vk-matrix, .vk-frac, .vk-sqrt')) {
                            targetToDelete = container.parentElement.previousElementSibling;
                        }
                    } else if (container.nodeType === Node.ELEMENT_NODE && range.startOffset > 0) {
                        const child = container.childNodes[range.startOffset - 1];
                        if (child && child.nodeType === Node.ELEMENT_NODE && child.matches('.vk-matrix, .vk-frac, .vk-sqrt')) {
                            targetToDelete = child;
                        }
                    }

                    if (targetToDelete) {
                        targetToDelete.remove();
                        hostEditor?.dispatchEvent(new Event('input', { bubbles: true }));
                        saveSelection();
                        return;
                    }
                }
            }
            document.execCommand("delete");
            hostEditor?.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        if (action === "space") {
            // Handle space to escape from math blocks
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const container = range.startContainer;
                const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
                
                // Check if we're inside any math element that should be escaped
                if (element.matches('.vk-num, .vk-den, .vk-matrix td, sup[contenteditable="true"], sub[contenteditable="true"], .vk-sqrt-content, sup, sub')) {
                    // For sup/sub elements, convert to normal text
                    if (element.matches('sup, sub')) {
                        escapeFromMathBlock(element);
                    } else {
                        // For other math blocks, use the standard escape logic
                        escapeFromMathBlock(element);
                    }
                    return;
                }
                
                // Also check if we're inside a text node that's part of a sup/sub element
                if (container.nodeType === Node.TEXT_NODE) {
                    const parentElement = container.parentElement;
                    if (parentElement && parentElement.matches('sup, sub')) {
                        escapeFromMathBlock(parentElement);
                        return;
                    }
                }
            }
            insert(" ");
        }
        
        if (action === "enter") insert("\n");
        
        if (action === "left" || action === "right") {
            // Enhanced navigation for math blocks
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const container = range.startContainer;
                const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
                
                // Navigate between fraction parts
                if (element.matches('.vk-num') && action === "right") {
                    const frac = element.closest('.vk-frac');
                    if (frac) {
                        const denominator = frac.querySelector('.vk-den');
                        if (denominator) {
                            denominator.focus();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(denominator);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                            return;
                        }
                    }
                }
                
                if (element.matches('.vk-den') && action === "left") {
                    const frac = element.closest('.vk-frac');
                    if (frac) {
                        const numerator = frac.querySelector('.vk-num');
                        if (numerator) {
                            numerator.focus();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(numerator);
                            newRange.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                            saveSelection();
                            return;
                        }
                    }
                }
                
                // Navigate between matrix cells
                if (element.matches('.vk-matrix td')) {
                    const currentCell = element;
                    const row = currentCell.parentElement;
                    const table = row.parentElement;
                    const cells = Array.from(table.querySelectorAll('td'));
                    const currentIndex = cells.indexOf(currentCell);
                    
                    if (action === "right" && currentIndex < cells.length - 1) {
                        const nextCell = cells[currentIndex + 1];
                        nextCell.focus();
                        const newRange = document.createRange();
                        newRange.selectNodeContents(nextCell);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        saveSelection();
                        return;
                    }
                    
                    if (action === "left" && currentIndex > 0) {
                        const prevCell = cells[currentIndex - 1];
                        prevCell.focus();
                        const newRange = document.createRange();
                        newRange.selectNodeContents(prevCell);
                        newRange.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        saveSelection();
                        return;
                    }
                }
            }
            
            // Default navigation
            sel?.modify(action === "left" ? "move" : "move", action === "left" ? "left" : "right", "character");
        }

        saveSelection();
    }, [insert, restoreSelection, saveSelection]);

    // -----------------------------
// FIXED: GLOBAL FOCUS + SELECTION TRACKING
// -----------------------------
useEffect(() => {
    const onFocus = (e) => {
        let t = e.target;

        // Track native inputs/textareas directly
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
            lastFocused.current = t;
            saveNativeSelection(t);
            return;
        }

        // Walk UP until we reach the ROOT contentEditable
        while (t && t.parentElement && !t.isContentEditable) {
            t = t.parentElement;
        }

        if (t && t.isContentEditable) {
            console.log('Focus changed to:', t.className, t.tagName, 'content:', t.textContent?.substring(0, 50));
            lastFocused.current = t;
            saveSelection();
        }
    };

    const onBlur = (e) => {
        console.log('Blur from:', e.target.className, e.target.tagName, 'content:', e.target.textContent?.substring(0, 50));
        if (e?.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            saveNativeSelection(e.target);
        }
        if (lastFocused.current === e.target) {
            saveSelection();
        }
    };

    const handleSelectionChange = () => {
        const sel = window.getSelection();
        if (!sel || !lastFocused.current) return;

        // Only save selection if the caret is INSIDE the editor
        if (lastFocused.current.contains(sel.anchorNode)) {
            saveSelection();
        }
    };

    const handleNativeCaretChange = (e) => {
        const t = e?.target;
        if (!t) return;
        if (t === lastFocused.current && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
            saveNativeSelection(t);
        }
    };

        const handleKeyDown = (e) => {
            if (e.key === "Backspace" && lastFocused.current && lastFocused.current.isContentEditable) {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                const container = range.startContainer;
                const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

                if (element.matches('.vk-num, .vk-den, .vk-matrix td, sup[contenteditable="true"], sub[contenteditable="true"], .vk-sqrt-content')) {
                    const parentBlock = element.closest('.vk-frac, .vk-matrix, .vk-sqrt');
                    const textContent = element.textContent.trim();
                    if ((textContent === '' || textContent === '◻') && parentBlock) {
                        const allEditableParts = parentBlock.querySelectorAll('.vk-num, .vk-den, .vk-matrix td, sup[contenteditable="true"], sub[contenteditable="true"], .vk-sqrt-content');
                        const allEmpty = Array.from(allEditableParts).every(part =>
                            part.textContent.trim() === '' || part.textContent.trim() === '◻'
                        );
                        if (allEmpty) {
                            e.preventDefault();
                            handleAction("backspace");
                            return;
                        }
                    }
                }

                if (range.collapsed) {
                    let isRightAfterMath = false;
                    if (container.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                        let prev = container.previousSibling;
                        while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent === '') {
                            prev = prev.previousSibling;
                        }
                        if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.matches('.vk-matrix, .vk-frac, .vk-sqrt')) {
                            isRightAfterMath = true;
                        } else if (!prev && container.parentElement?.previousElementSibling?.matches('.vk-matrix, .vk-frac, .vk-sqrt')) {
                            isRightAfterMath = true;
                        }
                    } else if (container.nodeType === Node.ELEMENT_NODE && range.startOffset > 0) {
                        const child = container.childNodes[range.startOffset - 1];
                        if (child && child.nodeType === Node.ELEMENT_NODE && child.matches('.vk-matrix, .vk-frac, .vk-sqrt')) {
                            isRightAfterMath = true;
                        }
                    }

                    if (isRightAfterMath) {
                        e.preventDefault();
                        handleAction("backspace");
                        return;
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("focusin", onFocus, true);
        window.addEventListener("focusout", onBlur, true);
        window.addEventListener("click", handleNativeCaretChange, true);
        window.addEventListener("keyup", handleNativeCaretChange, true);
        window.addEventListener("select", handleNativeCaretChange, true);
        window.addEventListener("input", handleNativeCaretChange, true);
        document.addEventListener("selectionchange", handleSelectionChange);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("focusin", onFocus, true);
            window.removeEventListener("focusout", onBlur, true);
            window.removeEventListener("click", handleNativeCaretChange, true);
            window.removeEventListener("keyup", handleNativeCaretChange, true);
            window.removeEventListener("select", handleNativeCaretChange, true);
            window.removeEventListener("input", handleNativeCaretChange, true);
            document.removeEventListener("selectionchange", handleSelectionChange);
        };
}, [saveSelection, saveNativeSelection]);


    return { insert, insertTemplate, handleAction, saveSelection, restoreSelection, lastFocused };
};


// --- SUB-COMPONENTS ---
const Key = memo(({ def, onKeyClick, shiftActive }) => {
    const { value, label, sub, type, width, className } = def;
    let displayLabel = label || value;
    let displaySub = sub;

    if (type === 'char' && shiftActive && value.match(/[a-z]/)) {
        displayLabel = value.toUpperCase();
    }
     if (type === 'char' && shiftActive && value.match(/[A-Z]/)) {
        displayLabel = value.toLowerCase();
    }

    if (value === 'sin' && shiftActive) displaySub = 'sin⁻¹';

    const gridColumn = width ? `span ${width} / span ${width}` : undefined;

    const handleClick = () => {
      onKeyClick(def, shiftActive);
    }

    return (
        <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClick}
            className={`math-keyboard-key ${className || ''}`}
            style={{ gridColumn }}
        >
            {displayLabel}
            {displaySub && <span className="sub-label">{displaySub}</span>}
        </button>
    );
});

const ContextMenu = ({ config, onAction, onClose, position }) => {
        const [activeSubmenu, setActiveSubmenu] = useState(null);
        const [matrixHover, setMatrixHover] = useState(null); // 0..23 or null
        const [matrixFlip, setMatrixFlip] = useState(false);
        const menuRef = useRef(null);
        const matrixRef = useRef(null);

    useEffect(() => {
            const handleClickOutside = (event) => {
                if (menuRef.current && event.target && !menuRef.current.contains(event.target)) {
                    onClose();
                }
            };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

        const handleItemClick = (item) => {
      if (item.hasSubmenu) return;
      onAction(item.value, item.template);
      onClose();
    }

        const renderMenu = (menuConfig, isSubmenu = false) => (
        <div 
            className={`context-menu ${isSubmenu ? 'context-submenu-container' : ''}`}
        >
            {menuConfig.items.map((item, index) => {
                if (item.type === 'divider') {
                    return <div key={index} className="context-menu-divider" />;
                }
                const itemId = item.id || item.value;
                return (
                    <div
                        key={itemId}
                        className="context-menu-item"
                        onMouseEnter={() => item.hasSubmenu && setActiveSubmenu(itemId)}
                        onClick={(e) => {
                            // If this item has a submenu, toggle it on click (for touch / no-hover scenarios)
                            if (item.hasSubmenu) {
                                e.stopPropagation();
                                setActiveSubmenu(prev => prev === itemId ? null : itemId);
                                return;
                            }
                            handleItemClick(item);
                        }}
                    >
                        <span>{item.label}</span>
                        {item.hasSubmenu && <span>›</span>}
                        {activeSubmenu === itemId && item.submenu && (
                             item.submenu.type === 'matrix' ? (
                                <div
                                  ref={matrixRef}
                                  className="context-menu context-submenu-container p-2"
                                  style={{ left: matrixFlip ? 'auto' : '100%', right: matrixFlip ? '100%' : 'auto' }}
                                  onMouseEnter={() => {
                                      setActiveSubmenu(itemId);
                                      // Auto-flip if overflowing right edge
                                      try {
                                        const rect = matrixRef.current?.getBoundingClientRect?.();
                                        if (rect && rect.right > (window.innerWidth - 8)) setMatrixFlip(true);
                                        else setMatrixFlip(false);
                                      } catch {}
                                  }}
                                  onMouseLeave={() => setMatrixHover(null)}
                                >
                                    <div className="grid grid-cols-6 gap-1 p-2" style={{ minWidth: 200 }}>
                                        {Array.from({length: 24}).map((_, i) => {
                                            const cols = 6;
                                            const r = Math.floor(i / cols);
                                            const c = i % cols;
                                            let active = false;
                                            if (matrixHover !== null) {
                                                const hr = Math.floor(matrixHover / cols);
                                                const hc = matrixHover % cols;
                                                active = r <= hr && c <= hc;
                                            }
                                            return (
                                                <div
                                                    key={i}
                                                    className="border" 
                                                    style={{
                                                        width: 18,
                                                        height: 18,
                                                        borderColor: '#6b7280',
                                                        background: active ? 'rgba(88,101,242,0.35)' : 'transparent',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    onMouseEnter={() => setMatrixHover(i)}
                                                    onClick={() => {
                                                        const rows = Math.floor(i/6) + 1;
                                                        const colsSel = (i % 6) + 1;
                                                        const matrixTemplate = `[${Array(rows).fill(Array(colsSel).fill('◻').join(' & ')).join(' \\\\ ')}]`;
                                                        onAction('matrix', { text: matrixTemplate, cursor: 1 });
                                                        onClose();
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="text-xs text-gray-400 px-2 pb-1">
                                        {matrixHover !== null ? `${Math.floor(matrixHover/6)+1} × ${(matrixHover%6)+1}` : 'Pick size'}
                                    </div>
                                </div>
                            ) : renderMenu(item.submenu, true)
                        )}
                    </div>
                );
            })}
        </div>
    );
    
    return (
        <div ref={menuRef} style={{position: 'absolute', left: position.x, top: position.y }}>
            {renderMenu(config)}
        </div>
    );
}

// --- MAIN KEYBOARD COMPONENT ---
export default function VirtualMathKeyboard({ onInsert, onClose }) {
    const [activeTab, setActiveTab] = useState('numeric');
    const [shiftActive, setShiftActive] = useState(false);
    const [contextMenu, setContextMenu] = useState({ open: false, pos: {x:0, y:0} });
    const [pos, setPos] = useState({ top: window.innerHeight - 320, left: (window.innerWidth - 896) / 2 });
    const [isDragging, setIsDragging] = useState(false);
    const [selfHidden, setSelfHidden] = useState(false);
    const dragState = useRef({ startX: 0, startY: 0, startTop: 0, startLeft: 0 });
    const containerRef = useRef(null);

    const { executeCommand, insert, insertTemplate, handleAction } = useMathInput();
    const handleClose = useCallback(() => {
        setSelfHidden(true);
        if (typeof onClose === 'function') onClose();
    }, [onClose]);

    const handleDragStart = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        dragState.current = {
            startX: clientX,
            startY: clientY,
            startTop: pos.top,
            startLeft: pos.left,
        };
    }, [pos]);

    useEffect(() => {
        const handleDragMove = (e) => {
            if (!isDragging) return;
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

            const dx = clientX - dragState.current.startX;
            const dy = clientY - dragState.current.startY;

            setPos({
                top: Math.max(0, Math.min(window.innerHeight - 280, dragState.current.startTop + dy)),
                left: Math.max(0, Math.min(window.innerWidth - 896, dragState.current.startLeft + dx)),
            });
        };

        const handleDragEnd = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('touchmove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchend', handleDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging]);

    useEffect(() => {
        // Ensure virtual keyboard styles are globally available across the app
        let styleSheet = document.getElementById('vk-global-styles');
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = 'vk-global-styles';
            styleSheet.textContent = customStyles;
            document.head.appendChild(styleSheet);
        } else {
            // Refresh content if empty or outdated
            if (!styleSheet.textContent || styleSheet.textContent.indexOf('.vk-frac') === -1) {
                styleSheet.textContent = customStyles;
            }
        }
        // Do NOT remove styles on unmount; keep them for all consumers
        return () => {};
    }, []);

    const handleKeyClick = useCallback((keyDef, isShift) => {
        let value = keyDef.value;
        let isHtml = false;

        if (keyDef.type === 'char' && isShift && value.match(/[a-z]/i)) {
            value = isShift ? value.toUpperCase() : value.toLowerCase();
        }

        switch (keyDef.type) {
            case 'char':
                insert(value, false);
                if (isShift && activeTab === 'alpha') setShiftActive(false);
                break;
            case 'template':
                insertTemplate(value);
                break;
            case 'action':
                if (value === 'shift') {
                    setShiftActive(prev => !prev);
                } else {
                    handleAction(value);
                }
                break;
            case 'group': // Groups are for layout only
                break;
        }
    }, [insert, insertTemplate, handleAction, activeTab]);
    
    // RENDER: Calculate grid columns based on number of keys in row
    const renderKeyGrid = useCallback((layout) => {
    return layout.map((row, rIndex) => {
        // Count the number of key slots (accounting for width)
        const columnCount = row.reduce((sum, keyDef) => sum + (keyDef.width || 1), 0);
        
        return (
            <div 
                key={rIndex} 
                className="math-keyboard-row"
                style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
            >
                {row.map((keyDef, kIndex) => {
                    const width = keyDef.width || 1;
                    const gridColumn = `span ${width}`;
                    
                    if (keyDef.type === 'group') {
                        return (
                            <div key={kIndex} className="math-key-wrapper" style={{ gridColumn }}>
                                <div className="math-key-group-container">
                                    {keyDef.keys && keyDef.keys.map((subRow, i) => (
                                        <div 
                                            key={i} 
                                            className="math-key-group-row"
                                            style={{ 
                                                gridTemplateColumns: `repeat(${subRow.length}, 1fr)`
                                            }}
                                        >
                                            {subRow.map((subKey, si) => (
                                                <Key key={si} def={subKey} onKeyClick={handleKeyClick} shiftActive={shiftActive} />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    }
                    
                    return (
                        <div key={kIndex} className="math-key-wrapper" style={{ gridColumn }}>
                            <Key def={keyDef} onKeyClick={handleKeyClick} shiftActive={shiftActive} />
                        </div>
                    );
                })}
            </div>
        );
    });
}, [handleKeyClick, shiftActive]);

    const handleMenuButtonClick = (e) => {
        const btnRect = e.currentTarget.getBoundingClientRect();
        const cont = containerRef.current;
        if (!cont) {
            setContextMenu({ open: true, pos: { x: 8, y: 8 } });
            return;
        }
        const contRect = cont.getBoundingClientRect();
        const MENU_W = 240; // approximate menu width
        const MENU_H = 320; // approximate menu height (max)
        // Position menu below and aligned to the right edge of the button, within container
        let x = btnRect.right - contRect.left - MENU_W;
        let y = btnRect.bottom - contRect.top + 8;
        x = Math.max(8, Math.min(x, contRect.width - MENU_W - 8));
        y = Math.max(8, Math.min(y, contRect.height - MENU_H - 8));
        setContextMenu({ open: true, pos: { x, y } });
    }

    // Self-hide fallback: render nothing if internally closed
    if (selfHidden) return null;

    return (
        <div 
            className="math-keyboard p-2 rounded-2xl shadow-2xl flex flex-col gap-2"
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000 }}
            ref={containerRef}
        >
            {contextMenu.open && (
                <ContextMenu 
                    config={CONTEXT_MENU_CONFIG}
                    onClose={() => setContextMenu({ ...contextMenu, open: false })}
                    onAction={(value, template) => insertTemplate(value, template)}
                    position={contextMenu.pos}
                />
            )}
            {/* Header */}
            <header 
            className="flex items-center justify-between px-2"
    onMouseDown={handleDragStart}
    onTouchStart={handleDragStart}
    style={{ 
        cursor: isDragging ? 'grabbing' : 'grab', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '8px 0 12px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 12
    }}
>
    <div className="flex items-center gap-4" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {(Object.keys(KEYBOARD_LAYOUTS)).map(tabId => {
            const labels = { numeric: '123', functions: 'ƒ(x)', symbols: '∞≠∈', alpha: 'abc', greek: 'αβγ' };
            const active = activeTab === tabId;
            return (
                <button 
                    key={tabId} 
                    onClick={() => setActiveTab(tabId)} 
                    style={{
                        padding: '8px 12px',
                        fontSize: 14,
                        borderRadius: 6,
                        background: active ? 'rgba(88,101,242,0.15)' : 'transparent',
                        color: active ? '#5865f2' : '#8e9297',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        transition: 'all 0.15s'
                    }}
                    className={`py-1 px-3 text-lg font-mono rounded ${activeTab === tabId ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}
                >
                    {labels[tabId]}
                </button>
            );
        })}
    </div>

    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* <button 
            onClick={handleMenuButtonClick} 
            title="Menu" 
            style={{ 
                padding: '8px 10px', 
                borderRadius: 6, 
                background: 'transparent', 
                border: 'none', 
                cursor: 'pointer',
                color: '#8e9297',
                fontSize: 18,
                transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
            ☰
        </button> */}
        <button 
            onClick={handleClose} 
            title="Close" 
            style={{ 
                padding: '8px 10px', 
                borderRadius: 6, 
                background: 'transparent', 
                border: 'none', 
                cursor: 'pointer',
                color: '#8e9297',
                fontSize: 16,
                transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
            ✕
        </button>
    </div>
</header>

            {/* Key Area */}
            <div className="flex-grow flex flex-col gap-2 p-1">
                {renderKeyGrid(KEYBOARD_LAYOUTS[activeTab])}
            </div>
        </div>
    );
}
