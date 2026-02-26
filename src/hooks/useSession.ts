// src/hooks/useSession.ts
import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const useSessionTimeout = () => {
  const { signOut } = useAuth();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      signOut();
    }, SESSION_TIMEOUT);
  };

  useEffect(() => {
    // Reset timeout on user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimeout, true);
    });

    resetTimeout();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [signOut]);
};