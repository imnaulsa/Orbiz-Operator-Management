import React, { useState, useRef, useEffect, useId } from 'react';

export interface SearchableOption {
  value: string;
  label: string;
  subLabel?: string;
  count?: number;
}

export interface SearchableSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Ketik untuk mencari...',
  disabled = false,
  className = '',
  style,
  ariaLabel,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();

  // Find currently selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Filtered options based on search query
  const filteredOptions = options.filter((opt) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const matchLabel = opt.label.toLowerCase().includes(q);
    const matchSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(q) : false;
    const matchVal = opt.value.toLowerCase().includes(q);
    return matchLabel || matchSub || matchVal;
  });

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(-1);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Click outside listener to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
        onChange(filteredOptions[focusedIndex].value);
        setIsOpen(false);
      } else if (filteredOptions.length > 0) {
        onChange(filteredOptions[0].value);
        setIsOpen(false);
      }
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const isFiltered = value !== 'all' && value !== '';

  return (
    <div
      ref={containerRef}
      className={`searchable-select-wrap ${className}`}
      style={style}
      onKeyDown={handleKeyDown}
    >
      {label && (
        <span className="field-label" id={`${baseId}-label`}>
          {label}
        </span>
      )}

      <button
        type="button"
        className={`searchable-select-trigger ${isFiltered ? 'is-active-filter' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? `${baseId}-label` : undefined}
        aria-label={ariaLabel || label || placeholder}
      >
        <span className="trigger-text">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {selectedOption && selectedOption.count !== undefined && (
          <span className="trigger-badge">{selectedOption.count}</span>
        )}
        <span className="trigger-chevron" aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="searchable-select-menu" role="dialog" aria-modal="false">
          <div className="searchable-select-search-box">
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusedIndex(-1);
              }}
              placeholder={searchPlaceholder}
              aria-label="Cari opsi"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <ul
            ref={listRef}
            className="searchable-select-list"
            role="listbox"
            tabIndex={-1}
          >
            {filteredOptions.length === 0 ? (
              <li className="searchable-select-empty">
                Tidak ada opsi yang cocok dengan &ldquo;{query}&rdquo;
              </li>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isFocused = idx === focusedIndex;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    className={`searchable-select-item ${isSelected ? 'is-selected' : ''} ${
                      isFocused ? 'is-focused' : ''
                    }`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <span className="item-label">
                      {isSelected ? <strong style={{ marginRight: 6 }}>✓</strong> : null}
                      {opt.label}
                    </span>
                    {(opt.subLabel || opt.count !== undefined) && (
                      <span className="item-sub">
                        {opt.subLabel}
                        {opt.count !== undefined ? ` (${opt.count})` : ''}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

