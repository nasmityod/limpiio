'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import {
  Users, Plus, KeyRound, Trash2, Loader2, X, Check, AlertCircle,
  UserCircle, SlidersHorizontal, Crown, ChevronDown, Search,
  ChevronLeft, ChevronRight, ShieldCheck,
} from 'lucide-react';
import {
  type AdminUser,
  type PermissionAuditEntry,
  createAdminUser,
  updateUserPermissions,
  resetUserPassword,
  deleteAdminUser,
} from '@/app/actions/userActions';
import { DataTable, type DataTableColumn } from '@/components/admin/DataTable';
import { TouchIconButton } from '@/components/admin/TouchIconButton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { isAdminRole } from '@/lib/is-admin-role';
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_META,
  getPermissionsByGroup,
  normalizePermissionDependencies,
  type AdminPermission,
} from '@/lib/admin-permissions';

interface UsersClientProps {
  /** Primera página renderizada en servidor. */
  users:       AdminUser[];
  /** Total de usuarios existentes (no sólo los de la página). */
  total:       number;
  pageSize:    number;
  auditLog:    PermissionAuditEntry[];
  currentUserId: string;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { year: 'numeric', month: 'short', day: 'numeric' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ─── Chip de permisos resumidos ──────────────────────────────────────────────

function PermissionChips({ permissions }: { permissions: AdminPermission[] }) {
  const MAX_VISIBLE = 3;
  const visible = permissions.slice(0, MAX_VISIBLE);
  const rest = permissions.length - MAX_VISIBLE;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {visible.map(p => (
        <span key={p} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
          {ADMIN_PERMISSION_META[p].label}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">+{rest}</span>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function UsersClient({
  users: initial,
  total: initialTotal,
  pageSize,
  auditLog: initialLog,
  currentUserId,
}: UsersClientProps) {
  const [users, setUsers]               = useState(initial);
  const [total, setTotal]               = useState(initialTotal);
  const [page, setPage]                 = useState(1);
  const [searchInput, setSearchInput]   = useState('');
  const [onlyStaff, setOnlyStaff]       = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [auditLog, setAuditLog]         = useState(initialLog);
  const [createOpen, setCreateOpen]     = useState(false);
  const [permUser, setPermUser]         = useState<AdminUser | null>(null);
  const [resetUser, setResetUser]       = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [feedback, setFeedback]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const search = useDebouncedValue(searchInput, 300);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4500);
  };

  /** Guardia de concurrencia: sólo la respuesta más reciente escribe estado. */
  const requestSeq = useRef(0);

  const loadUsers = useCallback(async () => {
    const seq = ++requestSeq.current;
    setRefreshing(true);
    try {
      const { listAdminUsers } = await import('@/app/actions/userActions');
      const result = await listAdminUsers({ search, page, pageSize, onlyStaff });
      if (seq !== requestSeq.current) return;
      setUsers(result.users);
      setTotal(result.total);
      if (result.users.length === 0 && page > 1) setPage(p => Math.max(1, p - 1));
    } finally {
      if (seq === requestSeq.current) setRefreshing(false);
    }
  }, [search, page, pageSize, onlyStaff]);

  // La primera página ya viene del servidor; no se vuelve a pedir al montar.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    void loadUsers();
  }, [loadUsers]);

  // Volver a la primera página al cambiar de filtro.
  const filterKey = `${search}|${onlyStaff}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey]);

  const refresh = async () => {
    const { listPermissionAuditLog } = await import('@/app/actions/userActions');
    const [, newLog] = await Promise.all([loadUsers(), listPermissionAuditLog()]);
    setAuditLog(newLog);
  };

  const handleDelete = async (u: AdminUser) => {
    const res = await deleteAdminUser(u.id);
    if (res.success) {
      flash('success', res.message);
      await refresh();
    } else flash('error', res.message);
    setDeleteConfirm(null);
  };

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: 'name', header: 'Usuario', primary: true,
      cell: u => (
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {u.isSuperAdmin && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                <Crown size={9} /> Propietario · Acceso total
              </span>
            )}
            <span className="block truncate">
              {u.name || <span className="text-gray-400 italic">Sin nombre</span>}
              {u.id === currentUserId && (
                <span className="ml-1.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">tú</span>
              )}
            </span>
          </div>
          {!u.isSuperAdmin && u.adminPermissions.length > 0 && (
            <PermissionChips permissions={u.adminPermissions} />
          )}
          {!u.isSuperAdmin && u.adminPermissions.length === 0 && !isAdminRole(u.role) && (
            <span className="text-[10px] text-gray-400 mt-0.5 block">Cliente</span>
          )}
          {!u.isSuperAdmin && u.adminPermissions.length === 0 && isAdminRole(u.role) && (
            <span className="text-[10px] text-orange-500 mt-0.5 block">Admin sin permisos</span>
          )}
        </div>
      ),
    },
    {
      key: 'email', header: 'Email', secondary: true, mobileLabel: 'Email',
      cell: u => <span className="text-gray-500 truncate text-sm">{u.email}</span>,
    },
    {
      key: 'role', header: 'Acceso', mobileLabel: 'Acceso',
      cell: u => {
        if (u.isSuperAdmin) return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Crown size={10} /> Superadmin
          </span>
        );
        if (u.adminPermissions.length > 0) return (
          <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Acceso administrativo · {u.adminPermissions.length} secciones
          </span>
        );
        return (
          <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
            Cliente
          </span>
        );
      },
    },
    {
      key: 'orders', header: 'Pedidos', mobileLabel: 'Pedidos', align: 'right',
      cell: u => <span className="text-sm font-mono text-gray-600">{u.orderCount}</span>,
    },
    {
      key: 'createdAt', header: 'Alta', mobileLabel: 'Alta', hideOnMobile: true,
      cell: u => <span className="text-xs text-gray-500">{formatDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-amber-50 text-navy flex items-center justify-center">
            <Users size={22} />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-navy">Usuarios</h1>
            <p className="text-xs text-gray-500 mt-0.5">Gestiona accesos al panel y a la cuenta de cliente.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[48px] inline-flex items-center justify-center gap-1.5 px-4 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide rounded-xl active:bg-yellow-300"
        >
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          feedback.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Búsqueda y filtro — evitan tener que listar toda la tabla `User` */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            type="search"
            placeholder="Buscar por nombre o email…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 min-w-0 text-base sm:text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          {refreshing && <Loader2 size={14} className="text-gray-400 animate-spin flex-shrink-0" aria-hidden />}
        </div>
        <button
          type="button"
          onClick={() => setOnlyStaff(v => !v)}
          aria-pressed={onlyStaff}
          className={`min-h-[40px] px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition ${
            onlyStaff
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-gray-600 border-gray-200 active:bg-gray-100'
          }`}
        >
          <ShieldCheck size={14} /> Solo personal
        </button>
      </div>

      {/* Tabla de usuarios */}
      <DataTable<AdminUser>
        data={users}
        columns={columns}
        refreshing={refreshing}
        emptyState="No hay usuarios que coincidan con la búsqueda."
        rowKey={u => u.id}
        mobileLeading={u => (
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
            u.isSuperAdmin
              ? 'bg-amber-100 text-amber-700'
              : isAdminRole(u.role)
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500'
          }`}>
            <UserCircle size={22} />
          </span>
        )}
        actions={u => (
          <>
            {/* Superadmin: solo badge informativo */}
            {u.isSuperAdmin ? (
              <span className="text-[11px] text-gray-400 italic px-1">
                Inmutable
              </span>
            ) : (
              <>
                <TouchIconButton
                  label="Configurar permisos"
                  variant="primary"
                  icon={<SlidersHorizontal size={18} />}
                  onClick={() => setPermUser(u)}
                />
                <TouchIconButton
                  label="Resetear contraseña"
                  icon={<KeyRound size={18} />}
                  onClick={() => setResetUser(u)}
                />
                <TouchIconButton
                  label="Eliminar"
                  variant="danger"
                  icon={<Trash2 size={18} />}
                  onClick={() => setDeleteConfirm(u)}
                  disabled={u.id === currentUserId}
                />
              </>
            )}
          </>
        )}
      />

      {/* Paginación */}
      {(total > pageSize || page > 1) && (
        <nav
          aria-label="Paginación de usuarios"
          className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2"
        >
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || refreshing}
            aria-label="Página anterior"
            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Anterior</span>
          </button>
          <p className="text-[11px] sm:text-xs text-gray-600 text-center tabular-nums" aria-live="polite">
            <span className="font-semibold text-navy">
              {total === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + users.length}
            </span>
            <span className="mx-1">de</span>
            <span className="font-semibold text-navy">{total}</span>
            <span className="block sm:inline sm:ml-2 text-gray-400">
              Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setPage(p => p + 1)}
            disabled={page * pageSize >= total || refreshing}
            aria-label="Página siguiente"
            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight size={16} />
          </button>
        </nav>
      )}

      {/* Superadmin notice */}
      {users.some(u => u.isSuperAdmin) && (
        <p className="text-xs text-gray-400 px-1">
          * El acceso del propietario es inmutable y solo puede marcarse directamente en Prisma.
        </p>
      )}

      {/* Auditoría */}
      {auditLog.length > 0 && (
        <AuditLogSection entries={auditLog} />
      )}

      {/* Diálogos */}
      {createOpen && (
        <CreateUserDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); setSearchInput(''); setPage(1); refresh(); flash('success', 'Usuario creado. Asigna sus permisos.'); }}
        />
      )}
      {permUser && (
        <PermissionsDialog
          user={permUser}
          onClose={() => setPermUser(null)}
          onSaved={msg => { setPermUser(null); refresh(); flash('success', msg); }}
          onError={msg => flash('error', msg)}
        />
      )}
      {resetUser && (
        <ResetPasswordDialog
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => { setResetUser(null); flash('success', 'Contraseña actualizada.'); }}
        />
      )}
      {deleteConfirm && (
        <DeleteConfirmDialog
          user={deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm)}
        />
      )}
    </div>
  );
}

// ─── Diálogo de permisos ─────────────────────────────────────────────────────

function PermissionsDialog({
  user, onClose, onSaved, onError,
}: {
  user:    AdminUser;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<Set<AdminPermission>>(
    new Set(user.adminPermissions),
  );
  const [pending, startTransition] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap y Escape
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const firstFocusable = el.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusables = el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
        const first = focusables[0];
        const last  = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const toggle = (perm: AdminPermission) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return new Set(normalizePermissionDependencies([...next]));
    });
  };

  const handleSelectAll = () => {
    setSelected(new Set(ADMIN_PERMISSIONS));
  };

  const handleClearAll = () => {
    if (user.adminPermissions.length > 0 && !confirmClear) {
      setConfirmClear(true);
      return;
    }
    setSelected(new Set());
    setConfirmClear(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateUserPermissions({
        userId:      user.id,
        permissions: [...selected],
      });
      if (res.success) onSaved(res.message);
      else onError(res.message);
    });
  };

  const groups = getPermissionsByGroup();
  const count  = selected.size;
  const wasAdmin = user.adminPermissions.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-dialog-title"
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        className="relative z-10 w-full sm:w-[520px] sm:max-w-[92vw] sm:my-6 bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[90vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <header className="sticky top-0 bg-white sm:rounded-t-2xl border-b border-gray-100 px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}>
          <div>
            <h2 id="perm-dialog-title" className="text-base font-black text-navy">Permisos de usuario</h2>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </header>

        {/* Acciones rápidas */}
        <div className="px-4 py-2 flex gap-2 border-b border-gray-50">
          <button type="button" onClick={handleSelectAll} className="text-xs text-blue-600 font-semibold underline underline-offset-2 min-h-[36px] px-2">
            Seleccionar todos
          </button>
          <button type="button" onClick={handleClearAll} className="text-xs text-gray-500 font-semibold underline underline-offset-2 min-h-[36px] px-2">
            Quitar todos
          </button>
        </div>

        {/* Confirmación de quitar todos */}
        {confirmClear && (
          <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800">
            <p className="font-semibold mb-2">Este usuario volverá a ser Cliente y perderá acceso al panel administrativo.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setSelected(new Set()); setConfirmClear(false); }}
                className="flex-1 min-h-[40px] bg-orange-600 text-white text-sm font-bold rounded-lg">
                Confirmar
              </button>
              <button type="button" onClick={() => setConfirmClear(false)}
                className="flex-1 min-h-[40px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Checkboxes agrupados */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {groups.map(({ group, permissions }) => (
            <div key={group}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{group}</h3>
              <div className="space-y-1">
                {permissions.map(perm => {
                  const meta    = ADMIN_PERMISSION_META[perm];
                  const checked = selected.has(perm);
                  const id      = `perm-${perm}`;
                  return (
                    <label
                      key={perm}
                      htmlFor={id}
                      className={`flex items-start gap-3 rounded-xl px-3 py-3 cursor-pointer min-h-[44px] border transition-colors ${
                        checked
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-transparent hover:border-gray-200'
                      }`}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(perm)}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 flex-shrink-0"
                      />
                      <div>
                        <span className="block text-sm font-semibold text-gray-800">{meta.label}</span>
                        <span className="block text-xs text-gray-500">{meta.description}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3 space-y-2">
          <p className="text-xs text-center text-gray-500">
            {count === 0
              ? 'Sin permisos: el usuario será Cliente.'
              : `Este usuario tendrá acceso a ${count} de ${ADMIN_PERMISSIONS.length} secciones.`}
            {' '}Pagos y exportación de clientes incluyen Pedidos automáticamente.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={pending}
              className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={pending}
              className="flex-1 min-h-[48px] bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl flex items-center justify-center gap-2">
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Guardar permisos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sección de auditoría ────────────────────────────────────────────────────

function AuditLogSection({ entries }: { entries: PermissionAuditEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-bold text-gray-700">Cambios recientes de permisos</span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
          {entries.map(e => (
            <div key={e.id} className="px-4 py-3 text-xs space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-700 truncate">{e.targetEmail}</span>
                <span className="text-gray-400 flex-shrink-0">{formatDateTime(e.createdAt)}</span>
              </div>
              <div className="text-gray-500">
                <span className="font-medium text-gray-600">{e.actorEmail}</span>
                {' '}&rarr; {e.targetRoleBefore} → {e.targetRoleAfter}
              </div>
              {e.afterPermissions.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.afterPermissions.map(p => (
                    <span key={p} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">
                      {ADMIN_PERMISSION_META[p as AdminPermission]?.label ?? p}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-gray-400 italic">Sin permisos (Cliente)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Diálogo de creación ─────────────────────────────────────────────────────

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError]       = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createAdminUser({ name, email, password });
      if (res.success) onCreated();
      else setError(res.message);
    });
  };

  return (
    <Dialog title="Nuevo usuario" onClose={onClose}>
      <p className="text-xs text-gray-500">El usuario se crea sin permisos. Podrás asignarlos a continuación.</p>
      <DialogField label="Nombre completo" value={name} onChange={setName} />
      <DialogField label="Email" type="email" value={email} onChange={setEmail} />
      <DialogField label="Contraseña" type="password" value={password} onChange={setPassword} hint="Mínimo 8 caracteres." />
      {error && (
        <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
      <DialogFooter>
        <button type="button" onClick={onClose} disabled={pending} className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl">Cancelar</button>
        <button type="button" onClick={submit} disabled={pending} className="flex-1 min-h-[48px] bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl flex items-center justify-center gap-2">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear
        </button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Diálogo de reset de contraseña ─────────────────────────────────────────

function ResetPasswordDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError]       = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await resetUserPassword({ userId: user.id, password });
      if (res.success) onDone();
      else setError(res.message);
    });
  };

  return (
    <Dialog title={`Nueva contraseña — ${user.email}`} onClose={onClose}>
      <DialogField label="Nueva contraseña" type="password" value={password} onChange={setPassword} hint="Mínimo 8 caracteres." />
      {error && (
        <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
      <DialogFooter>
        <button type="button" onClick={onClose} disabled={pending} className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl">Cancelar</button>
        <button type="button" onClick={submit} disabled={pending} className="flex-1 min-h-[48px] bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl flex items-center justify-center gap-2">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Cambiar
        </button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Diálogo de confirmación de eliminar ─────────────────────────────────────

function DeleteConfirmDialog({ user, onClose, onConfirm }: { user: AdminUser; onClose: () => void; onConfirm: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog title={`Eliminar usuario`} onClose={onClose}>
      <p className="text-sm text-gray-700">
        ¿Confirmas que deseas eliminar <strong>{user.email}</strong>? Esta acción no se puede deshacer.
      </p>
      <DialogFooter>
        <button type="button" onClick={onClose} disabled={pending} className="flex-1 min-h-[48px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl">Cancelar</button>
        <button type="button" onClick={() => startTransition(onConfirm)} disabled={pending}
          className="flex-1 min-h-[48px] bg-red-600 text-white text-sm font-black uppercase rounded-xl flex items-center justify-center gap-2">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Eliminar
        </button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Primitivos ──────────────────────────────────────────────────────────────

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full sm:w-[420px] sm:max-w-[92vw] sm:my-6 bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <header className="sticky top-0 bg-white sm:rounded-t-2xl border-b border-gray-100 px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}>
          <h2 className="text-base font-black text-navy truncate">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 pt-2">{children}</div>;
}

function DialogField({ label, value, onChange, type = 'text', hint }: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  type?:    string;
  hint?:    string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
      />
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
