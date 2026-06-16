"use client";

import { useState, useEffect } from 'react';
import { getAdminUsers, upsertStaff, deleteStaff } from '@/app/actions/admin';
import { UserPlus, Pencil, Trash2, ShieldCheck, Loader2, KeyRound, Lock } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getAuthRole } from '@/app/actions/auth';

type AdminUser = {
  id: string;
  full_name: string;
  username: string;
  role: string;
  created_at: string;
};

export default function AdminUserManagement() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<AdminUser & { password?: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
    getAuthRole().then(r => setUserRole(r));
  }, []);

  if (userRole && userRole !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center p-8">
        <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
          <Lock className="w-10 h-10 text-red-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-primary mb-2">ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
          <p className="text-primary/50 font-medium">เฉพาะ Admin เท่านั้นที่สามารถจัดการบัญชีผู้ใช้งานและสิทธิ์การใช้งานได้</p>
        </div>
      </div>
    );
  }

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await getAdminUsers();
    if (data) setUsers(data as AdminUser[]);
    setLoading(false);
  };

  const openNewUserModal = () => {
    setEditingUser({ full_name: '', username: '', role: 'Manager', password: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (u: AdminUser) => {
    setEditingUser({ ...u, password: '' }); // Don't load password back
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Use upsertStaff action as it handles profiles table
      const res = await upsertStaff({
        ...editingUser,
        // For Admin users, we ensure full_name is at least the username if blank
        full_name: editingUser.full_name || editingUser.username
      });
      
      if (res.error) {
        alert(res.error);
      } else {
        setIsModalOpen(false);
        loadUsers();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ที่ต้องการลบผู้ใช้งานรายนี้? บัญชีนี้จะหมดสิทธิ์เข้าใช้งานทันที')) return;
    const res = await deleteStaff(id);
    if (!res.error) loadUsers();
  };

  return (
    <>
      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8 gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <ShieldCheck className="w-6 h-6" />
           </div>
           <div>
            <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.manageUsers}</h2>
            <p className="text-primary/60 text-sm font-medium mt-1">{t.manageUsersSub}</p>
          </div>
        </div>

        <button 
          onClick={openNewUserModal}
          className="flex items-center gap-2 bg-primary hover:bg-primary-light focus:ring-4 focus:ring-primary/20 transition-all text-white px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98]"
        >
          <UserPlus className="w-5 h-5" /> {t.addUser}
        </button>
      </div>

      <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden flex-1 relative min-h-[400px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-primary min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin opacity-50 mb-3" />
            <span className="font-bold opacity-50">Loading Users...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-full text-primary font-medium opacity-50 min-h-[400px]">
            No system users found.
          </div>
        ) : (
          <div className="overflow-auto p-2">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-white text-primary sticky top-0 z-10 text-xs font-bold uppercase tracking-widest border-b-2 border-primary/10">
                <tr>
                  <th className="px-6 py-5">{t.username}</th>
                  <th className="px-6 py-5">{t.displayName}</th>
                  <th className="px-6 py-5">{t.roleAccess}</th>
                  <th className="px-6 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-primary/5 transition-colors group">
                    <td className="px-6 py-4 font-mono font-bold text-primary">{u.username}</td>
                    <td className="px-6 py-4 text-primary font-medium">{u.full_name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                        u.role === 'Admin' ? 'bg-red-100 text-red-700' :
                        u.role === 'Manager' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => openEditModal(u)}
                        className="p-2 text-primary/50 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors border border-transparent hover:border-primary/20"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(u.id)}
                        className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-primary/20">
            <div className="bg-primary p-6 text-white flex items-center gap-3">
              <KeyRound className="w-6 h-6 text-gold" />
              <h3 className="text-2xl font-bold tracking-tight">{editingUser.id ? t.editAccess : t.addUser}</h3>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.username}</label>
                <input 
                  type="text" 
                  required
                  placeholder="เช่น admin_pattaya"
                  value={editingUser.username || ''}
                  onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono" 
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.password}</label>
                <input 
                  type="password" 
                  required={!editingUser.id}
                  placeholder={editingUser.id ? '(เว้นว่างเพื่อคงรหัสผ่านเดิม)' : '••••••••'}
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-medium text-primary" 
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.displayName}</label>
                <input 
                  type="text" 
                  value={editingUser.full_name || ''}
                  onChange={(e) => setEditingUser({...editingUser, full_name: e.target.value})}
                  placeholder="เช่น สมชาย ผู้ดูแล"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-medium text-primary" 
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.roleAccess}</label>
                <select 
                  value={editingUser.role || 'Manager'}
                  onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary appearance-none cursor-pointer"
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="HR">HR</option>
                </select>
                <p className="text-[10px] text-primary/40 mt-2 font-bold uppercase tracking-widest">{t.systemRolesOnly}</p>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl text-primary font-bold border border-primary/20 hover:bg-primary/5 transition-colors uppercase tracking-wide"
                >
                  {t.cancel}
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-light transition-colors uppercase tracking-wide disabled:opacity-50"
                >
                  {saving ? '...' : t.saveUser}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
