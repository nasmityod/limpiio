'use client';
import { useRef } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export function useAdminDialog(onClose: () => void, open = true, busy = false) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => { if (!busy) onClose(); };
  useBodyScrollLock(open);
  useFocusTrap({ containerRef: dialogRef, enabled: open, onClose: close });
  return { dialogRef, close };
}
