import React from 'react';
import { Template } from './types';

// Type definitions for our complex layout
export type KeyType = 'char' | 'template' | 'action' | 'group';

export interface KeyDef {
  value: string;
  label?: string | React.ReactNode;
  sub?: string;
  type: KeyType;
  width?: number;
  className?: string;
  keys?: KeyDef[][];
}

export type KeyboardLayout = KeyDef[][];

export const KEYBOARD_LAYOUTS: Record<string, KeyboardLayout> = {
  numeric: [
    [
      { type: 'group', value: 'vars', width: 2, keys: [
        [{ type: 'char', value: 'x', sub: 'y' }, { type: 'char', value: 'n', sub: 'a' }],
        [{ type: 'char', value: '<' }, { type: 'char', value: '>' }],
        [{ type: 'char', value: '(' }, { type: 'char', value: ')' }],
      ]},
      { type: 'group', value: 'num-pad', width: 4, keys: [
        [{ type: 'char', value: '7' }, { type: 'char', value: '8' }, { type: 'char', value: '9' }, { type: 'char', value: '÷' }],
        [{ type: 'char', value: '4' }, { type: 'char', value: '5' }, { type: 'char', value: '6' }, { type: 'char', value: '×' }],
        [{ type: 'char', value: '1' }, { type: 'char', value: '2' }, { type: 'char', value: '3' }, { type: 'char', value: '-' }],
      ]},
      { type: 'group', value: 'constants', width: 3, keys: [
        [{ type: 'char', value: 'e', sub: 'ln' }, { type: 'char', value: 'i' }, { type: 'char', value: 'π', sub: 'sin' }],
        [
          { type: 'template', value: 'pow', label: '□²', sub: 'pow' }, 
          { type: 'template', value: 'sup', label: 'xⁿ', sub: 'sup' },
          { type: 'template', value: 'sqrt', label: '√□' }
        ],
        [
          { type: 'template', value: 'int_inf', label: React.createElement(React.Fragment, null, '∫', React.createElement('sub', null, '0'), React.createElement('sup', null, '∞'), 'd', React.createElement('i', { style: { fontFamily: 'serif', fontStyle: 'italic' } }, 'x')) },
          { type: 'char', value: '∀' }, 
          { type: 'action', value: 'backspace', label: '⌫' }
        ],
      ]},
    ],
    [
      { type: 'action', value: 'shift', label: '⇧', width: 1 },
      { type: 'char', value: '0', width: 2 },
      { type: 'char', value: '.' },
      { type: 'char', value: '=' },
      { type: 'char', value: '+' },
      { type: 'action', value: 'left', label: '‹' },
      { type: 'action', value: 'right', label: '›' },
      { type: 'action', value: 'enter', label: '↵', width: 2 },
    ],
  ],

  functions: [
    [
      { type: 'template', value: 'sin' }, 
      { type: 'template', value: 'cos' }, 
      { type: 'template', value: 'tan' },
      { type: 'template', value: 'log' },
      { type: 'template', value: 'ln' },
      { type: 'template', value: 'lim' },
    ],
    [
      { type: 'template', value: 'sin_inv', label: React.createElement(React.Fragment, null, 'sin', React.createElement('sup', null, '-1'))},
      { type: 'template', value: 'cos_inv', label: React.createElement(React.Fragment, null, 'cos', React.createElement('sup', null, '-1'))},
      { type: 'template', value: 'tan_inv', label: React.createElement(React.Fragment, null, 'tan', React.createElement('sup', null, '-1'))},
      { type: 'template', value: 'log_10' }, 
      { type: 'template', value: 'exp' }, 
      { type: 'template', value: 'sum' },
    ],
    [
      { type: 'template', value: 'sqrt', label: '√□'}, 
      { type: 'template', value: 'sup', label: 'xⁿ' },
      { type: 'template', value: 'abs', label: '|□|' }, 
      { type: 'template', value: 'frac', label: '□/□' },
      { type: 'template', value: 'matrix', label: '[□]' }, 
      { type: 'template', value: 'prod' },
    ],
    [
      { type: 'action', value: 'shift', label: '⇧', width: 1 },
      { type: 'char', value: ' ', label: 'Space', width: 6 },
      { type: 'action', value: 'left', label: '‹' },
      { type: 'action', value: 'right', label: '›' },
      { type: 'action', value: 'backspace', label: '⌫' },
      { type: 'action', value: 'enter', label: '↵' },
    ]
  ],

  symbols: [
    [...`<>≤≥=≠≈`.split('').map(c => ({type: 'char', value: c} as KeyDef)), {type: 'char', value: '·'}, {type: 'char', value: '÷'}, {type: 'char', value: '×'}, {type: 'char', value: '±'}],
    [...`()[]{}|`.split('').map(c => ({type: 'char', value: c} as KeyDef)), {type: 'char', value: '∀'}, {type: 'char', value: '∃'}, {type: 'char', value: '¬'}, {type: 'char', value: '∂'}],
    [...`∈∉⊂⊃⊆⊇`.split('').map(c => ({type: 'char', value: c} as KeyDef)), {type: 'char', value: '∪'}, {type: 'char', value: '∩'}, {type: 'char', value: '∞'}, {type: 'char', value: '°'}],
    [...`→⇒←⇐↔⇔`.split('').map(c => ({type: 'char', value: c} as KeyDef)), {type: 'char', value: '∴'}, {type: 'char', value: '∵'}, {type: 'char', value: '∇'}, {type: 'char', value: 'ħ'}],
  ],

  alpha: [
    [...`1234567890`.split('').map(c => ({ type: 'char', value: c } as KeyDef)), {type: 'action', value: 'backspace', label: '⌫'}],
    [...`qwertyuiop`.split('').map(c => ({ type: 'char', value: c } as KeyDef)), {type: 'char', value: '/'}],
    [{type:'char', value: ' ', width: 1, className: 'opacity-0 pointer-events-none'}, ...`asdfghjkl`.split('').map(c => ({ type: 'char', value: c } as KeyDef)), { type: 'char', value: ';'}],
    [{ type: 'action', value: 'shift', label: '⇧' }, ...`zxcvbnm`.split('').map(c => ({ type: 'char', value: c } as KeyDef)), { type: 'char', value: ','}, { type: 'char', value: '.'}],
    [
      { type: 'char', value: '(', width: 1 }, 
      { type: 'char', value: ')' }, 
      { type: 'char', value: '-' },
      { type: 'char', value: ' ', label: 'Space', width: 5 },
      { type: 'char', value: '+' }, 
      { type: 'char', value: '=' },
      { type: 'action', value: 'enter', label: '↵', width: 2 },
    ],
  ],

  greek: [
    [
      { type: 'char', value: 'φ', sub: 'phi var.' }, 
      { type: 'char', value: 'ς', sub: 'sigma var.' }, 
      { type: 'char', value: 'ε' },
      { type: 'char', value: 'ρ' }, 
      { type: 'char', value: 'τ' }, 
      { type: 'char', value: 'υ', sub: 'upsilon' },
      { type: 'char', value: 'θ' }, 
      { type: 'char', value: 'ι', sub: 'iota' }, 
      { type: 'char', value: 'ο' }, 
      { type: 'char', value: 'π' },
    ],
    [
      { type: 'char', value: 'α', sub: 'alpha' }, 
      { type: 'char', value: 'σ', sub: 'sigma' }, 
      { type: 'char', value: 'δ', sub: 'delta' },
      { type: 'char', value: 'ϕ', sub: 'phi' }, 
      { type: 'char', value: 'γ', sub: 'gamma' }, 
      { type: 'char', value: 'η', sub: 'eta' },
      { type: 'char', value: 'ξ', sub: 'xi' }, 
      { type: 'char', value: 'κ', sub: 'kappa' }, 
      { type: 'char', value: 'λ', sub: 'lambda' },
    ],
    [
      { type: 'action', value: 'shift', label: '⇧' },
      { type: 'char', value: 'ζ', sub: 'zeta' }, 
      { type: 'char', value: 'χ', sub: 'chi' }, 
      { type: 'char', value: 'ψ', sub: 'psi' },
      { type: 'char', value: 'ω', sub: 'omega' }, 
      { type: 'char', value: 'β', sub: 'beta' }, 
      { type: 'char', value: 'ν', sub: 'nu' },
      { type: 'char', value: 'μ', sub: 'mu' },
      { type: 'action', value: 'backspace', label: '⌫' },
    ],
    [
      { type: 'char', value: 'ϵ', sub: 'epsilon var.' }, 
      { type: 'char', value: 'ϑ', sub: 'theta var.' }, 
      { type: 'char', value: 'ϰ', sub: 'kappa var.' },
      { type: 'char', value: 'ϖ', sub: 'pi var.' }, 
      { type: 'char', value: 'ϱ', sub: 'rho var.' },
      { type: 'char', value: ' ', label: 'Space', width: 2 },
      { type: 'action', value: 'left', label: '‹' }, 
      { type: 'action', value: 'right', label: '›' }, 
      { type: 'action', value: 'enter', label: '↵' },
    ]
  ],
};

//
// TEMPLATES
//
export const TEMPLATES: Record<string, Template> = {
  "pow": { text: "◻²", cursor: 0 },
  "sup": { text: "◻^{◻}", cursor: 0 },
  "sqrt": { text: "√(◻)", cursor: 2 },
  "int_inf": { text: "∫_{0}^{∞} ◻ d◻", cursor: 7 },
  "sin": { text: "sin(◻)", cursor: 4 },
  "cos": { text: "cos(◻)", cursor: 4 },
  "tan": { text: "tan(◻)", cursor: 4 },
  "log": { text: "log(◻)", cursor: 4 },
  "sin_inv": { text: "sin⁻¹(◻)", cursor: 6 },
  "cos_inv": { text: "cos⁻¹(◻)", cursor: 6 },
  "tan_inv": { text: "tan⁻¹(◻)", cursor: 6 },
  "ln": { text: "ln(◻)", cursor: 3 },
  "log_10": { text: "log₁₀(◻)", cursor: 7 },
  "exp": { text: "exp(◻)", cursor: 4 },
  "abs": { text: "|◻|", cursor: 1 },
  "norm": { text: "||◻||", cursor: 2 },
  "frac": { text: "frac(◻,◻)", cursor: 5, dynamic: true },
  "lim": { text: "lim_{◻→◻}(◻)", cursor: 4 },
  "int": { text: "∫_{◻}^{◻} ◻ d◻", cursor: 2 },
  "overline": { text: "overline(◻)", cursor: 9 },
  "underbrace": { text: "underbrace(◻)", cursor: 11 },
  "matrix": { text: "[◻]", cursor: 1 },
  "derivative": { text: "(d/d◻)◻", cursor: 4},
  "nth_derivative": { text: "(dⁿ/d◻ⁿ)◻", cursor: 6},
  "integral": { text: "∫_{◻}^{◻} ◻ d◻", cursor: 2 },
  "sum": { text: "∑_{i=◻}^{◻} ◻", cursor: 4 },
  "prod": { text: "∏_{i=◻}^{◻} ◻", cursor: 4 },
  "modulus": { text: "|◻|", cursor: 1 },
  "argument": { text: "arg(◻)", cursor: 4 },
  "real_part": { text: "Re(◻)", cursor: 3 },
  "imag_part": { text: "Im(◻)", cursor: 3 },
  "conjugate": { text: "overline(◻)", cursor: 9 },
};

//
// CONTEXT MENU FIXED
//
export const CONTEXT_MENU_CONFIG = {
  id: 'root',
  items: [
    { id: 'insert-matrix', label: 'Insert Matrix', hasSubmenu: true, submenu: {
      type: 'matrix',
    }},
  ]
};
