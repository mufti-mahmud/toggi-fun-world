import { useState, useEffect } from 'react';
import { Operator } from '../types';

export type Role = 'admin' | 'operator' | 'operation-officer' | 'maintenance' | 'maintenance-kpi' | 'cx' | 'information-desk' | 'management' | null;

export const useAuth = () => {
  const [role, setRole] = useState<Role>(() => {
    try {
      const stored = localStorage.getItem('tfw_role');
      if (stored === 'ticket-sales' || stored === 'sales-officer') {
        localStorage.removeItem('tfw_role');
        localStorage.removeItem('tfw_user');
        return null;
      }
      return (stored as Role) || null;
    } catch {
      return null;
    }
  });

  const [currentUser, setCurrentUser] = useState<Operator | null>(() => {
    try {
      const stored = localStorage.getItem('tfw_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') return parsed;
      }
      const storedRole = localStorage.getItem('tfw_role') as Role;
      if (storedRole) {
        const fallbackUser: Operator = {
          id: 1,
          name: storedRole.charAt(0).toUpperCase() + storedRole.slice(1)
        };
        try {
          localStorage.setItem('tfw_user', JSON.stringify(fallbackUser));
        } catch {}
        return fallbackUser;
      }
    } catch {}
    return null;
  });

  const login = (newRole: Role, payload?: string | Operator): boolean => {
    try {
      setRole(newRole);
      if (newRole) {
        localStorage.setItem('tfw_role', newRole);
      } else {
        localStorage.removeItem('tfw_role');
      }

      let user: Operator;
      if (typeof payload === 'object' && payload !== null) {
        user = payload;
      } else {
        user = { id: 1, name: (typeof payload === 'string' ? payload : undefined) || newRole || 'Authorized User' };
      }
      
      setCurrentUser(user);
      localStorage.setItem('tfw_user', JSON.stringify(user));
      return true;
    } catch (e) {
      console.error('Failed to persist auth session:', e);
      return false;
    }
  };

  const logout = () => {
    try {
      setRole(null);
      setCurrentUser(null);
      localStorage.removeItem('tfw_role');
      localStorage.removeItem('tfw_user');
    } catch {}
  };

  return { role, currentUser, login, logout };
};