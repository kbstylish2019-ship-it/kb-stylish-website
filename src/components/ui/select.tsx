'use client';

import React, { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}

interface SelectTriggerProps {
  className?: string;
  children: ReactNode;
}

interface SelectContentProps {
  className?: string;
  children: ReactNode;
}

interface SelectItemProps {
  value: string;
  children: ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

export function Select({ value, onValueChange, children }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          if (child.type === SelectTrigger) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: () => setIsOpen(!isOpen),
              isOpen
            });
          }
          if (child.type === SelectContent) {
            return isOpen ? React.cloneElement(child as React.ReactElement<any>, {
              onSelect: handleSelect,
              currentValue: value
            }) : null;
          }
        }
        return child;
      })}
    </div>
  );
}

export function SelectTrigger({ className = '', children, onClick, isOpen }: SelectTriggerProps & { onClick?: () => void; isOpen?: boolean }) {
  return (
    <button
      type="button"
      className={`w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
      onClick={onClick}
    >
      {children}
      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>
  );
}

export function SelectContent({ className = '', children, onSelect, currentValue }: SelectContentProps & { onSelect?: (value: string) => void; currentValue?: string }) {
  return (
    <div className={`absolute top-full left-0 right-0 z-50 mt-1 border border-gray-300 rounded-md shadow-lg ${className}`}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectItem) {
          return React.cloneElement(child as React.ReactElement<any>, {
            onSelect,
            isSelected: child.props.value === currentValue
          });
        }
        return child;
      })}
    </div>
  );
}

export function SelectItem({ value, children, onSelect, isSelected }: SelectItemProps & { onSelect?: (value: string) => void; isSelected?: boolean }) {
  return (
    <div
      className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-blue-50 text-blue-600' : ''}`}
      onClick={() => onSelect?.(value)}
    >
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }: SelectValueProps) {
  return (
    <span className="text-gray-500">
      {placeholder}
    </span>
  );
}
