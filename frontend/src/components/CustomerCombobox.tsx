import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { currency } from "../lib/currency";
import type { Contact } from "../types";

type Props = {
  contacts: Contact[];
  selectedContactId: string;
  onSelect: (contact: Contact) => void;
};

/** Searchable customer dropdown with keyboard navigation (arrows, Enter, Escape). */
export default function CustomerCombobox({ contacts, selectedContactId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedContact = contacts.find((c) => c.contact_id === selectedContactId);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        (c.contact_name || "").toLowerCase().includes(q) ||
        (c.company_name || "").toLowerCase().includes(q),
    );
  }, [contacts, query]);

  function selectContact(contact: Contact) {
    onSelect(contact);
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlightedIndex((i) => Math.min(i + 1, filteredContacts.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      const contact = filteredContacts[highlightedIndex];
      if (contact) selectContact(contact);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="field" ref={fieldRef}>
      <label className="field-label" htmlFor="customer-select">
        Customer
      </label>
      <div className="select-wrap combobox">
        <input
          id="customer-select"
          className="select"
          type="text"
          autoComplete="off"
          placeholder="Select a customer"
          value={isOpen ? query : selectedContact?.contact_name || selectedContact?.company_name || ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            setQuery("");
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown className="select-wrap__chevron" size={18} />
        {isOpen && (
          <div className="combobox__list" role="listbox">
            {filteredContacts.length === 0 ? (
              <div className="combobox__empty">No customers found</div>
            ) : (
              filteredContacts.map((c, index) => (
                <div
                  key={c.contact_id}
                  role="option"
                  aria-selected={c.contact_id === selectedContactId}
                  className={`combobox__option${index === highlightedIndex ? " combobox__option--highlighted" : ""}`}
                  onMouseDown={() => selectContact(c)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {c.contact_name || c.company_name}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {selectedContact && (
        <div className="customer-outstanding">
          Outstanding balance: {currency(selectedContact.outstanding_receivable_amount)}
        </div>
      )}
    </div>
  );
}
