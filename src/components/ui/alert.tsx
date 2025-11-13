import React, { ReactNode } from 'react';

interface AlertProps {
  className?: string;
  children: ReactNode;
}

interface AlertDescriptionProps {
  className?: string;
  children: ReactNode;
}

export function Alert({ className = '', children }: AlertProps) {
  return (
    <div className={`rounded-lg border p-4 ${className}`}>
      {children}
    </div>
  );
}

export function AlertDescription({ className = '', children }: AlertDescriptionProps) {
  return (
    <div className={`text-sm ${className}`}>
      {children}
    </div>
  );
}
