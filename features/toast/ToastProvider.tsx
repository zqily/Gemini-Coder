import React, { useState, useCallback, ReactNode } from 'react';
import { ToastContext, ToastType } from './ToastContext';
import { CheckCircle, XCircle, X } from '../../components/icons';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

const Toast: React.FC<{ toast: ToastMessage; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300); // Allow time for exit animation
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const isSuccess = toast.type === 'success';
  const Icon = isSuccess ? CheckCircle : XCircle;
  const iconColor = isSuccess ? 'text-green-400' : 'text-red-400';
  const borderColor = isSuccess ? 'border-green-500' : 'border-red-500';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start w-full max-w-sm p-4 text-gray-200 bg-[#2c2d2f] rounded-lg shadow-lg border-l-4 ${borderColor} ${isExiting ? 'animate-toast-out' : 'animate-toast-in'}`}
    >
      <div className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 ${iconColor}`}>
        <Icon size={20} />
      </div>
      <div className="ml-3 text-sm font-normal">{toast.message}</div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 bg-transparent text-gray-400 hover:text-white rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-700 inline-flex items-center justify-center h-8 w-8"
        aria-label="Close"
        onClick={handleDismiss}
      >
        <span className="sr-only">Close</span>
        <X size={20} />
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random(); // Add random to prevent key collision with fast toasts
    setToasts((prevToasts) => [...prevToasts, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[100] flex flex-col items-end gap-3"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
