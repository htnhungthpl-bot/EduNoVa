import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Award, 
  School, 
  FileText, 
  Search, 
  Filter, 
  Eye, 
  MessageSquare,
  Sparkles,
  KeyRound,
  Plus,
  RefreshCw,
  AlertCircle,
  Calendar,
  Send,
  Save,
  RotateCcw,
  BarChart3
} from 'lucide-react';
import { StudentSubmission, UserProfile, DbAssignment, RubricScoreItem } from '../types';
import { api } from '../utils/api';

interface TeacherViewProps {
  currentUser: UserProfile;
  onNavigateToLessons: () => void;
}

const RUBRIC_CRITERIA = [
  { id: 'crit-1', name: 'Đáp ứng yêu cầu đề bài' },
  { id: 'crit-2', name: 'Bố cục 3 phần rõ ràng, mạch lạc' },
  { id: 'crit-3', name: 'Câu rõ nghĩa & dùng từ gợi cảm' },
  { id: 'crit-4', name: 'Chi tiết quan sát & cảm xúc chân thực' },
  { id: 'crit-5', name: 'Chính tả và ngắt dấu câu' },
  { id: 'crit-6', name: 'Tự đọc lại và hoàn thiện bài viết' },
];

export const TeacherView: React.FC<TeacherViewProps> = ({ currentUser, onNavigateToLessons }) => {
  const [activeTab, setActiveTab] = useState<'submissions' | 'assignments' | 'students' | 'reports'>('submissions');
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [assignments, setAssignments] = useState<DbAssignment[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Review & Grading Modal
  const [selectedSub, setSelectedSub] = useState<StudentSubmission | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(9.0);
  const [teacherComment, setTeacherComment] = useState<string>('');
  const [rubricScores, setRubricScores] = useState<Record<string, string>>({});
  const [revisionNotes, setRevisionNotes] = useState<string>('');
  const [showRevisionModal, setShowRevisionModal] = useState<boolean>(false);

  // Create Assignment Modal
  const [showAddAssignment, setShowAddAssignment] = useState<boolean>(false);
  const [assignTitle, setAssignTitle] = useState<string>('');
  const [assignPrompt, setAssignPrompt] = useState<string>('');
  const [assignGenre, setAssignGenre] = useState<string>('Miêu tả cây cối');
  const [assignMinWords, setAssignMinWords] = useState<number>(140);
  const [assignMaxWords, setAssignMaxWords] = useState<number>(200);

  // Quick Add Student Modal
  const [showAddStudent, setShowAddStudent] = useState<boolean>(false);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentPin, setNewStudentPin] = useState<string>('1234');

  // Teacher AI Synthesis
  const [aiSynthesizing, setAiSynthesizing] = useState<boolean>(false);
  const [aiSynthesisResult, setAiSynthesisResult] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [subs, assigns, users, rep] = await Promise.all([
        api.getSubmissions().catch(() => []),
        api.getAssignments().catch(() => []),
        api.getUsers().catch(() => []),
        api.getClassSummaryReport('Lớp 4A8').catch(() => null),
      ]);
      setSubmissions(subs);
      setAssignments(assigns);
      setStudents(users.filter(u => u.role === 'student'));
      setReportData(rep);
    } catch (err) {
      console.error('Error loading teacher data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSubs = submissions.filter((s) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return s.status === 'pending';
    if (filterStatus === 'draft') return s.status === 'pending' && s.draftTeacherComment;
    if (filterStatus === 'graded') return s.status === 'graded';
    if (filterStatus === 'needs_edit') return s.status === 'needs_edit';
    return true;
  });

  const handleOpenReview = (sub: StudentSubmission) => {
    setSelectedSub(sub);
    setGradeScore(sub.score || 9.0);
    setTeacherComment(sub.teacherComment || sub.draftTeacherComment || 'Cô khen ngợi bài viết diễn đạt tự nhiên và giàu cảm xúc!');
    const initialRubric: Record<string, string> = {};
    RUBRIC_CRITERIA.forEach(c => {
      initialRubric[c.id] = 'proficient';
    });
    setRubricScores(initialRubric);
  };

  // Save Draft Review (Invisible to student until published)
  const handleSaveDraftReview = async () => {
    if (!selectedSub) return;
    try {
      await api.reviewSubmission(selectedSub.id, {
        score: gradeScore,
        teacherComment,
        rubricScores: Object.entries(rubricScores).map(([k, v]) => ({ criterionId: k, criterionName: k, level: v })),
        isPublished: false,
      });
      showToast('Đã lưu nháp nhận xét! (Học sinh chưa nhìn thấy cho đến khi cô bấm Phát hành)');
      setSelectedSub(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu nháp');
    }
  };

  // Publish Review to Student
  const handlePublishReview = async () => {
    if (!selectedSub) return;
    try {
      await api.reviewSubmission(selectedSub.id, {
        score: gradeScore,
        teacherComment,
        rubricScores: Object.entries(rubricScores).map(([k, v]) => ({ criterionId: k, criterionName: k, level: v })),
        isPublished: true,
        stickersEarned: ['Bông hoa điểm 10', 'Họa sĩ ngôn từ'],
      });
      showToast(`Đã phát hành điểm số (${gradeScore}) và nhận xét chính thức cho ${selectedSub.studentName}!`);
      setSelectedSub(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi phát hành nhận xét');
    }
  };

  // Request Student Revision
  const handleSendRevisionRequest = async () => {
    if (!selectedSub) return;
    try {
      await api.requestRevision(selectedSub.id, revisionNotes || 'Em đọc kĩ lại gợi ý và chỉnh sửa câu từ rồi nộp lại cho cô nhé!');
      showToast(`Đã gửi yêu cầu sửa lại bài cho học sinh ${selectedSub.studentName}.`);
      setShowRevisionModal(false);
      setSelectedSub(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi yêu cầu sửa bài');
    }
  };

  // Create Assignment
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTitle.trim() || !assignPrompt.trim()) return;
    try {
      await api.createAssignment({
        title: assignTitle.trim(),
        prompt: assignPrompt.trim(),
        genre: assignGenre,
        targetWordCount: { min: assignMinWords, max: assignMaxWords },
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        allowAi: true,
      });
      showToast(`Đã giao bài tập mới cho Lớp 4A8!`);
      setShowAddAssignment(false);
      setAssignTitle('');
      setAssignPrompt('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tạo bài tập');
    }
  };

  // Quick Add Student (Teacher creates student account)
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    try {
      const targetClass = currentUser.className || 'Lớp 4A8';
      const targetSchool = currentUser.school || 'Trường Tiểu học Kim Liên A';
      await api.createUser({
        fullName: newStudentName.trim(),
        role: 'student',
        pinCode: newStudentPin.trim() || '1234',
        className: targetClass,
        schoolName: targetSchool,
      });
      showToast(`Đã cấp tài khoản cho học sinh ${newStudentName.trim()} vào ${targetClass}!`);
      setShowAddStudent(false);
      setNewStudentName('');
      setNewStudentPin('1234');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Lỗi tạo học sinh');
    }
  };

  // Teacher AI Synthesis
  const handleSynthesizeClassIssues = async () => {
    if (submissions.length === 0) {
      showToast('Chưa có bài nộp nào để tổng hợp khó khăn.');
      return;
    }
    setAiSynthesizing(true);
    try {
      const summaryText = submissions.map((s, idx) => `Bài ${idx + 1} (${s.wordCount} từ): ${s.content.slice(0, 150)}...`).join('\n');
      const res = await api.callAiCoach({
        mode: 'tong_hop_lop_hoc',
        prompt: summaryText,
      });
      setAiSynthesisResult(res.response);
      showToast('Đã tổng hợp khó khăn của học sinh qua AI!');
    } catch (err: any) {
      showToast('Lỗi khi gọi AI tổng hợp.');
    } finally {
      setAiSynthesizing(false);
    }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const gradedCount = submissions.filter(s => s.status === 'graded').length;
  const needsEditCount = submissions.filter(s => s.status === 'needs_edit').length;

  return (
    <div className="space-y-8 pb-16">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Teacher Top Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
              Không gian Quản lý Giáo viên
            </span>
            <span className="bg-purple-200 text-purple-900 text-xs font-bold px-2 py-0.5 rounded-full">
              Lớp 4A8 • Sĩ số: {students.length}/36 em
            </span>
          </div>
          <h2 className="font-heading text-2xl font-bold">
            Chào mừng Cô Nguyễn Thu Hà
          </h2>
          <p className="text-xs text-purple-100 flex items-center gap-1.5 font-medium">
            <School className="w-3.5 h-3.5" />
            <span>Trường Tiểu học Kim Liên A • Hotline hỗ trợ: 0973793366</span>
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <button
            onClick={onNavigateToLessons}
            className="px-4 py-2 rounded-xl bg-white text-purple-900 font-bold text-xs sm:text-sm hover:bg-purple-50 transition-colors shadow-xs cursor-pointer"
          >
            Kho bài học TV4 SGK
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none text-xs">
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'submissions'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-white hover:bg-purple-50 text-slate-600 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Hàng chờ chấm bài ({submissions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'assignments'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-white hover:bg-purple-50 text-slate-600 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Giao bài tập ({assignments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('students')}
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'students'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-white hover:bg-purple-50 text-slate-600 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Sổ theo dõi 36 học sinh & PIN ({students.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'reports'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-white hover:bg-purple-50 text-slate-600 border border-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Báo cáo thực tế & AI Tổng hợp</span>
        </button>
      </div>

      {/* Real Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Sĩ số Lớp 4A8</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="font-heading text-2xl font-bold text-slate-800">
            {students.length} <span className="text-sm font-normal text-slate-400">/ 36 em</span>
          </div>
          <div className="text-[11px] text-slate-500">học sinh đã đăng ký hồ sơ</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Bài tập đã nộp</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="font-heading text-2xl font-bold text-slate-800">{submissions.length}</div>
          <div className="text-[11px] text-emerald-600 font-medium">Đã phát hành điểm: {gradedCount} bài</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Chờ cô chấm</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-heading text-2xl font-bold text-slate-800">{pendingCount}</div>
          <div className="text-[11px] text-amber-600 font-medium">bài cần đọc & duyệt</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Yêu cầu sửa lại</span>
            <RotateCcw className="w-4 h-4 text-orange-500" />
          </div>
          <div className="font-heading text-2xl font-bold text-slate-800">{needsEditCount}</div>
          <div className="text-[11px] text-orange-600 font-medium">bài đang hoàn thiện thêm</div>
        </div>
      </div>

      {/* TAB 1: SUBMISSIONS & GRADING */}
      {activeTab === 'submissions' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading font-bold text-lg text-slate-800">
                Danh sách bài làm của học sinh Lớp 4A8
              </h3>
              <p className="text-xs text-slate-500">
                Lưu nháp nhận xét để chỉnh sửa sau hoặc phát hành chính thức cho học sinh.
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'pending', label: 'Chờ chấm' },
                { id: 'draft', label: 'Nháp nhận xét' },
                { id: 'graded', label: 'Đã phát hành' },
                { id: 'needs_edit', label: 'Cần sửa lại' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterStatus(f.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    filterStatus === f.id
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredSubs.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 space-y-2">
              <FileText className="w-10 h-10 text-slate-400 mx-auto" />
              <h4 className="font-heading font-bold text-slate-700 text-sm">
                Không có bài nộp nào trong mục này
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Khi học sinh hoàn thành bài tại Bàn viết và bấm nộp bài, bài làm sẽ tự động hiển thị tại đây theo thời gian thực.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="p-5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center text-xl shrink-0">
                      {sub.studentAvatar || '🎒'}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{sub.studentName}</span>
                        <span className="text-[11px] font-medium text-slate-400">{sub.studentClass}</span>
                        {sub.status === 'graded' && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            Đã phát hành: {sub.score}đ
                          </span>
                        )}
                        {sub.status === 'pending' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                            Chờ chấm
                          </span>
                        )}
                        {sub.status === 'needs_edit' && (
                          <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 font-bold text-[10px]">
                            Đã yêu cầu sửa lại
                          </span>
                        )}
                        {sub.draftTeacherComment && !sub.isPublishedToStudent && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">
                            Có bản nháp nhận xét
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-700 font-semibold">
                        {sub.lessonTitle}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Nộp lúc: {sub.submittedAt} • Độ dài: {sub.wordCount} từ
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleOpenReview(sub)}
                      className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Đọc & Chấm bài</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ASSIGNMENTS MANAGEMENT */}
      {activeTab === 'assignments' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading font-bold text-lg text-slate-800">
                Nhiệm vụ viết văn giao cho Lớp 4A8
              </h3>
              <p className="text-xs text-slate-500">
                Tạo đề bài, quy định độ dài từ và thời hạn nộp bài.
              </p>
            </div>

            <button
              onClick={() => setShowAddAssignment(true)}
              className="px-4 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Giao bài tập mới</span>
            </button>
          </div>

          <div className="space-y-3">
            {assignments.map((assign) => (
              <div
                key={assign.id}
                className="p-5 rounded-2xl border border-purple-100 bg-purple-50/20 hover:border-purple-200 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full">
                    {assign.genre}
                  </span>
                  <span className="text-xs text-slate-500">
                    Hạn nộp: {new Date(assign.dueDate).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <h4 className="font-heading font-bold text-slate-800 text-base">{assign.title}</h4>
                <p className="text-xs text-slate-600">"{assign.prompt}"</p>
                <div className="pt-2 border-t border-purple-100/60 flex items-center justify-between text-xs text-slate-500">
                  <span>Mục tiêu: {assign.targetWordCount.min} - {assign.targetWordCount.max} từ</span>
                  <span className="font-semibold text-emerald-700">Đã phát hành cho Lớp 4A8</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: STUDENTS ROSTER & PIN */}
      {activeTab === 'students' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading font-bold text-lg text-slate-800 flex items-center gap-2">
                <span>Sổ theo dõi học sinh {currentUser.className || 'Lớp 4A8'} & Mã PIN</span>
                <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-bold">
                  {students.length} học sinh
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Tài khoản học sinh do Giáo viên tạo & cấp mã PIN 4 số bảo mật giúp học sinh tiểu học dễ dàng đăng nhập viết bài.
              </p>
            </div>

            <button
              onClick={() => setShowAddStudent(true)}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Cấp tài khoản mới</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {students.map((st) => (
              <div
                key={st.id}
                className="p-4 rounded-2xl border border-purple-100 bg-purple-50/30 hover:bg-purple-50/70 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{st.avatar || '👧'}</span>
                  <span className="font-mono text-xs font-bold text-purple-900 bg-white px-2 py-0.5 rounded border border-purple-200">
                    {st.studentCode || 'HS4A8-XX'}
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{st.fullName}</h4>
                  <p className="text-xs text-slate-500">{st.className || currentUser.className || 'Lớp 4A8'} • {st.schoolName || currentUser.school || 'Kim Liên A'}</p>
                </div>
                <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Mã PIN:</span>
                    <span className="font-mono font-bold text-xs bg-purple-200 text-purple-900 px-2 py-0.5 rounded">
                      {st.pinCode || '1234'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const p = prompt(`Đổi mã PIN mới cho học sinh ${st.fullName} (4 số):`, st.pinCode || '1234');
                        if (p && p.trim()) {
                          await api.updateUser(st.id, { pinCode: p.trim() });
                          showToast(`Đã đổi PIN của ${st.fullName} thành ${p.trim()}`);
                          loadData();
                        }
                      }}
                      className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Đổi PIN
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      onClick={async () => {
                        if (confirm(`Bạn có chắc chắn muốn xóa học sinh "${st.fullName}" khỏi danh sách lớp không?`)) {
                          try {
                            await api.deleteUser(st.id);
                            showToast(`Đã xóa học sinh ${st.fullName}`);
                            loadData();
                          } catch (err: any) {
                            alert(err.message || 'Lỗi khi xóa học sinh');
                          }
                        }
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: REAL REPORTS & AI SYNTHESIS */}
      {activeTab === 'reports' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div className="space-y-1">
            <h3 className="font-heading text-lg font-bold text-slate-800">
              Báo cáo tiến độ học tập thực tế Lớp 4A8
            </h3>
            <p className="text-xs text-slate-500">
              Số liệu tính toán trực tiếp từ cơ sở dữ liệu bài nộp (không dùng số liệu giả định).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Tỉ lệ học sinh đã nộp bài:</span>
              <div className="font-heading text-2xl font-bold text-purple-700">
                {reportData?.submittedStudentsCount || 0} / {students.length || 36} em
              </div>
              <div className="text-xs text-slate-500">
                Đạt tỉ lệ {reportData?.submissionRate || 0}% sĩ số lớp
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Điểm trung bình lớp:</span>
              <div className="font-heading text-2xl font-bold text-emerald-700">
                {reportData?.averageScore || 0} / 10
              </div>
              <div className="text-xs text-slate-500">Tính trên {gradedCount} bài đã hoàn thành chấm</div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Tổng số lượt bài nộp:</span>
              <div className="font-heading text-2xl font-bold text-slate-800">
                {submissions.length} lượt
              </div>
              <div className="text-xs text-slate-500">Gồm cả các lần nộp lại chỉnh sửa</div>
            </div>
          </div>

          {/* AI Teacher Synthesis Tool */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="font-heading font-bold text-indigo-950 text-base flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <span>Trợ lý AI hỗ trợ Giáo viên tổng hợp khó khăn của lớp</span>
                </h4>
                <p className="text-xs text-indigo-800">
                  AI quét các bài làm của Lớp 4A8, chỉ ra các lỗi dùng từ, câu lủng củng và đề xuất bài tập củng cố 15 phút.
                </p>
              </div>

              <button
                onClick={handleSynthesizeClassIssues}
                disabled={aiSynthesizing}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {aiSynthesizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Tổng hợp khó khăn ngay</span>
              </button>
            </div>

            {aiSynthesisResult && (
              <div className="p-5 rounded-2xl bg-white border border-indigo-200 text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed font-medium shadow-xs">
                {aiSynthesisResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVIEW & GRADING MODAL (with 4-level rubric and draft save vs publish) */}
      {selectedSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <span className="text-xs bg-white/20 font-bold px-2 py-0.5 rounded-full">
                  Đánh giá bài viết theo Rubric chuẩn
                </span>
                <h3 className="font-heading text-lg font-bold mt-1">
                  {selectedSub.studentName} – {selectedSub.lessonTitle}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSub(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm">
              {/* Essay Content */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs text-slate-500 font-semibold">
                  <span>Bài viết của học sinh ({selectedSub.wordCount} từ):</span>
                  <span>Thời gian nộp: {selectedSub.submittedAt}</span>
                </div>
                <div className="p-5 rounded-2xl bg-[#fffdf9] border border-amber-200 text-slate-800 leading-relaxed whitespace-pre-line font-medium text-sm sm:text-base">
                  {selectedSub.content}
                </div>
              </div>

              {/* 4-Level Rubric Table */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Đánh giá theo 4 mức Rubric chuẩn:
                </h4>
                <div className="space-y-2">
                  {RUBRIC_CRITERIA.map((crit) => (
                    <div key={crit.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-800">{crit.name}</span>
                      <select
                        value={rubricScores[crit.id] || 'proficient'}
                        onChange={(e) => setRubricScores({ ...rubricScores, [crit.id]: e.target.value })}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-medium text-xs text-slate-700"
                      >
                        <option value="support_needed">Cần hỗ trợ</option>
                        <option value="developing">Đang hình thành</option>
                        <option value="proficient">Đạt yêu cầu</option>
                        <option value="advanced">Vận dụng tốt</option>
                        <option value="not_applicable">Không áp dụng</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score & Teacher Feedback Input */}
              <div className="p-5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-purple-900 text-xs">
                    Điểm số (Thang điểm 10):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={gradeScore}
                    onChange={(e) => setGradeScore(Number(e.target.value))}
                    className="w-24 p-2 text-center rounded-xl bg-white border border-purple-300 font-bold text-base text-purple-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-purple-900 text-xs mb-1">
                    Lời nhận xét & Góp ý của cô giáo:
                  </label>
                  <textarea
                    value={teacherComment}
                    onChange={(e) => setTeacherComment(e.target.value)}
                    rows={4}
                    placeholder="Nhập lời khen cụ thể và hướng dẫn sửa đổi..."
                    className="w-full p-3 rounded-xl bg-white border border-purple-300 text-xs text-slate-800 leading-relaxed font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => setShowRevisionModal(true)}
                className="px-3.5 py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Yêu cầu sửa lại bài</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDraftReview}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-purple-600" />
                  <span>Lưu nháp nhận xét</span>
                </button>

                <button
                  onClick={handlePublishReview}
                  className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Phát hành nhận xét cho học sinh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST REVISION MODAL */}
      {showRevisionModal && selectedSub && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-orange-200 space-y-4">
            <h4 className="font-heading font-bold text-slate-800 text-base">
              Yêu cầu học sinh {selectedSub.studentName} viết lại
            </h4>
            <p className="text-xs text-slate-500">
              Ghi rõ phần câu từ hoặc đoạn văn em cần viết lại để hoàn thiện hơn:
            </p>
            <textarea
              rows={4}
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Ví dụ: Đoạn thân bài em cần quan sát thêm về rễ và tán lá, tránh lặp từ 'rất'..."
              className="w-full p-3 rounded-xl border border-orange-300 text-xs font-medium"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowRevisionModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 font-bold text-slate-700 text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSendRevisionRequest}
                className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs cursor-pointer shadow-xs"
              >
                Gửi yêu cầu sửa bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ASSIGNMENT MODAL */}
      {showAddAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-purple-200 space-y-4">
            <h4 className="font-heading font-bold text-slate-800 text-base">
              Giao bài tập mới cho Lớp 4A8
            </h4>
            <form onSubmit={handleCreateAssignment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên bài tập:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Tả một con vật nuôi trong nhà em"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Thể loại bài viết:</label>
                <select
                  value={assignGenre}
                  onChange={(e) => setAssignGenre(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium"
                >
                  <option value="Miêu tả cây cối">Miêu tả cây cối</option>
                  <option value="Miêu tả con vật">Miêu tả con vật</option>
                  <option value="Đoạn văn nêu ý kiến">Đoạn văn nêu ý kiến</option>
                  <option value="Đoạn văn tưởng tượng">Đoạn văn tưởng tượng</option>
                  <option value="Bài văn kể lại một câu chuyện">Bài văn kể lại một câu chuyện</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Yêu cầu đề bài:</label>
                <textarea
                  rows={3}
                  placeholder="Nhập chi tiết yêu cầu đề bài cho học sinh..."
                  value={assignPrompt}
                  onChange={(e) => setAssignPrompt(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số từ tối thiểu:</label>
                  <input
                    type="number"
                    value={assignMinWords}
                    onChange={(e) => setAssignMinWords(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số từ tối đa:</label>
                  <input
                    type="number"
                    value={assignMaxWords}
                    onChange={(e) => setAssignMaxWords(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAssignment(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 font-bold text-slate-700 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-purple-700 font-bold text-white cursor-pointer"
                >
                  Giao bài tập
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK ADD STUDENT MODAL (Teacher creates student account) */}
      {showAddStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                {currentUser.className || 'Lớp 4A8'} • {currentUser.school || 'Kim Liên A'}
              </span>
              <h4 className="font-heading font-bold text-slate-800 text-base">
                Cấp tài khoản mới cho học sinh
              </h4>
              <p className="text-[11px] text-slate-500">
                Tài khoản học sinh do Giáo viên tạo. Sau khi tạo, học sinh chỉ cần nhập Họ tên & mã PIN 4 số này để đăng nhập.
              </p>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Họ và tên học sinh: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hoàng Gia Hưng"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mã PIN đăng nhập (4 số): <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={newStudentPin}
                  onChange={(e) => setNewStudentPin(e.target.value)}
                  placeholder="1234"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-center font-bold text-sm tracking-widest focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-hidden"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">Mặc định là 1234. Giáo viên có thể đổi sau.</p>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 font-bold text-white shadow-xs cursor-pointer transition-colors"
                >
                  Cấp tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
