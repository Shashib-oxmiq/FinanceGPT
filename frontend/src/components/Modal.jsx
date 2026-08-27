import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

export default function Modal({ open, onClose, title, children, testid }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card border border-border rounded-3xl w-full max-w-2xl my-8 sm:my-0 max-h-[90vh] overflow-y-auto scroll-thin p-6 shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        data-testid={testid}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors" data-testid="modal-close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
