import { Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

interface SelectOption { value: string; label: string; description?: string }

export function FormSelect({ label, value, options, onChange, placeholder = "Chọn", disabled = false, searchable = false, required = false, icon: Icon, hideLabel = false, className = "" }: {
  label: string; value: string; options: SelectOption[]; onChange: (value: string) => void;
  placeholder?: string; disabled?: boolean; searchable?: boolean; required?: boolean; icon?: LucideIcon; hideLabel?: boolean; className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 320 });
  const selected = options.find((option) => option.value === value);
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN");
  const filtered = options.filter((option) => normalize(option.label).includes(normalize(query.trim())));
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function show() { setQuery(""); setActive(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(true); }
  function choose(next: string) { onChange(next); close(true); }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === "Tab") close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % Math.max(1, filtered.length));
    }
    if (open && event.key === "Enter") { event.preventDefault(); if (filtered[active]) choose(filtered[active].value); }
    if (open && (event.key === "Home" || event.key === "End") && !searchable) { event.preventDefault(); setActive(event.key === "Home" ? 0 : Math.max(0, filtered.length - 1)); }
  }
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function outside(event: MouseEvent) {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const bounds = trigger.current?.getBoundingClientRect(); if (!bounds) return;
      const below = window.innerHeight - bounds.bottom - 20;
      const height = Math.min(320, Math.max(150, below < 200 ? bounds.top - 20 : below));
      const actualHeight = Math.min(panel.current?.offsetHeight || height, height);
      const width = Math.min(Math.max(bounds.width, 160), window.innerWidth - 24);
      setPosition({ left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)), width, top: below < 200 ? Math.max(12, bounds.top - actualHeight - 8) : bounds.bottom + 8, maxHeight: height });
    }
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, filtered.length]);
  useEffect(() => { if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, open, id]);
  return <div className={`form-select-field${hideLabel ? " form-select-label-hidden" : ""}${className ? ` ${className}` : ""}`}>
    <span id={`${id}-label`} className="form-select-label">{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-options` : undefined} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined} aria-required={required} disabled={disabled} className={`form-select-trigger${open ? " open" : ""}${selected ? "" : " placeholder"}`} onClick={() => open ? close() : show()} onKeyDown={onKeyDown}>
      {Icon ? <Icon size={18}/> : null}<span>{selected?.label || placeholder}</span><ChevronDown size={16} className="form-select-chevron"/>
    </button>
    {open && createPortal(<div ref={panel} className="form-select-popover" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }} onKeyDown={onKeyDown}>
      {searchable ? <div className="form-select-search"><Search size={16}/><input ref={search} type="search" aria-label={`Tìm ${label.toLocaleLowerCase("vi-VN")}`} placeholder="Tìm theo tên nhà cung cấp..." value={query} aria-controls={`${id}-options`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} onChange={(event) => { setQuery(event.target.value); setActive(0); }}/></div> : null}
      <div className="form-select-options" id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`}>
        {filtered.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={option.value === value} tabIndex={-1} className={`form-select-option${index === active ? " highlighted" : ""}`} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)}><span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>{option.value === value ? <Check size={17}/> : null}</button>)}
        {!filtered.length ? <p className="form-select-empty">Không tìm thấy nhà cung cấp phù hợp.</p> : null}
      </div>
    </div>, document.body)}
  </div>;
}
