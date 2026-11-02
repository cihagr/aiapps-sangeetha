// Fix: Defined TabName explicitly to remove dependency on a non-existent export.
export type TabName = 'numeric' | 'functions' | 'symbols' | 'alpha' | 'greek';

export type StructureSymbol = {
  display: string;
  label: string;
};

export type Template = {
  text: string;
  cursor: number;
  dynamic?: boolean;
};
