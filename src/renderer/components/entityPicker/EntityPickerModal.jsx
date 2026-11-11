import { FocusTrap } from "../FocusTrap.jsx";

export function EntityPickerModal({ children, onClose, entityLabel }) {
  return (
    <div className="entity-picker-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <FocusTrap active onEscape={onClose}>
        <section className="entity-picker-modal" role="dialog" aria-modal="true" aria-label={`Select ${entityLabel}`}>
          {children}
        </section>
      </FocusTrap>
    </div>
  );
}
