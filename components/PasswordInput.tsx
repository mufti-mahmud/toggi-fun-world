import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Pass with onVisibleChange to share one show/hide state across fields (e.g. password + confirm). */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ visible, onVisibleChange, className = '', ...inputProps }, ref) => {
    const [ownVisible, setOwnVisible] = useState(false);
    const isVisible = visible ?? ownVisible;
    const toggle = () => {
      if (onVisibleChange) onVisibleChange(!isVisible);
      else setOwnVisible(!isVisible);
    };

    return (
      <div className="relative">
        <input ref={ref} type={isVisible ? 'text' : 'password'} className={`${className} pr-10`} {...inputProps} />
        <button
          type="button"
          onClick={toggle}
          disabled={inputProps.disabled}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          title={isVisible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 cursor-pointer"
        >
          {isVisible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
