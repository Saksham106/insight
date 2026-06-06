"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  showCloseButton?: boolean;
  centeredHeader?: boolean;
  children: React.ReactNode;
}

export function Modal({
  title,
  description,
  onClose,
  showCloseButton = true,
  centeredHeader = false,
  children,
}: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          width: "100%",
          maxWidth: "400px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: centeredHeader ? "center" : "space-between",
            gap: "12px",
            textAlign: centeredHeader ? "center" : "left",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: centeredHeader ? "center" : "flex-start",
              gap: "4px",
              width: centeredHeader ? "100%" : "auto",
            }}
          >
            <h2 className="text-lg font-semibold text-navy">{title}</h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          {showCloseButton ? (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px",
                color: "var(--color-muted)",
                flexShrink: 0,
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
