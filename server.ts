import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'edunova-official-jwt-secret-2026-vn';

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Database Models
export interface DbUser {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'school' | 'teacher' | 'student';
  passwordHash?: string;
  pinCode?: string; // 4-digit PIN for students
  studentCode?: string; // e.g. HS4A8-01
  mustChangePassword?: boolean;
  schoolId?: string;
  schoolName?: string;
  classId?: string;
  className?: string;
  status: 'active' | 'locked';
  email?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface DbSchool {
  id: string;
  name: string;
  code: string;
  address: string;
  email?: string;
  phone?: string;
  hotline: string;
  createdAt: string;
}

export interface DbClass {
  id: string;
  name: string; // e.g. Lớp 4A8
  grade: number; // 4
  maxStudents: number; // 36
  schoolId: string;
  schoolName: string;
  teacherIds: string[];
  teacherNames: string[];
  createdAt: string;
}

export interface DbAssignment {
  id: string;
  title: string;
  prompt: string;
  genre: string;
  targetWordCount: { min: number; max: number };
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  dueDate: string;
  allowAi: boolean;
  rubricLevels: string[];
  status: 'published' | 'draft';
  createdAt: string;
}

export interface RubricScoreItem {
  criterionId: string;
  criterionName: string;
  level: 'support_needed' | 'developing' | 'proficient' | 'advanced' | 'not_applicable';
  feedback?: string;
}

export interface DbSubmission {
  id: string;
  assignmentId?: string;
  lessonId: string;
  lessonTitle: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  studentClass: string;
  studentAvatar: string;
  schoolId?: string;
  submittedAt: string;
  status: 'pending' | 'graded' | 'needs_edit';
  score?: number;
  wordCount: number;
  content: string;
  draftContentAtSubmission?: string;
  versionCount: number;
  rubricScores?: RubricScoreItem[];
  draftTeacherComment?: string;
  teacherComment?: string;
  isPublishedToStudent: boolean; // CRITICAL: Teacher draft comment not visible until published!
  needsRevisionNotes?: string;
  stickersEarned?: string[];
  gradedAt?: string;
  gradedBy?: string;
  resubmittedCount: number;
}

export interface DbDiamondNote {
  id: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  title: string;
  content: string;
  category: 'quan_sat_that' | 'tuong_tuong' | 'hoc_lieu' | 'goi_y_ai';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DbAuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  details: string;
  ip?: string;
  timestamp: string;
}

export interface DatabaseSchema {
  version: number;
  isDemoCleaned: boolean;
  users: DbUser[];
  schools: DbSchool[];
  classes: DbClass[];
  assignments: DbAssignment[];
  submissions: DbSubmission[];
  diamondNotes: DbDiamondNote[];
  auditLogs: DbAuditLog[];
  aiQuotaDaily: Record<string, { count: number; date: string }>;
}

const DB_DIR = path.resolve(__dirname, 'data');
const DB_PATH = path.resolve(DB_DIR, 'edunova-db.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: DatabaseSchema = {
  version: 2,
  isDemoCleaned: true,
  users: [],
  schools: [],
  classes: [],
  assignments: [],
  submissions: [],
  diamondNotes: [],
  auditLogs: [],
  aiQuotaDaily: {},
};

function saveDb() {
  try {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error('[Database] Failed to atomic-save database to disk:', err);
  }
}

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      const loaded = JSON.parse(content);
      db = {
        version: loaded.version || 2,
        isDemoCleaned: loaded.isDemoCleaned ?? true,
        users: loaded.users || [],
        schools: loaded.schools || [],
        classes: loaded.classes || [],
        assignments: loaded.assignments || [],
        submissions: loaded.submissions || [],
        diamondNotes: loaded.diamondNotes || [],
        auditLogs: loaded.auditLogs || [],
        aiQuotaDaily: loaded.aiQuotaDaily || {},
      };
      console.log(`[Database] Loaded successfully. Users: ${db.users.length}, Classes: ${db.classes.length}, Assignments: ${db.assignments.length}, Submissions: ${db.submissions.length}`);
    } else {
      console.log('[Database] Initializing fresh official database...');
      initFreshDatabase();
    }
  } catch (err) {
    console.error('[Database] Error reading database file, initializing fresh:', err);
    initFreshDatabase();
  }
}

function initFreshDatabase() {
  const now = new Date().toISOString();
  const defaultSchoolId = 'school-kimlien-a';
  const defaultClassId = 'class-4a8';

  db = {
    version: 2,
    isDemoCleaned: true,
    schools: [
      {
        id: defaultSchoolId,
        name: 'Trường Tiểu học Kim Liên A',
        code: 'THKLA',
        address: 'Đống Đa, Hà Nội',
        email: 'tieuhockimliena@edu.vn',
        phone: '024 3852 1234',
        hotline: '0973793366',
        createdAt: now,
      },
    ],
    classes: [
      {
        id: defaultClassId,
        name: 'Lớp 4A8',
        grade: 4,
        maxStudents: 36,
        schoolId: defaultSchoolId,
        schoolName: 'Trường Tiểu học Kim Liên A',
        teacherIds: ['teacher-thu-ha'],
        teacherNames: ['Cô Nguyễn Thu Hà'],
        createdAt: now,
      },
    ],
    assignments: [
      {
        id: 'assign-01',
        title: 'Miêu tả cây bóng mát hoặc cây ăn quả gắn bó với em',
        prompt: 'Em hãy viết một bài văn ngắn (khoảng 150 – 200 từ) miêu tả một cây bóng mát (như cây bàng, phượng vĩ) hoặc cây ăn quả quen thuộc, thể hiện tình cảm của em đối với cây.',
        genre: 'Miêu tả cây cối',
        targetWordCount: { min: 140, max: 220 },
        classId: defaultClassId,
        className: 'Lớp 4A8',
        teacherId: 'teacher-thu-ha',
        teacherName: 'Cô Nguyễn Thu Hà',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        allowAi: true,
        rubricLevels: ['Cần hỗ trợ', 'Đang hình thành', 'Đạt yêu cầu', 'Vận dụng tốt'],
        status: 'published',
        createdAt: now,
      },
    ],
    users: [],
    submissions: [], // CLEAN: No fake mock student submissions
    diamondNotes: [],
    auditLogs: [],
    aiQuotaDaily: {},
  };

  // 1. ADMIN
  const adminSalt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('123456', adminSalt);
  db.users.push({
    id: 'user-admin-01',
    username: 'admin',
    fullName: 'Quản trị viên Hệ thống (Admin)',
    role: 'admin',
    passwordHash: adminHash,
    mustChangePassword: true,
    status: 'active',
    email: 'admin@edunova.edu.vn',
    avatar: '🛡️',
    createdAt: now,
    updatedAt: now,
  });

  // 2. SCHOOL
  const schoolSalt = bcrypt.genSaltSync(10);
  const schoolHash = bcrypt.hashSync('school@123', schoolSalt);
  db.users.push({
    id: 'user-school-01',
    username: 'bgh_kimlien_a',
    fullName: 'Ban Giám Hiệu – TH Kim Liên A',
    role: 'school',
    passwordHash: schoolHash,
    mustChangePassword: false,
    schoolId: defaultSchoolId,
    schoolName: 'Trường Tiểu học Kim Liên A',
    status: 'active',
    email: 'bgh@kimliena.edu.vn',
    avatar: '🏫',
    createdAt: now,
    updatedAt: now,
  });

  // 3. TEACHER (Cô Nguyễn Thu Hà - Lớp 4A8)
  const teacherSalt = bcrypt.genSaltSync(10);
  const teacherHash = bcrypt.hashSync('giaovien@123', teacherSalt);
  db.users.push({
    id: 'teacher-thu-ha',
    username: 'cothuha',
    fullName: 'Cô Nguyễn Thu Hà',
    role: 'teacher',
    passwordHash: teacherHash,
    mustChangePassword: false,
    schoolId: defaultSchoolId,
    schoolName: 'Trường Tiểu học Kim Liên A',
    classId: defaultClassId,
    className: 'Lớp 4A8',
    status: 'active',
    email: 'nguyenthuha.kimliena@gmail.com',
    avatar: '👩‍🏫',
    createdAt: now,
    updatedAt: now,
  });

  // 4. Initial students for trial class 4A8 with safe PIN
  db.users.push(
    {
      id: 'student-mai-anh',
      username: 'maianh_4a8',
      fullName: 'Nguyễn Mai Anh',
      studentCode: 'HS4A8-01',
      pinCode: '1234',
      role: 'student',
      status: 'active',
      schoolId: defaultSchoolId,
      schoolName: 'Trường Tiểu học Kim Liên A',
      classId: defaultClassId,
      className: 'Lớp 4A8',
      avatar: '👧',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'student-quoc-bao',
      username: 'quocbao_4a8',
      fullName: 'Trần Quốc Bảo',
      studentCode: 'HS4A8-02',
      pinCode: '5678',
      role: 'student',
      status: 'active',
      schoolId: defaultSchoolId,
      schoolName: 'Trường Tiểu học Kim Liên A',
      classId: defaultClassId,
      className: 'Lớp 4A8',
      avatar: '👦',
      createdAt: now,
      updatedAt: now,
    }
  );

  db.auditLogs.push({
    id: 'log-init-official',
    userId: 'system',
    username: 'system',
    action: 'OFFICIAL_INITIALIZATION',
    details: 'Khởi tạo chính thức EDUNOVA Writing Coach cho Lớp 4A8 – Trường Tiểu học Kim Liên A (Quy mô 36 học sinh).',
    timestamp: now,
  });

  saveDb();
}

function logAudit(userId: string, username: string, action: string, details: string, ip?: string) {
  const log: DbAuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    userId,
    username,
    action,
    details,
    ip,
    timestamp: new Date().toISOString(),
  };
  db.auditLogs.unshift(log);
  if (db.auditLogs.length > 1000) {
    db.auditLogs.pop();
  }
  saveDb();
}

function ensureAdminAccount() {
  const admin = db.users.find(u => u.username === 'admin' && u.role === 'admin');
  if (!admin) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('123456', salt);
    const now = new Date().toISOString();
    db.users.push({
      id: `user-admin-${Date.now()}`,
      username: 'admin',
      fullName: 'Quản trị viên Hệ thống (Admin)',
      role: 'admin',
      passwordHash: hash,
      mustChangePassword: true,
      status: 'active',
      email: 'admin@edunova.edu.vn',
      avatar: '🛡️',
      createdAt: now,
      updatedAt: now,
    });
    saveDb();
  }
}

// Auth Middleware
interface AuthRequest extends Request {
  user?: DbUser;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    const user = db.users.find(u => u.id === decoded.userId);

    if (!user) {
      res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị xóa.' });
      return;
    }

    if (user.status === 'locked') {
      res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    return;
  }
}

function requireRole(allowedRoles: ('admin' | 'school' | 'teacher' | 'student')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Chưa xác thực người dùng.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Bạn không có quyền thực hiện thao tác này. Quyền yêu cầu: ${allowedRoles.join(', ')}.`,
      });
      return;
    }
    next();
  };
}

// AI Rate Limiting & Quota
function checkAndIncrementAiQuota(userId: string): { allowed: boolean; remaining: number; max: number } {
  const today = new Date().toISOString().slice(0, 10);
  const maxPerDay = 30; // 30 AI interactions per student per day

  if (!db.aiQuotaDaily[userId] || db.aiQuotaDaily[userId].date !== today) {
    db.aiQuotaDaily[userId] = { count: 1, date: today };
    saveDb();
    return { allowed: true, remaining: maxPerDay - 1, max: maxPerDay };
  }

  if (db.aiQuotaDaily[userId].count >= maxPerDay) {
    return { allowed: false, remaining: 0, max: maxPerDay };
  }

  db.aiQuotaDaily[userId].count += 1;
  saveDb();
  return { allowed: true, remaining: maxPerDay - db.aiQuotaDaily[userId].count, max: maxPerDay };
}

async function createServer() {
  loadDb();
  ensureAdminAccount();

  // Ensure class 4A8 exists
  const has4A8 = db.classes.some(c => c.name === 'Lớp 4A8');
  if (!has4A8) {
    db.classes.push({
      id: 'class-4a8',
      name: 'Lớp 4A8',
      grade: 4,
      maxStudents: 36,
      schoolId: 'school-kimlien-a',
      schoolName: 'Trường Tiểu học Kim Liên A',
      teacherIds: ['teacher-thu-ha'],
      teacherNames: ['Cô Nguyễn Thu Hà'],
      createdAt: new Date().toISOString(),
    });
    saveDb();
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ===================== AUTH ROUTES =====================

  // POST /api/auth/login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password, role, fullName, className, pinCode } = req.body;

    // Student Login
    if (role === 'student') {
      if (!fullName || !className) {
        return res.status(400).json({ error: 'Vui lòng nhập họ và tên và chọn lớp học.' });
      }

      const cleanName = fullName.trim().toLowerCase();
      const cleanClass = className.trim().toLowerCase();

      const student = db.users.find(
        u =>
          u.role === 'student' &&
          u.fullName.trim().toLowerCase() === cleanName &&
          (u.className?.trim().toLowerCase() === cleanClass || !u.className)
      );

      if (!student) {
        return res.status(404).json({
          error: `Không tìm thấy học sinh "${fullName}" trong lớp "${className}". Hãy kiểm tra lại hoặc nhờ cô giáo thêm vào danh sách nhé!`,
        });
      }

      if (student.status === 'locked') {
        return res.status(403).json({ error: 'Tài khoản học sinh này đã bị khóa.' });
      }

      if (student.pinCode && pinCode) {
        if (student.pinCode.trim() !== pinCode.trim()) {
          return res.status(401).json({ error: 'Mã PIN không chính xác. Hãy hỏi lại cô giáo chủ nhiệm nhé!' });
        }
      } else if (student.pinCode && !pinCode) {
        return res.status(400).json({ error: 'Tài khoản yêu cầu mã PIN 4 số do giáo viên cấp.' });
      }

      student.lastLoginAt = new Date().toISOString();
      saveDb();

      logAudit(student.id, student.fullName, 'STUDENT_LOGIN', `Học sinh đăng nhập vào ${student.className}`, req.ip);

      const token = jwt.sign({ userId: student.id, role: student.role }, JWT_SECRET, { expiresIn: '7d' });
      const safeUser = { ...student };
      delete safeUser.passwordHash;

      return res.json({ token, user: safeUser });
    }

    // Teacher, School, Admin Login
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = db.users.find(u => u.username.toLowerCase() === cleanUsername);

    if (!user) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    if (user.status === 'locked') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Tài khoản này chưa thiết lập mật khẩu.' });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      logAudit(user.id, user.username, 'LOGIN_FAILED', 'Đăng nhập thất bại (sai mật khẩu)', req.ip);
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    user.lastLoginAt = new Date().toISOString();
    saveDb();

    logAudit(user.id, user.username, 'LOGIN_SUCCESS', `Đăng nhập thành công với vai trò ${user.role}`, req.ip);

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const safeUser = { ...user };
    delete safeUser.passwordHash;

    return res.json({
      token,
      user: safeUser,
      mustChangePassword: user.mustChangePassword || false,
    });
  });

  // POST /api/auth/google
  app.post('/api/auth/google', (req: Request, res: Response) => {
    const { email, fullName, className, schoolName } = req.body;
    if (!email) return res.status(400).json({ error: 'Không nhận được email từ Google.' });

    const cleanEmail = email.trim().toLowerCase();
    const user = db.users.find(u => u.email?.toLowerCase() === cleanEmail);

    if (user) {
      if (user.status === 'locked') {
        return res.status(403).json({ error: 'Tài khoản liên kết với email này đã bị khóa. Vui lòng liên hệ quản trị viên.' });
      }
      user.lastLoginAt = new Date().toISOString();
      saveDb();

      logAudit(user.id, user.username, 'GOOGLE_LOGIN', `Giáo viên đăng nhập qua Google: ${cleanEmail}`, req.ip);

      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      const safeUser = { ...user };
      delete safeUser.passwordHash;
      return res.json({ token, user: safeUser, mustChangePassword: false, isNew: false });
    }

    // If registration info was directly provided
    if (fullName && className && schoolName) {
      const now = new Date().toISOString();
      const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      const uniqueUsername = db.users.some(u => u.username === baseUsername)
        ? `${baseUsername}_${Math.floor(Math.random() * 899 + 100)}`
        : baseUsername;

      const newUser: DbUser = {
        id: `teacher-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        username: uniqueUsername,
        fullName: fullName.trim(),
        role: 'teacher',
        status: 'active',
        email: cleanEmail,
        schoolName: schoolName.trim(),
        className: className.trim(),
        avatar: '👩‍🏫',
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      db.users.push(newUser);

      // Ensure class exists
      const classExists = db.classes.some(c => c.name.toLowerCase() === className.trim().toLowerCase());
      if (!classExists) {
        db.classes.push({
          id: `class-${Date.now()}`,
          name: className.trim(),
          grade: 4,
          maxStudents: 35,
          schoolId: db.schools[0]?.id || 'school-default',
          schoolName: schoolName.trim(),
          teacherIds: [newUser.id],
          teacherNames: [newUser.fullName],
          createdAt: now,
        });
      }

      saveDb();
      logAudit(newUser.id, newUser.username, 'GOOGLE_REGISTER', `Giáo viên mới đăng ký qua Google: ${cleanEmail} - ${fullName}`, req.ip);

      const token = jwt.sign({ userId: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
      const safeUser = { ...newUser };
      delete safeUser.passwordHash;
      return res.json({ token, user: safeUser, mustChangePassword: false, isNew: false, message: 'Đăng ký thành công!' });
    }

    // Account does not exist yet -> instruct client to show registration form
    return res.json({
      isNew: true,
      email: cleanEmail,
      message: 'Email Google này chưa có tài khoản. Vui lòng nhập Họ tên, Lớp và Trường để hoàn tất đăng ký Giáo viên.',
    });
  });

  // POST /api/auth/google-register
  app.post('/api/auth/google-register', (req: Request, res: Response) => {
    const { email, fullName, className, schoolName, avatar } = req.body;
    if (!email) return res.status(400).json({ error: 'Thiếu email Google.' });
    if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'Vui lòng nhập Họ và tên Giáo viên.' });
    if (!className || !className.trim()) return res.status(400).json({ error: 'Vui lòng chọn hoặc nhập Lớp phụ trách.' });
    if (!schoolName || !schoolName.trim()) return res.status(400).json({ error: 'Vui lòng nhập Tên trường học.' });

    const cleanEmail = email.trim().toLowerCase();
    let user = db.users.find(u => u.email?.toLowerCase() === cleanEmail);
    const now = new Date().toISOString();

    if (user) {
      user.fullName = fullName.trim();
      user.className = className.trim();
      user.schoolName = schoolName.trim();
      user.role = 'teacher';
      user.status = 'active';
      user.updatedAt = now;
      user.lastLoginAt = now;
    } else {
      const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      const uniqueUsername = db.users.some(u => u.username === baseUsername)
        ? `${baseUsername}_${Math.floor(Math.random() * 899 + 100)}`
        : baseUsername;

      user = {
        id: `teacher-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        username: uniqueUsername,
        fullName: fullName.trim(),
        role: 'teacher',
        status: 'active',
        email: cleanEmail,
        schoolName: schoolName.trim(),
        className: className.trim(),
        avatar: avatar || '👩‍🏫',
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      db.users.push(user);
    }

    // Ensure class exists in db.classes
    const classExists = db.classes.some(c => c.name.toLowerCase() === className.trim().toLowerCase());
    if (!classExists) {
      db.classes.push({
        id: `class-${Date.now()}`,
        name: className.trim(),
        grade: 4,
        maxStudents: 35,
        schoolId: db.schools[0]?.id || 'school-default',
        schoolName: schoolName.trim(),
        teacherIds: [user.id],
        teacherNames: [user.fullName],
        createdAt: now,
      });
    }

    saveDb();
    logAudit(user.id, user.username, 'TEACHER_GOOGLE_REGISTER', `Giáo viên đăng ký qua Google: ${cleanEmail} - ${fullName} (${className})`, req.ip);

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const safeUser = { ...user };
    delete safeUser.passwordHash;

    return res.json({
      token,
      user: safeUser,
      mustChangePassword: false,
      message: 'Đăng ký tài khoản Giáo viên thành công!',
    });
  });

  // POST /api/auth/change-password
  app.post('/api/auth/change-password', authMiddleware, (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { oldPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    if (user.passwordHash && oldPassword) {
      const isMatch = bcrypt.compareSync(oldPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng.' });
      }
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();
    saveDb();

    logAudit(user.id, user.username, 'PASSWORD_CHANGED', 'Đổi mật khẩu thành công', req.ip);
    return res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  });

  // POST /api/auth/reset-admin-password
  app.post('/api/auth/reset-admin-password', (req: Request, res: Response) => {
    let admin = db.users.find(u => u.username === 'admin' && u.role === 'admin');
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('123456', salt);
    const now = new Date().toISOString();

    if (admin) {
      admin.passwordHash = hash;
      admin.mustChangePassword = false;
      admin.status = 'active';
      admin.updatedAt = now;
    } else {
      admin = {
        id: `user-admin-${Date.now()}`,
        username: 'admin',
        fullName: 'Quản trị viên Hệ thống (Admin)',
        role: 'admin',
        passwordHash: hash,
        mustChangePassword: false,
        status: 'active',
        email: 'admin@edunova.edu.vn',
        avatar: '🛡️',
        createdAt: now,
        updatedAt: now,
      };
      db.users.push(admin);
    }

    saveDb();
    logAudit(admin.id, admin.username, 'RESET_ADMIN_PASSWORD', 'Đã đặt lại mật khẩu admin về mặc định 123456', req.ip);

    return res.json({
      success: true,
      message: 'Mật khẩu tài khoản admin đã được đặt lại thành công về: 123456',
      username: 'admin',
      defaultPassword: '123456',
    });
  });

  // GET /api/auth/me
  app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res: Response) => {
    const safeUser = { ...req.user! };
    delete safeUser.passwordHash;
    res.json({ user: safeUser });
  });

  // ===================== ASSIGNMENTS API =====================

  // GET /api/assignments
  app.get('/api/assignments', authMiddleware, (req: AuthRequest, res: Response) => {
    const user = req.user!;
    if (user.role === 'student') {
      // Students only see published assignments for their class
      const list = db.assignments.filter(
        a => a.status === 'published' && (a.className === user.className || !a.className)
      );
      return res.json(list);
    }
    // Teachers & Admins see all for their class
    if (user.role === 'teacher') {
      const list = db.assignments.filter(a => a.className === user.className || a.teacherId === user.id);
      return res.json(list);
    }
    res.json(db.assignments);
  });

  // POST /api/assignments (Teacher or Admin)
  app.post('/api/assignments', authMiddleware, requireRole(['teacher', 'admin']), (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { title, prompt, genre, targetWordCount, dueDate, allowAi, status } = req.body;

    if (!title || !prompt) {
      return res.status(400).json({ error: 'Vui lòng nhập tên bài tập và yêu cầu đề bài.' });
    }

    const newAssignment: DbAssignment = {
      id: `assign-${Date.now()}`,
      title: title.trim(),
      prompt: prompt.trim(),
      genre: genre || 'Tập làm văn lớp 4',
      targetWordCount: targetWordCount || { min: 140, max: 220 },
      classId: user.classId || 'class-4a8',
      className: user.className || 'Lớp 4A8',
      teacherId: user.id,
      teacherName: user.fullName,
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      allowAi: allowAi ?? true,
      rubricLevels: ['Cần hỗ trợ', 'Đang hình thành', 'Đạt yêu cầu', 'Vận dụng tốt'],
      status: status || 'published',
      createdAt: new Date().toISOString(),
    };

    db.assignments.unshift(newAssignment);
    saveDb();
    logAudit(user.id, user.username, 'CREATE_ASSIGNMENT', `Giao bài tập: ${newAssignment.title}`, req.ip);

    res.status(201).json(newAssignment);
  });

  // ===================== SUBMISSIONS API =====================

  // GET /api/submissions
  app.get('/api/submissions', authMiddleware, (req: AuthRequest, res: Response) => {
    const user = req.user!;

    if (user.role === 'student') {
      // STRICT: Student only sees their own submissions!
      const studentSubs = db.submissions.filter(s => s.studentId === user.id);
      // Strip draft teacher comments if not published yet
      const sanitized = studentSubs.map(s => {
        const copy = { ...s };
        if (!copy.isPublishedToStudent) {
          copy.teacherComment = undefined;
          copy.score = undefined;
          copy.rubricScores = undefined;
        }
        delete copy.draftTeacherComment;
        return copy;
      });
      return res.json(sanitized);
    }

    if (user.role === 'teacher') {
      // Teacher sees submissions for their class
      const teacherSubs = db.submissions.filter(
        s => s.studentClass === user.className || !s.studentClass
      );
      return res.json(teacherSubs);
    }

    // Admin sees all
    return res.json(db.submissions);
  });

  // POST /api/submissions (Student submits essay)
  app.post('/api/submissions', authMiddleware, requireRole(['student']), (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { assignmentId, lessonId, lessonTitle, content, wordCount } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Nội dung bài viết không được để trống.' });
    }

    const cleanContent = content.trim();
    const words = wordCount || cleanContent.split(/\s+/).filter(Boolean).length;
    const nowVi = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString('vi-VN');

    // Check if there is already an existing submission for this lesson
    const existing = db.submissions.find(s => s.studentId === user.id && s.lessonId === lessonId);

    if (existing) {
      // Resubmission flow
      existing.content = cleanContent;
      existing.wordCount = words;
      existing.submittedAt = nowVi;
      existing.status = 'pending';
      existing.resubmittedCount = (existing.resubmittedCount || 0) + 1;
      existing.isPublishedToStudent = false; // Reset to unpublished until teacher re-grades
      saveDb();
      logAudit(user.id, user.fullName, 'RESUBMIT_ESSAY', `Nộp lại bài: ${existing.lessonTitle} (${words} từ)`, req.ip);
      return res.json(existing);
    }

    const newSub: DbSubmission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      assignmentId,
      lessonId: lessonId || 'lesson-01',
      lessonTitle: lessonTitle || 'Bài làm văn lớp 4',
      studentId: user.id,
      studentName: user.fullName,
      studentCode: user.studentCode || 'HS4A8-XX',
      studentClass: user.className || 'Lớp 4A8',
      studentAvatar: user.avatar || '👧',
      schoolId: user.schoolId,
      submittedAt: nowVi,
      status: 'pending',
      wordCount: words,
      content: cleanContent,
      versionCount: 1,
      isPublishedToStudent: false,
      resubmittedCount: 0,
    };

    db.submissions.unshift(newSub);
    saveDb();

    logAudit(user.id, user.fullName, 'SUBMIT_ESSAY', `Nộp bài: ${newSub.lessonTitle} (${words} từ)`, req.ip);
    return res.status(201).json(newSub);
  });

  // POST /api/submissions/:id/review (Teacher saves draft review or publishes)
  app.post('/api/submissions/:id/review', authMiddleware, requireRole(['teacher', 'admin']), (req: AuthRequest, res: Response) => {
    const teacher = req.user!;
    const { id } = req.params;
    const { score, teacherComment, rubricScores, isPublished, stickersEarned } = req.body;

    const sub = db.submissions.find(s => s.id === id);
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy bài làm của học sinh.' });

    if (score !== undefined) sub.score = Number(score);
    if (rubricScores) sub.rubricScores = rubricScores;
    if (stickersEarned) sub.stickersEarned = stickersEarned;

    if (isPublished) {
      sub.teacherComment = teacherComment ? teacherComment.trim() : sub.draftTeacherComment;
      sub.draftTeacherComment = undefined;
      sub.isPublishedToStudent = true;
      sub.status = 'graded';
      sub.gradedAt = new Date().toISOString();
      sub.gradedBy = teacher.fullName;
      logAudit(teacher.id, teacher.username, 'PUBLISH_REVIEW', `Phát hành nhận xét bài ${sub.studentName}: ${sub.score}đ`, req.ip);
    } else {
      // Save draft review
      sub.draftTeacherComment = teacherComment ? teacherComment.trim() : '';
      sub.isPublishedToStudent = false;
      logAudit(teacher.id, teacher.username, 'SAVE_DRAFT_REVIEW', `Lưu nháp nhận xét bài ${sub.studentName}`, req.ip);
    }

    saveDb();
    res.json(sub);
  });

  // POST /api/submissions/:id/request-revision (Teacher requests student to rewrite)
  app.post('/api/submissions/:id/request-revision', authMiddleware, requireRole(['teacher', 'admin']), (req: AuthRequest, res: Response) => {
    const teacher = req.user!;
    const { id } = req.params;
    const { revisionNotes } = req.body;

    const sub = db.submissions.find(s => s.id === id);
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy bài làm.' });

    sub.status = 'needs_edit';
    sub.needsRevisionNotes = revisionNotes || 'Em đọc kĩ lại gợi ý và chỉnh sửa câu từ rồi nộp lại cho cô nhé!';
    sub.isPublishedToStudent = true; // Show revision notes to student
    sub.teacherComment = sub.needsRevisionNotes;
    sub.gradedBy = teacher.fullName;
    saveDb();

    logAudit(teacher.id, teacher.username, 'REQUEST_REVISION', `Yêu cầu sửa lại bài cho ${sub.studentName}`, req.ip);
    res.json(sub);
  });

  // ===================== DIAMOND NOTEBOOK API =====================

  // GET /api/diamond-notes
  app.get('/api/diamond-notes', authMiddleware, (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const list = db.diamondNotes.filter(n => n.studentId === user.id);
    res.json(list);
  });

  // POST /api/diamond-notes
  app.post('/api/diamond-notes', authMiddleware, requireRole(['student']), (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { title, content, category, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Vui lòng nhập tiêu đề và nội dung ghi chú.' });
    }

    const newNote: DbDiamondNote = {
      id: `diamond-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      studentId: user.id,
      studentName: user.fullName,
      studentClass: user.className || 'Lớp 4A8',
      title: title.trim(),
      content: content.trim(),
      category: category || 'quan_sat_that',
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.diamondNotes.unshift(newNote);
    saveDb();
    res.status(201).json(newNote);
  });

  // DELETE /api/diamond-notes/:id
  app.delete('/api/diamond-notes/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const index = db.diamondNotes.findIndex(n => n.id === id && (n.studentId === user.id || user.role === 'admin'));
    if (index === -1) {
      return res.status(404).json({ error: 'Không tìm thấy thẻ ghi chép.' });
    }

    db.diamondNotes.splice(index, 1);
    saveDb();
    res.json({ success: true });
  });

  // ===================== AI COACH API (Gemini 3.8 Flash) =====================

  // POST /api/ai/coach
  app.post('/api/ai/coach', authMiddleware, async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { mode, prompt, currentText, lessonTitle, genre } = req.body;

    if (!prompt && !currentText) {
      return res.status(400).json({ error: 'Thiếu dữ liệu yêu cầu hoặc nội dung bài viết.' });
    }

    // Check rate limit quota
    const quota = checkAndIncrementAiQuota(user.id);
    if (!quota.allowed) {
      return res.status(429).json({
        error: `Em đã sử dụng hết hạn mức gợi ý AI trong ngày hôm nay (${quota.max}/${quota.max} lượt). Hãy tiếp tục tự tin suy nghĩ và tự viết nhé!`,
        quota,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Friendly fallback if key is not injected
      return res.json({
        isOfflineGuidance: true,
        quota,
        response: getOfflineGuidance(mode, genre, prompt, currentText),
      });
    }

    try {
      const systemInstruction = `Bạn là Trợ lý AI sư phạm EDUNOVA Writing Coach, đồng hành cùng học sinh lớp 4 (9-10 tuổi) của Trường Tiểu học Kim Liên A học Tiếng Việt theo bộ SGK Kết nối tri thức.
MỤC TIÊU SƯ PHẠM CỐT LÕI:
1. KHÔNG BAO GIỜ VIẾT HỘ HOÀN TOÀN BÀI VĂN HAY ĐOẠN VĂN CHO HỌC SINH.
2. Giúp học sinh tự tư duy, tự quan sát, tự viết câu và tự phát triển cảm xúc.
3. Sử dụng ngôn ngữ Tiếng Việt lớp 4 chuẩn mực, thân thiện, ấm áp, khích lệ như một cô giáo tiểu học tận tụy.
4. Mỗi lời nhận xét bài viết:
   - Nêu 1-2 điểm khen ngợi cụ thể và dẫn đúng câu ngắn trong bài của học sinh để làm bằng chứng.
   - Nêu tối đa 1-3 vấn đề ưu tiên cần sửa (câu lủng củng, dùng từ chưa đúng, thiếu liên kết).
   - Đưa ra 1 gợi ý sửa chữa cụ thể dưới dạng câu hỏi gợi mở hoặc mẫu câu có chỗ trống (...) để học sinh tự điền.
5. Không ép học sinh nhồi nhét quá nhiều từ ngữ cầu kì hay bắt buộc phải có đủ 5 giác quan.`;

      let userPrompt = '';
      if (mode === 'goi_mo_tim_y') {
        userPrompt = `Chế độ: Gợi mở tìm ý cho bài viết.
Đề bài/Chủ đề: "${lessonTitle || prompt || 'Miêu tả'}" (Thể loại: ${genre || 'Văn lớp 4'}).
Ý tưởng ban đầu của học sinh: "${prompt || currentText || ''}".
Nhiệm vụ: Hãy đặt 3 câu hỏi gợi mở ngộ nghĩnh, gần gũi với tuổi học trò lớp 4 để khơi gợi chi tiết thú vị (về hình dáng, hoạt động, kỷ niệm). Mỗi câu hỏi kèm 1-2 từ khóa gợi ý.`;
      } else if (mode === 'lam_ro_cau') {
        userPrompt = `Chế độ: Làm rõ câu, sửa câu lủng củng.
Câu học sinh viết: "${prompt || currentText}".
Nhiệm vụ: Phân tích xem câu này đang gặp vấn đề gì (ví dụ: thiếu bộ phận chính, lặp từ, hoặc các ý chưa rõ nghĩa). Hướng dẫn học sinh cách chia nhỏ câu hoặc bổ sung từ ngữ liên kết mà KHÔNG viết lại nguyên vẹn một câu hoàn chỉnh. Đưa khung gợi ý có chỗ trống (...).`;
      } else if (mode === 'phat_trien_chi_tiet') {
        userPrompt = `Chế độ: Phát triển chi tiết gợi hình.
Chi tiết học sinh đang có: "${prompt || currentText}".
Nhiệm vụ: Hướng dẫn học sinh sử dụng thêm 1 hình ảnh so sánh ngộ nghĩnh hoặc từ ngữ gợi cảm xúc phù hợp với lớp 4 (ví dụ: so sánh với đồ vật thân thuộc, âm thanh vui nhộn).`;
      } else if (mode === 'the_hien_cam_xuc') {
        userPrompt = `Chế độ: Thể hiện cảm xúc có căn cứ.
Nội dung: "${prompt || currentText}".
Nhiệm vụ: Hướng dẫn học sinh gắn cảm xúc (vui sướng, nhớ nhung, biết ơn) với một hành động hoặc kỷ niệm cụ thể, tránh nói chung chung "Em rất thích".`;
      } else if (mode === 'doc_lai_gop_y') {
        userPrompt = `Chế độ: Đọc lại & Góp ý sư phạm bài viết.
Đề bài: "${lessonTitle || 'Bài làm văn'}".
Bài viết của học sinh lớp 4:
"""
${currentText || prompt}
"""
Nhiệm vụ:
1. [Lời khen]: Khen ngợi 1-2 câu viết hay hoặc chi tiết chân thực nhất (trích dẫn nguyên văn trong ngoặc kép).
2. [Góp ý chân thành]: Chỉ ra tối đa 2 điểm cần hoàn thiện (lỗi chính tả, câu lủng củng hoặc đoạn văn chưa liên kết).
3. [Nhiệm vụ tự sửa]: Cho học sinh 1 thử thách nhỏ cụ thể để tự sửa lại bài viết của mình ngay bây giờ.`;
      } else if (mode === 'tong_hop_lop_hoc') {
        userPrompt = `Chế độ: Hỗ trợ Giáo viên tổng hợp khó khăn của lớp học.
Dữ liệu tóm tắt các bài làm:
"${prompt || currentText}".
Nhiệm vụ: Tổng hợp 3 lỗi sai phổ biến nhất học sinh hay mắc phải (dùng từ, cấu trúc câu, bố cục) và gợi ý 1 bài tập củng cố 15 phút trong tiết học tới.`;
      } else {
        userPrompt = `Chế độ: Hướng dẫn viết văn lớp 4. Yêu cầu của học sinh: "${prompt || currentText}".`;
      }

      // Call Gemini 3.8 Flash
      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }],
          },
        ],
      });

      const responseText = aiResponse.text || 'Cô giáo AI đã nhận yêu cầu của em, em hãy tiếp tục suy nghĩ và hoàn thiện bài nhé!';

      logAudit(user.id, user.fullName, 'AI_COACH_CALL', `Gọi AI Coach chế độ: ${mode}`, req.ip);

      return res.json({
        isOfflineGuidance: false,
        quota,
        response: responseText,
      });
    } catch (err: any) {
      console.error('[Gemini API] Error calling Gemini:', err);
      return res.json({
        isOfflineGuidance: true,
        quota,
        response: getOfflineGuidance(mode, genre, prompt, currentText),
      });
    }
  });

  // Offline guidance generator
  function getOfflineGuidance(mode: string, genre?: string, prompt?: string, text?: string): string {
    if (mode === 'goi_mo_tim_y') {
      return `🌟 **Gợi ý tìm ý từ Cô giáo:**
1. Em quan sát đối tượng này từ những góc độ nào? (Nhìn từ xa, lại gần, vào các thời điểm khác nhau trong ngày).
2. Chi tiết nào khiến em nhớ nhất? (Màu sắc nổi bật, âm thanh thân quen, hoặc một cử chỉ ngộ nghĩnh).
3. Em và bạn bè đã có kỷ niệm gì đáng nhớ gắn với nơi này hay sự việc này chưa?`;
    }
    if (mode === 'lam_ro_cau') {
      return `✏️ **Gợi ý làm rõ câu:**
- Em hãy đọc to câu văn lên xem câu đã có đủ: "Ai (Cái gì) làm gì / thế nào chưa?"
- Nếu câu quá dài và có nhiều từ "và", "rồi", em hãy thử tách thành 2 câu ngắn rõ nghĩa hơn nhé!`;
    }
    if (mode === 'doc_lai_gop_y') {
      return `🌸 **Nhận xét đọc lại bài viết:**
- **Ưu điểm:** Bài viết của em bám sát đề bài, diễn đạt tự nhiên và giàu tình cảm tuổi học trò.
- **Góp ý tự sửa:** Em hãy rà soát lại các dấu chấm, dấu phẩy sau mỗi ý trọn vẹn, và thử thêm một hình ảnh so sánh ngộ nghĩnh ở đoạn thân bài nhé!`;
    }
    return `💡 **Gợi ý luyện viết:** Em hãy bám sát dàn ý 3 phần: Mở bài (giới thiệu), Thân bài (tả bao quát đến chi tiết), Kết bài (nêu cảm xúc chân thành).`;
  }

  // ===================== USER MANAGEMENT & REPORTS =====================

  // GET /api/users
  app.get('/api/users', authMiddleware, (req: AuthRequest, res: Response) => {
    const currentUser = req.user!;
    let list: DbUser[] = [];

    if (currentUser.role === 'admin') {
      list = [...db.users];
    } else if (currentUser.role === 'school') {
      list = db.users.filter(u => u.schoolId === currentUser.schoolId);
    } else if (currentUser.role === 'teacher') {
      list = db.users.filter(u => u.className === currentUser.className && u.role === 'student');
    } else {
      list = [currentUser];
    }

    const sanitized = list.map(u => {
      const copy = { ...u };
      delete copy.passwordHash;
      return copy;
    });

    res.json(sanitized);
  });

  // POST /api/users (Create user)
  app.post('/api/users', authMiddleware, (req: AuthRequest, res: Response) => {
    const creator = req.user!;
    const { username, fullName, role, password, pinCode, studentCode, schoolId, classId, className, email } = req.body;

    if (!fullName || !role) {
      return res.status(400).json({ error: 'Vui lòng cung cấp họ tên và vai trò.' });
    }

    if (creator.role === 'student') {
      return res.status(403).json({ error: 'Tài khoản học sinh không có quyền tạo tài khoản. Tài khoản học sinh do Giáo viên tạo.' });
    }

    if (creator.role === 'teacher' && role !== 'student') {
      return res.status(403).json({ error: 'Giáo viên chỉ có thể thêm học sinh vào lớp phụ trách.' });
    }

    let finalUsername = username ? username.trim().toLowerCase() : `${role}_${Date.now().toString().slice(-6)}`;
    const existing = db.users.find(u => u.username.toLowerCase() === finalUsername);
    if (existing) {
      return res.status(400).json({ error: `Tên đăng nhập "${finalUsername}" đã tồn tại.` });
    }

    let passwordHash: string | undefined;
    if (password) {
      const salt = bcrypt.genSaltSync(10);
      passwordHash = bcrypt.hashSync(password, salt);
    }

    const now = new Date().toISOString();
    const targetSchoolId = schoolId || creator.schoolId || 'school-kimlien-a';
    const targetClassId = classId || creator.classId || 'class-4a8';
    const targetClassName = className || creator.className || 'Lớp 4A8';

    const newUser: DbUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: finalUsername,
      fullName: fullName.trim(),
      role,
      passwordHash,
      pinCode: pinCode || (role === 'student' ? '1234' : undefined),
      studentCode: studentCode || (role === 'student' ? `HS4A8-${(db.users.filter(u => u.role === 'student').length + 1).toString().padStart(2, '0')}` : undefined),
      mustChangePassword: role !== 'student' && password === '123456',
      schoolId: targetSchoolId,
      schoolName: 'Trường Tiểu học Kim Liên A',
      classId: targetClassId,
      className: targetClassName,
      status: 'active',
      email: email ? email.trim() : undefined,
      avatar: role === 'teacher' ? '👩‍🏫' : role === 'admin' ? '🛡️' : role === 'school' ? '🏫' : '🎒',
      createdAt: now,
      updatedAt: now,
    };

    db.users.push(newUser);
    saveDb();

    logAudit(creator.id, creator.username, 'CREATE_USER', `Tạo tài khoản: ${newUser.fullName} (${newUser.role})`, req.ip);

    const safe = { ...newUser };
    delete safe.passwordHash;
    res.status(201).json(safe);
  });

  // PUT /api/users/:id
  app.put('/api/users/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    const creator = req.user!;
    const targetId = req.params.id;
    const { fullName, status, password, pinCode } = req.body;

    const user = db.users.find(u => u.id === targetId);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

    if (creator.role === 'teacher') {
      if (user.role !== 'student' || user.className !== creator.className) {
        return res.status(403).json({ error: 'Giáo viên chỉ có quyền sửa học sinh thuộc lớp mình.' });
      }
    } else if (creator.role !== 'admin' && creator.id !== user.id) {
      return res.status(403).json({ error: 'Không có quyền sửa tài khoản này.' });
    }

    if (fullName) user.fullName = fullName.trim();
    if (status && (status === 'active' || status === 'locked')) user.status = status;
    if (pinCode && user.role === 'student') user.pinCode = pinCode.trim();
    if (password) {
      const salt = bcrypt.genSaltSync(10);
      user.passwordHash = bcrypt.hashSync(password, salt);
    }
    user.updatedAt = new Date().toISOString();
    saveDb();

    logAudit(creator.id, creator.username, 'UPDATE_USER', `Cập nhật thông tin tài khoản: ${user.fullName}`, req.ip);

    const safe = { ...user };
    delete safe.passwordHash;
    res.json(safe);
  });

  // DELETE /api/users/:id
  app.delete('/api/users/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    const creator = req.user!;
    const targetId = req.params.id;

    if (creator.id === targetId) {
      return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản của chính mình.' });
    }

    const index = db.users.findIndex(u => u.id === targetId);
    if (index === -1) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

    const user = db.users[index];
    if (creator.role === 'teacher') {
      if (user.role !== 'student' || user.className !== creator.className) {
        return res.status(403).json({ error: 'Giáo viên chỉ có thể xóa học sinh trong lớp mình.' });
      }
    } else if (creator.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền xóa tài khoản.' });
    }

    db.users.splice(index, 1);
    saveDb();

    logAudit(creator.id, creator.username, 'DELETE_USER', `Xóa tài khoản: ${user.fullName}`, req.ip);
    res.json({ success: true, message: `Đã xóa tài khoản ${user.fullName}` });
  });

  // GET /api/reports/class-summary (Teacher & Admin)
  app.get('/api/reports/class-summary', authMiddleware, requireRole(['teacher', 'admin', 'school']), (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const targetClass = req.query.className as string || user.className || 'Lớp 4A8';

    const classStudents = db.users.filter(u => u.role === 'student' && (u.className === targetClass || !u.className));
    const totalStudents = classStudents.length;
    const maxCapacity = 36; // Lớp 4A8 có 36 học sinh

    const classSubs = db.submissions.filter(s => s.studentClass === targetClass || !s.studentClass);
    const submittedStudentIds = new Set(classSubs.map(s => s.studentId));
    const gradedSubs = classSubs.filter(s => s.status === 'graded');

    const totalScores = gradedSubs.reduce((acc, s) => acc + (s.score || 0), 0);
    const averageScore = gradedSubs.length > 0 ? Number((totalScores / gradedSubs.length).toFixed(1)) : 0;

    res.json({
      className: targetClass,
      maxCapacity,
      registeredStudentsCount: totalStudents,
      submittedStudentsCount: submittedStudentIds.size,
      totalSubmissions: classSubs.length,
      gradedSubmissionsCount: gradedSubs.length,
      pendingSubmissionsCount: classSubs.filter(s => s.status === 'pending').length,
      needsEditCount: classSubs.filter(s => s.status === 'needs_edit').length,
      averageScore,
      submissionRate: totalStudents > 0 ? Math.round((submittedStudentIds.size / totalStudents) * 100) : 0,
    });
  });

  // GET /api/schools
  app.get('/api/schools', (_req: Request, res: Response) => {
    res.json(db.schools);
  });

  // GET /api/classes
  app.get('/api/classes', (_req: Request, res: Response) => {
    res.json(db.classes);
  });

  // GET /api/audit-logs
  app.get('/api/audit-logs', authMiddleware, requireRole(['admin']), (_req: AuthRequest, res: Response) => {
    res.json(db.auditLogs);
  });

  // POST /api/admin/clean-demo-data
  app.post('/api/admin/clean-demo-data', authMiddleware, requireRole(['admin']), (req: AuthRequest, res: Response) => {
    const admin = req.user!;
    const originalSubCount = db.submissions.length;
    db.submissions = [];
    db.diamondNotes = [];
    db.isDemoCleaned = true;
    saveDb();

    logAudit(admin.id, admin.username, 'CLEAN_DEMO_DATA', `Đã dọn dẹp ${originalSubCount} bài nộp thử nghiệm.`, req.ip);
    res.json({ success: true, message: 'Đã làm sạch dữ liệu bài nộp thử nghiệm.', purgedCount: originalSubCount });
  });

  // ===================== VITE MIDDLEWARE =====================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EDUNOVA Server] Official Writing Coach running on http://localhost:${PORT}`);
  });
}

createServer().catch(err => {
  console.error('[EDUNOVA Server] Fatal startup error:', err);
});
