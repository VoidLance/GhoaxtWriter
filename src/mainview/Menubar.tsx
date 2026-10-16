import { useEffect, useRef, useState } from "react";

export type MenuItem = {
  label?: string;
  shortcut?: string;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
};

export type MenuDef = { label: string; items: MenuItem[] };

function MenuList({ items, onClose, nested = false }: { items: MenuItem[]; onClose: () => void; nested?: boolean }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div
      className="absolute rounded-lg border border-slate-700 bg-slate-900 text-slate-100 py-1 shadow-2xl"
      style={{ minWidth: 270, zIndex: 70, left: nested ? "100%" : 0, top: nested ? 0 : "100%" }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={index} className="my-1 border-t border-slate-700" />
        ) : (
          <div key={index} className="relative" onMouseEnter={() => setSub(item.submenu ? index : null)}>
            <button
              type="button"
              disabled={item.disabled}
              // Keep focus in the editor so cut/copy and selection commands still work.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (item.submenu) return;
                onClose();
                item.run?.();
              }}
              className="flex w-full justify-between items-center gap-6 px-3 py-1.5 text-left bg-transparent hover:bg-slate-800"
              style={{ opacity: item.disabled ? 0.4 : 1 }}
            >
              <span>
                {item.checked !== undefined && <span style={{ display: "inline-block", width: 18 }}>{item.checked ? "✓" : ""}</span>}
                {item.label}
              </span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{item.submenu ? "▸" : item.shortcut}</span>
            </button>
            {item.submenu && sub === index && <MenuList items={item.submenu} onClose={onClose} nested />}
          </div>
        ),
      )}
    </div>
  );
}

export function Menubar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="flex items-center">
      {menus.map((menu, index) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              setOpen(open === index ? null : index);
            }}
            onMouseEnter={() => open !== null && setOpen(index)}
            className={`px-3 py-1 rounded-md bg-transparent ${open === index ? "bg-slate-800" : "hover:bg-slate-800"}`}
          >
            {menu.label}
          </button>
          {open === index && <MenuList items={menu.items} onClose={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  );
}
