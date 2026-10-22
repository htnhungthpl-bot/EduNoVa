import { UserProfile, DbSchool, DbClass, DbAuditLog } from '../types';

const TOKEN_KEY = 'edunova_auth_token';
const USER_KEY = 'edunova_auth_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredUser(): UserProfile | null {
  const data = localStorage.getItem(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile | null) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

// Universal fetch with Bearer token
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(credentials: {
    role: string;
    username?: string;
    password?: string;
    fullName?: string;
    className?: string;
    pinCode?: string;
  }): Promise<{ token: string; user: any; mustChangePassword?: boolean }> {
    const res = await apiRequest<{ token: string; user: any; mustChangePassword?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setStoredToken(res.token);
    const profile: UserProfile = {
      id: res.user.id,
      name: res.user.fullName,
      username: res.user.username,
      role: res.user.role,
      school: res.user.schoolName || 'Trường Tiểu học Kim Liên A',
      schoolId: res.user.schoolId,
      className: res.user.className || 'Lớp 4A1',
      classId: res.user.classId,
      avatar: res.user.avatar || (res.user.role === 'teacher' ? '👩‍🏫' : '🎒'),
      email: res.user.email,
      studentCode: res.user.studentCode,
      pinCode: res.user.pinCode,
      mustChangePassword: res.mustChangePassword,
    };
    setStoredUser(profile);
    return res;
  },

  async loginWithGoogle(profileData: {
    email: string;
    name?: string;
    fullName?: string;
    className?: string;
    schoolName?: string;
    googleId?: string;
    avatar?: string;
  }): Promise<{ token?: string; user?: any; isNew?: boolean; email?: string; message?: string }> {
    const res = await apiRequest<{ token?: string; user?: any; isNew?: boolean; email?: string; message?: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
    if (res.token && res.user) {
      setStoredToken(res.token);
      const profile: UserProfile = {
        id: res.user.id,
        name: res.user.fullName,
        username: res.user.username,
        role: res.user.role,
        school: res.user.schoolName || 'Trường Tiểu học',
        schoolId: res.user.schoolId,
        className: res.user.className || 'Lớp 4A1',
        classId: res.user.classId,
        avatar: res.user.avatar || '👩‍🏫',
        email: res.user.email,
        mustChangePassword: false,
      };
      setStoredUser(profile);
    }
    return res;
  },

  async registerWithGoogle(teacherData: {
    email: string;
    fullName: string;
    className: string;
    schoolName: string;
    avatar?: string;
  }): Promise<{ token: string; user: any; message: string }> {
    const res = await apiRequest<{ token: string; user: any; message: string }>('/api/auth/google-register', {
      method: 'POST',
      body: JSON.stringify(teacherData),
    });
    if (res.token && res.user) {
      setStoredToken(res.token);
      const profile: UserProfile = {
        id: res.user.id,
        name: res.user.fullName,
        username: res.user.username,
        role: res.user.role,
        school: res.user.schoolName || teacherData.schoolName,
        schoolId: res.user.schoolId,
        className: res.user.className || teacherData.className,
        classId: res.user.classId,
        avatar: res.user.avatar || '👩‍🏫',
        email: res.user.email,
        mustChangePassword: false,
      };
      setStoredUser(profile);
    }
    return res;
  },

  async getMe(): Promise<UserProfile | null> {
    try {
      const res = await apiRequest<{ user: any }>('/api/auth/me');
      const profile: UserProfile = {
        id: res.user.id,
        name: res.user.fullName,
        username: res.user.username,
        role: res.user.role,
        school: res.user.schoolName || 'Trường Tiểu học Kim Liên A',
        schoolId: res.user.schoolId,
        className: res.user.className || 'Lớp 4A1',
        classId: res.user.classId,
        avatar: res.user.avatar || '🎒',
        email: res.user.email,
        studentCode: res.user.studentCode,
        pinCode: res.user.pinCode,
        mustChangePassword: res.user.mustChangePassword,
      };
      setStoredUser(profile);
      return profile;
    } catch {
      return null;
    }
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },

  async resetAdminPassword(): Promise<{ success: boolean; message: string; defaultPassword: string; username: string }> {
    return apiRequest<{ success: boolean; message: string; defaultPassword: string; username: string }>('/api/auth/reset-admin-password', {
      method: 'POST',
    });
  },

  logout() {
    setStoredToken(null);
    setStoredUser(null);
  },

  // Users & Students
  async getUsers(): Promise<any[]> {
    return apiRequest<any[]>('/api/users');
  },

  async createUser(userData: any): Promise<any> {
    return apiRequest<any>('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async updateUser(id: string, updateData: any): Promise<any> {
    return apiRequest<any>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  async bulkImportStudents(students: any[], classId?: string, className?: string): Promise<any> {
    return apiRequest<any>('/api/students/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ students, classId, className }),
    });
  },

  // Schools & Classes
  async getSchools(): Promise<DbSchool[]> {
    return apiRequest<DbSchool[]>('/api/schools');
  },

  async getClasses(): Promise<DbClass[]> {
    return apiRequest<DbClass[]>('/api/classes');
  },

  async createClass(classData: { name: string; grade?: number; schoolId?: string; teacherIds?: string[] }): Promise<DbClass> {
    return apiRequest<DbClass>('/api/classes', {
      method: 'POST',
      body: JSON.stringify(classData),
    });
  },

  // Assignments
  async getAssignments(): Promise<any[]> {
    return apiRequest<any[]>('/api/assignments');
  },

  async createAssignment(assignmentData: any): Promise<any> {
    return apiRequest<any>('/api/assignments', {
      method: 'POST',
      body: JSON.stringify(assignmentData),
    });
  },

  // Submissions
  async getSubmissions(): Promise<any[]> {
    return apiRequest<any[]>('/api/submissions');
  },

  async submitEssay(submission: {
    assignmentId?: string;
    lessonId: string;
    lessonTitle: string;
    content: string;
    wordCount: number;
  }): Promise<any> {
    return apiRequest<any>('/api/submissions', {
      method: 'POST',
      body: JSON.stringify(submission),
    });
  },

  async reviewSubmission(id: string, reviewData: {
    score?: number;
    teacherComment?: string;
    rubricScores?: any[];
    isPublished: boolean;
    stickersEarned?: string[];
  }): Promise<any> {
    return apiRequest<any>(`/api/submissions/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  },

  async requestRevision(id: string, revisionNotes: string): Promise<any> {
    return apiRequest<any>(`/api/submissions/${id}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ revisionNotes }),
    });
  },

  // Diamond Notes
  async getDiamondNotes(): Promise<any[]> {
    return apiRequest<any[]>('/api/diamond-notes');
  },

  async createDiamondNote(note: {
    title: string;
    content: string;
    category: string;
    tags?: string[];
  }): Promise<any> {
    return apiRequest<any>('/api/diamond-notes', {
      method: 'POST',
      body: JSON.stringify(note),
    });
  },

  async deleteDiamondNote(id: string): Promise<any> {
    return apiRequest<any>(`/api/diamond-notes/${id}`, {
      method: 'DELETE',
    });
  },

  // AI Coach (Gemini 3.8 Flash via server)
  async callAiCoach(params: {
    mode: 'goi_mo_tim_y' | 'lam_ro_cau' | 'phat_trien_chi_tiet' | 'lap_dan_y' | 'the_hien_cam_xuc' | 'doc_lai_gop_y' | 'tong_hop_lop_hoc';
    prompt?: string;
    currentText?: string;
    lessonTitle?: string;
    genre?: string;
  }): Promise<{ isOfflineGuidance: boolean; quota?: any; response: string }> {
    return apiRequest<{ isOfflineGuidance: boolean; quota?: any; response: string }>('/api/ai/coach', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // Reports
  async getClassSummaryReport(className?: string): Promise<any> {
    const q = className ? `?className=${encodeURIComponent(className)}` : '';
    return apiRequest<any>(`/api/reports/class-summary${q}`);
  },

  // Admin Audit Logs & Cleanup
  async getAuditLogs(): Promise<DbAuditLog[]> {
    return apiRequest<DbAuditLog[]>('/api/audit-logs');
  },

  async cleanDemoData(): Promise<any> {
    return apiRequest<any>('/api/admin/clean-demo-data', {
      method: 'POST',
    });
  },
};
