import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  Edit3,
  Heart,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  Save,
  Settings,
  Sparkles,
  Target,
  Trash2,
  X
} from 'lucide-react';

const rawApiBase = import.meta.env.VITE_API_BASE_URL || '';
const normalizedApiBase = rawApiBase.replace(/\/$/, '');
const API_BASE = normalizedApiBase
  ? `${normalizedApiBase}${normalizedApiBase.endsWith('/api') ? '' : '/api'}`
  : '/api';

type Role = 'student' | 'supervisor';
type Subject = 'english' | 'politics' | 'major1' | 'major2';
type Priority = 'high' | 'medium' | 'low';
type TaskStatus = 'not_started' | 'in_progress' | 'completed';
type MessageType = 'encouragement' | 'reminder' | 'review' | 'reply';

type User = {
  id: number;
  username: string;
  nickname: string;
  role: Role;
  token: string;
};

type StudyTask = {
  id: number;
  userId: number;
  date: string;
  subject: Subject;
  title: string;
  description: string;
  estimatedMinutes: number;
  priority: Priority;
  status: TaskStatus;
};

type DailyCheckin = {
  id: number;
  date: string;
  totalStudyMinutes: number;
  completedSubjects: Subject[];
  completedSubjectLabels?: string[];
  summary: string;
  moodScore: number;
  note: string;
  completedTaskItems?: StudyTask[];
  summaryStats?: StudentStats;
};

type StudentStats = {
  unbound?: boolean;
  message?: string;
  date: string;
  student?: Pick<User, 'id' | 'username' | 'nickname'>;
  tasks: StudyTask[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  totalStudyMinutes: number;
  completedSubjects: Subject[];
  checkin: DailyCheckin | null;
  isCheckedIn: boolean;
  streak: number;
  recentMessages?: StudyMessage[];
  unreadMessages?: number;
};

type SevenDayStats = {
  studyMinutes: Array<{ date: string; value: number }>;
  completedTasks: Array<{ date: string; value: number }>;
  subjectMinutes: Array<{ subject: Subject; label: string; value: number }>;
};

type Profile = {
  examDate: string | null;
  dailyAvailableMinutes: number | null;
  countdown: {
    examDate: string | null;
    daysLeft: number | null;
    stage: string;
    message: string;
  };
};

type StudyMessage = {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  type: MessageType;
  parentId?: number | null;
  typeLabel: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
  receiverName?: string;
  senderRole?: Role;
};

type BindStatus = {
  bound: boolean;
  supervisor: { id: number; username: string; nickname: string } | null;
  activeCode: { code: string; expiresAt: string } | null;
};

type BoundStudent = {
  id: number;
  username: string;
  nickname: string;
  boundAt: string;
};

type WeekPlanPreview = {
  dates: string[];
  existingDates: string[];
  skippedDates: string[];
  tasks: Array<Omit<StudyTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
  createdCount?: number;
  message?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const subjectLabels: Record<Subject, string> = {
  english: '英语',
  politics: '政治',
  major1: '专业课一',
  major2: '专业课二'
};

const subjectTone: Record<Subject, string> = {
  english: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  politics: 'bg-rose-50 text-rose-700 border-rose-100',
  major1: 'bg-amber-50 text-amber-700 border-amber-100',
  major2: 'bg-sky-50 text-sky-700 border-sky-100'
};

const priorityLabels: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低'
};

const statusLabels: Record<TaskStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成'
};

const messageTypeLabels: Record<MessageType, string> = {
  encouragement: '鼓励',
  reminder: '提醒',
  review: '复盘',
  reply: '回复'
};
const newMessageTypes: Array<Exclude<MessageType, 'reply'>> = ['encouragement', 'reminder', 'review'];

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const today = () => formatLocalDate(new Date());

const addDays = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
};

function groupMessageThreads(messages: StudyMessage[]) {
  const roots = messages
    .filter((message) => !message.parentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const repliesByRoot = messages
    .filter((message) => message.parentId)
    .reduce<Record<number, StudyMessage[]>>((result, message) => {
      const rootId = Number(message.parentId);
      result[rootId] = [...(result[rootId] || []), message];
      return result;
    }, {});

  return roots.map((root) => ({
    root,
    replies: (repliesByRoot[root.id] || []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }));
}

function validateIntegerInput(value: string, label: string, min = 0) {
  if (value.trim() === '') return `${label}不能为空`;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) return `${label}必须是整数`;
  if (number < min) return `${label}不能小于 ${min}`;
  return '';
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('kaoyan-user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    return parsed.token ? parsed : null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    function handleAuthExpired() {
      setUser(null);
    }
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  function handleLogin(nextUser: User) {
    setUser(nextUser);
    localStorage.setItem('kaoyan-user', JSON.stringify(nextUser));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('kaoyan-user');
  }

  if (!user) {
    return authMode === 'login'
      ? (
        <>
          <LoginPage onLogin={handleLogin} onRegister={() => setAuthMode('register')} />
          <MobileInstallPrompt />
        </>
      )
      : (
        <>
          <RegisterPage onLogin={handleLogin} onLoginPage={() => setAuthMode('login')} />
          <MobileInstallPrompt />
        </>
      );
  }

  return (
    <>
      <Shell user={user} onLogout={logout}>
        {user.role === 'student' ? <StudentApp user={user} /> : <SupervisorApp user={user} />}
      </Shell>
      <MobileInstallPrompt />
    </>
  );
}

function MobileInstallPrompt() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('kaoyan-pwa-install-dismissed') === 'true');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const detectMobile = () => {
      const ua = navigator.userAgent.toLowerCase();
      const touchDevice = navigator.maxTouchPoints > 1;
      setIsMobile((mobileQuery.matches || /iphone|ipad|ipod|android/.test(ua)) && !standaloneQuery.matches && touchDevice);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    detectMobile();
    mobileQuery.addEventListener('change', detectMobile);
    standaloneQuery.addEventListener('change', detectMobile);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mobileQuery.removeEventListener('change', detectMobile);
      standaloneQuery.removeEventListener('change', detectMobile);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function closeInstallTip() {
    localStorage.setItem('kaoyan-pwa-install-dismissed', 'true');
    setDismissed(true);
  }

  async function installApp() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => undefined);
    closeInstallTip();
  }

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const showInstallTip = isMobile && !dismissed;

  if (online && !showInstallTip) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-lg border border-tea/15 bg-white/95 p-4 text-sm text-slate-600 shadow-soft backdrop-blur">
      {!online && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700">
          当前网络不可用，打卡和同步需要联网后继续。
        </p>
      )}
      {showInstallTip && (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-black text-ink">添加到主屏幕</p>
            <p className="mt-1 leading-6">
              可以把这个页面添加到主屏幕，像 App 一样每天打开。
              {isIOS && ' 点击分享按钮，然后选择“添加到主屏幕”。'}
              {isAndroid && ' 点击浏览器菜单，然后选择“安装应用”或“添加到主屏幕”。'}
            </p>
            {installEvent && (
              <button className="btn btn-primary mt-3 h-10 min-h-10 px-3" onClick={installApp}>
                安装应用
              </button>
            )}
          </div>
          <button className="btn btn-ghost h-10 min-h-10 px-3" onClick={closeInstallTip} aria-label="关闭安装提示">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function authHeaders(user: User) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.token}`
  };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }));
    if (response.status === 401) {
      localStorage.removeItem('kaoyan-user');
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new Error(error.message || '请求失败');
  }
  return response.json();
}

function LoginPage({ onLogin, onRegister }: { onLogin: (user: User) => void; onRegister: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api<{ token: string; user: Omit<User, 'token'> }>('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      onLogin({ ...data.user, token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center">
        <section className="grid w-full gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center">
            <p className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-tea shadow-sm">
              <Heart size={16} /> 考研倒计时，每一天都算数
            </p>
            <h1 className="text-4xl font-black leading-tight text-ink md:text-5xl">今天也在靠近目标</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              给法学考研准备的一方小桌面：安排任务、完成打卡、留下复盘，也让关心你的人看见每一天的认真。
            </p>
          </div>

          <form onSubmit={submit} className="card p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-black">登录</h2>
              <p className="mt-2 text-sm text-slate-500">可以使用自己的账号登录；开发测试账号仍保留为 student / supervisor。</p>
            </div>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">用户名</span>
              <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">密码</span>
              <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
            <button className="btn btn-primary w-full" disabled={loading}>
              <Check size={18} /> {loading ? '登录中' : '进入 App'}
            </button>
            <button type="button" className="btn btn-ghost mt-3 w-full" onClick={onRegister}>
              还没有账号？去注册
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function RegisterPage({ onLogin, onLoginPage }: { onLogin: (user: User) => void; onLoginPage: () => void }) {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [supervisorCode, setSupervisorCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!username.trim() || !nickname.trim()) {
      setError('请填写用户名和昵称');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (role === 'supervisor' && !supervisorCode.trim()) {
      setError('注册监督者账号需要输入监管者内码。');
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ token: string; user: Omit<User, 'token'> }>('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, nickname, password, confirmPassword, role, supervisorCode })
      });
      onLogin({ ...data.user, token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center">
        <section className="grid w-full gap-6 md:grid-cols-[1fr_1fr]">
          <div className="flex flex-col justify-center">
            <p className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-tea shadow-sm">
              <Heart size={16} /> 你不是一个人在坚持
            </p>
            <h1 className="text-4xl font-black leading-tight text-ink md:text-5xl">创建你的学习陪伴账号</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              学生注册后可以生成绑定码，监督者输入绑定码后，才能看到对应学生的打卡和留言状态。
            </p>
          </div>
          <form onSubmit={submit} className="card p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-black">注册</h2>
              <p className="mt-2 text-sm text-slate-500">学生账号可以直接注册；监督者账号需要内码，用于保护学习记录隐私。</p>
            </div>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">用户名</span>
              <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">昵称</span>
              <input className="field" value={nickname} onChange={(event) => setNickname(event.target.value)} required />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">角色</span>
              <select className="field" value={role} onChange={(event) => setRole(event.target.value as Role)}>
                <option value="student">考研学生</option>
                <option value="supervisor">监督者</option>
              </select>
            </label>
            {role === 'supervisor' && (
              <label className="mb-4 block">
                <span className="mb-2 block text-sm font-bold text-slate-600">监管者内码</span>
                <input className="field" value={supervisorCode} onChange={(event) => setSupervisorCode(event.target.value)} placeholder="请输入监管者内码" />
              </label>
            )}
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">密码</span>
              <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">确认密码</span>
              <input className="field" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </label>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
            <button className="btn btn-primary w-full" disabled={loading}>
              <Check size={18} /> {loading ? '注册中' : '注册并进入 App'}
            </button>
            <button type="button" className="btn btn-ghost mt-3 w-full" onClick={onLoginPage}>
              已有账号？去登录
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Shell({ user, onLogout, children }: { user: User; onLogout: () => void; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-5 md:px-8">
      <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-bold text-tea">坚持不是一下子做到很多，而是每天都继续</p>
          <h1 className="mt-1 text-3xl font-black text-ink">考研规划打卡</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="pill bg-white text-slate-600 shadow-sm">{user.nickname || user.username} · {user.role === 'student' ? '学生' : '监督'}</span>
          <button className="btn btn-ghost" onClick={onLogout} title="退出登录">
            <LogOut size={18} /> 退出
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}

function StudentApp({ user }: { user: User }) {
  const [tab, setTab] = useState<'plan' | 'week' | 'checkin' | 'messages' | 'binding' | 'profile' | 'history'>('plan');
  const [date, setDate] = useState(today());
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [bindStatus, setBindStatus] = useState<BindStatus | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function updateTaskStatusLocal(taskId: number, status: TaskStatus) {
    setTasks((currentTasks) => {
      const nextTasks = currentTasks.map((task) => task.id === taskId ? { ...task, status } : task);
      setStats((currentStats) => {
        if (!currentStats || currentStats.date !== date) return currentStats;
        const completedTasks = nextTasks.filter((task) => task.status === 'completed');
        return {
          ...currentStats,
          tasks: nextTasks,
          totalTasks: nextTasks.length,
          completedTasks: completedTasks.length,
          completionRate: nextTasks.length ? Math.round((completedTasks.length / nextTasks.length) * 100) : 0,
          totalStudyMinutes: completedTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
          completedSubjects: [...new Set(completedTasks.map((task) => task.subject))]
        };
      });
      return nextTasks;
    });
  }

  async function refreshStatsOnly() {
    try {
      const statData = await api<StudentStats>(`/stats/student?date=${date}`, { headers: authHeaders(user) });
      setStats(statData);
    } catch {
      // Keep the optimistic task UI responsive even if the secondary stats refresh fails.
    }
  }

  async function refresh() {
    setError('');
    setLoading(true);
    try {
      const [taskData, statData, checkinData] = await Promise.all([
        api<StudyTask[]>(`/tasks?date=${date}`, { headers: authHeaders(user) }),
        api<StudentStats>(`/stats/student?date=${date}`, { headers: authHeaders(user) }),
        api<DailyCheckin[]>('/checkins', { headers: authHeaders(user) })
      ]);
      const [profileData, messageData, bindData] = await Promise.all([
        api<Profile>('/profile', { headers: authHeaders(user) }),
        api<StudyMessage[]>('/messages', { headers: authHeaders(user) }),
        api<BindStatus>('/bind-status', { headers: authHeaders(user) })
      ]);
      setTasks(taskData);
      setStats(statData);
      setCheckins(checkinData);
      setProfile(profileData);
      setMessages(messageData);
      setBindStatus(bindData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [date]);

  return (
    <>
      <StudentDashboard user={user} stats={stats} profile={profile} messages={messages} bindStatus={bindStatus} onSetProfile={() => setTab('profile')} onOpenMessages={() => setTab('messages')} onOpenBinding={() => setTab('binding')} />
      <TabBar
        items={[
          ['plan', '今日计划', ClipboardList],
          ['week', '一周计划生成', Sparkles],
          ['checkin', '每日打卡', CalendarDays],
          ['messages', `留言${messages.some((message) => message.receiverId === user.id && !message.isRead) ? ' · 未读' : ''}`, MessageCircle],
          ['binding', '绑定监督者', Heart],
          ['profile', '目标设置', Target],
          ['history', '历史记录', BarChart3]
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{notice}</p>}
      {loading && <LoadingNotice />}
      {tab === 'plan' && <PlanPage user={user} date={date} setDate={setDate} tasks={tasks} onRefresh={refresh} onTaskStatusChange={updateTaskStatusLocal} onStatsRefresh={refreshStatsOnly} />}
      {tab === 'week' && <WeekPlanPage user={user} profile={profile} onGenerated={async (startDate) => { setDate(startDate); setTab('plan'); setNotice('未来 7 天学习计划已生成'); await refresh(); }} />}
      {tab === 'checkin' && <CheckinPage user={user} date={date} setDate={setDate} tasks={tasks} stats={stats} onRefresh={refresh} />}
      {tab === 'messages' && <MessageListPage user={user} messages={messages} onRefresh={refresh} />}
      {tab === 'binding' && <StudentBindingPage user={user} bindStatus={bindStatus} onRefresh={refresh} />}
      {tab === 'profile' && <ProfilePage user={user} profile={profile} onSaved={refresh} />}
      {tab === 'history' && <HistoryPage checkins={checkins} user={user} />}
    </>
  );
}

function StudentDashboard({
  user,
  stats,
  profile,
  messages,
  bindStatus,
  onSetProfile,
  onOpenMessages,
  onOpenBinding
}: {
  user: User;
  stats: StudentStats | null;
  profile: Profile | null;
  messages: StudyMessage[];
  bindStatus: BindStatus | null;
  onSetProfile: () => void;
  onOpenMessages: () => void;
  onOpenBinding: () => void;
}) {
  const recentMessages = messages.slice(0, 3);
  const unreadCount = messages.filter((message) => message.receiverId === user.id && !message.isRead).length;

  return (
    <section className="mb-5 space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="今日完成率" value={`${stats?.completionRate ?? 0}%`} />
        <Metric title="已完成任务" value={`${stats?.completedTasks ?? 0}/${stats?.totalTasks ?? 0}`} />
        <Metric title="预计学习时长" value={`${stats?.totalStudyMinutes ?? 0} 分钟`} />
        <Metric title="连续打卡" value={`${stats?.streak ?? 0} 天`} />
      </div>
      <section className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-tea">监督绑定</p>
            <p className="mt-1 text-sm text-slate-600">
              {bindStatus?.bound
                ? `已绑定监督者：${bindStatus.supervisor?.nickname || bindStatus.supervisor?.username}`
                : '还没有绑定监督者，可以生成绑定码邀请他陪你一起坚持。'}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onOpenBinding}><Heart size={18} /> {bindStatus?.bound ? '查看绑定' : '生成绑定码'}</button>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="card p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold text-tea">考研倒计时</p>
              <h2 className="mt-2 text-2xl font-black">
                {profile?.countdown.examDate ? `目标日期：${profile.countdown.examDate}` : '还没有设置考研日期'}
              </h2>
              <p className="mt-2 text-slate-600">
                {profile?.countdown.daysLeft === null || profile?.countdown.daysLeft === undefined
                  ? '还没有设置考研日期，先设定一个目标吧'
                  : profile.countdown.daysLeft < 0
                    ? '考试日期已结束，可以重新设置新的目标'
                    : `距离考试还有 ${profile.countdown.daysLeft} 天`}
              </p>
              <p className="mt-3 rounded-lg bg-rosepaper px-3 py-2 text-sm font-bold text-slate-600">
                {profile?.countdown.message || '计划不是用来制造压力的，而是帮你减少焦虑的。'}
              </p>
              <p className="mt-3 text-sm font-bold text-tea">
                今天也慢慢来，但不要停。{(stats?.streak ?? 0) > 0 ? `已经连续打卡 ${stats?.streak} 天啦，继续稳稳往前。` : ''}
              </p>
            </div>
            <button className="btn btn-ghost" onClick={onSetProfile}><Settings size={18} /> 设置目标</button>
          </div>
        </section>
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-tea">最近留言</p>
              <h2 className="mt-2 text-xl font-black">你不是一个人在坚持</h2>
            </div>
            <button className="btn btn-ghost" onClick={onOpenMessages}><Mail size={18} /> 全部</button>
          </div>
          {unreadCount > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">有 {unreadCount} 条未读留言</p>}
          <div className="space-y-2">
            {recentMessages.map((message) => (
              <div key={message.id} className="rounded-lg bg-white p-3 text-sm text-slate-600">
                <span className={`pill mr-2 ${message.receiverId === user.id && !message.isRead ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{message.typeLabel}</span>
                {message.content}
              </div>
            ))}
            {!recentMessages.length && <p className="text-sm text-slate-500">还没有留言，慢慢来，但每天都要往前一点。</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

function StudentBindingPage({ user, bindStatus, onRefresh }: { user: User; bindStatus: BindStatus | null; onRefresh: () => Promise<void> }) {
  const [code, setCode] = useState(bindStatus?.activeCode?.code || '');
  const [expiresAt, setExpiresAt] = useState(bindStatus?.activeCode?.expiresAt || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCode(bindStatus?.activeCode?.code || '');
    setExpiresAt(bindStatus?.activeCode?.expiresAt || '');
  }, [bindStatus?.activeCode?.code, bindStatus?.activeCode?.expiresAt]);

  async function generateCode() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await api<{ code: string; expiresAt: string }>('/bind-code', {
        method: 'POST',
        headers: authHeaders(user)
      });
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      await onRefresh();
      setNotice('绑定码已生成，把它发给监督者就可以啦。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成绑定码失败');
      await onRefresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <div className="card h-fit p-5">
        <h2 className="mb-3 text-2xl font-black">绑定监督者</h2>
        {error && <ErrorNotice message={error} />}
        {notice && <SuccessNotice message={notice} />}
        {bindStatus?.bound ? (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            已绑定监督者：{bindStatus.supervisor?.nickname || bindStatus.supervisor?.username}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm leading-6 text-slate-600">把这个绑定码发给监督者，对方输入后就可以看到你的学习记录啦。</p>
            {code && (
              <div className="mb-4 rounded-lg bg-white p-5 text-center">
                <p className="text-sm font-bold text-slate-500">当前绑定码</p>
                <p className="mt-2 text-4xl font-black tracking-[0.2em] text-ink">{code}</p>
                <p className="mt-2 text-sm text-slate-500">有效期至：{new Date(expiresAt).toLocaleString()}</p>
              </div>
            )}
            <button className="btn btn-primary" onClick={generateCode} disabled={loading}>
              <Sparkles size={18} /> {loading ? '生成中' : code ? '重新生成绑定码' : '生成绑定码'}
            </button>
          </>
        )}
      </div>
      <aside className="card p-5">
        <p className="text-sm font-bold text-tea">小提示</p>
        <h3 className="mt-2 text-xl font-black">绑定之后才会共享学习记录</h3>
        <p className="mt-3 leading-7 text-slate-600">监督者只能看到与你建立绑定关系后的学习数据和留言状态，其他账号不能查看你的计划。</p>
      </aside>
    </section>
  );
}

function ProfilePage({ user, profile, onSaved }: { user: User; profile: Profile | null; onSaved: () => Promise<void> }) {
  const [examDate, setExamDate] = useState(profile?.examDate || '');
  const [dailyAvailableMinutes, setDailyAvailableMinutes] = useState(String(profile?.dailyAvailableMinutes ?? 360));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setExamDate(profile?.examDate || '');
    setDailyAvailableMinutes(String(profile?.dailyAvailableMinutes ?? 360));
  }, [profile?.examDate, profile?.dailyAvailableMinutes]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    const minutesError = validateIntegerInput(dailyAvailableMinutes, '每天可学习时长', 0);
    if (minutesError) {
      setError(minutesError);
      return;
    }
    setSaving(true);
    try {
      await api('/profile', {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify({ examDate, dailyAvailableMinutes: Number(dailyAvailableMinutes) })
      });
      await onSaved();
      setNotice('目标设置已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存目标失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <form onSubmit={submit} className="card h-fit p-5">
        <h2 className="mb-4 text-2xl font-black">目标设置</h2>
        {error && <ErrorNotice message={error} />}
        {notice && <SuccessNotice message={notice} />}
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">目标考试日期</span>
          <input className="field" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
        </label>
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">每天可学习时长</span>
          <input className="field" type="number" min={60} step={30} value={dailyAvailableMinutes} onChange={(event) => setDailyAvailableMinutes(event.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={saving}><Save size={18} /> {saving ? '保存中' : '保存目标'}</button>
      </form>
      <aside className="card p-5">
        <p className="text-sm font-bold text-tea">当前阶段</p>
        <h3 className="mt-2 text-2xl font-black">{profile?.countdown.stage || '未设置'}</h3>
        <p className="mt-3 leading-7 text-slate-600">{profile?.countdown.message || '还没有设置考研日期，先设定一个目标吧'}</p>
        <p className="mt-4 rounded-lg bg-white p-4 text-sm font-bold text-slate-600">计划不是用来制造压力的，而是帮你减少焦虑的。</p>
      </aside>
    </section>
  );
}

function WeekPlanPage({ user, profile, onGenerated }: { user: User; profile: Profile | null; onGenerated: (startDate: string) => Promise<void> }) {
  const [dailyAvailableMinutes, setDailyAvailableMinutes] = useState(String(profile?.dailyAvailableMinutes ?? 360));
  const [startDate, setStartDate] = useState(() => {
    return addDays(today(), 1);
  });
  const [skipExisting, setSkipExisting] = useState(true);
  const [weakness, setWeakness] = useState<Record<Subject, number>>({ english: 3, politics: 3, major1: 4, major2: 4 });
  const [preview, setPreview] = useState<WeekPlanPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function generatePreview() {
    setError('');
    const minutesError = validateIntegerInput(dailyAvailableMinutes, '每天可学习时长', 0);
    if (minutesError) {
      setError(minutesError);
      return;
    }
    setLoading(true);
    try {
      const data = await api<WeekPlanPreview>('/tasks/generate-week-preview', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ dailyAvailableMinutes: Number(dailyAvailableMinutes), startDate, weakness, skipExisting })
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成预览失败');
    } finally {
      setLoading(false);
    }
  }

  async function confirmGenerate() {
    setError('');
    const minutesError = validateIntegerInput(dailyAvailableMinutes, '每天可学习时长', 0);
    if (minutesError) {
      setError(minutesError);
      return;
    }
    setLoading(true);
    try {
      await api<WeekPlanPreview>('/tasks/generate-week', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ dailyAvailableMinutes: Number(dailyAvailableMinutes), startDate, weakness, skipExisting })
      });
      await onGenerated(startDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存一周计划失败');
    } finally {
      setLoading(false);
    }
  }

  const groupedByDate = useMemo(() => {
    return (preview?.tasks || []).reduce<Record<string, WeekPlanPreview['tasks']>>((result, task) => {
      result[task.date] = [...(result[task.date] || []), task];
      return result;
    }, {});
  }, [preview]);

  return (
    <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <form className="card h-fit p-5" onSubmit={(event) => { event.preventDefault(); generatePreview(); }}>
        <h2 className="mb-4 text-2xl font-black">一周计划生成</h2>
        {error && <ErrorNotice message={error} />}
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">每天可学习时长</span>
          <input className="field" type="number" min={120} step={30} value={dailyAvailableMinutes} onChange={(event) => setDailyAvailableMinutes(event.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">起始日期</span>
          <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <div className="mb-4 space-y-3">
          {(Object.keys(subjectLabels) as Subject[]).map((subject) => (
            <label key={subject} className="block">
              <span className="mb-2 flex justify-between text-sm font-bold text-slate-600"><span>{subjectLabels[subject]}薄弱程度</span><span>{weakness[subject]}</span></span>
              <input className="w-full accent-[#5b8c7a]" type="range" min={1} max={5} value={weakness[subject]} onChange={(event) => setWeakness({ ...weakness, [subject]: Number(event.target.value) })} />
            </label>
          ))}
        </div>
        <label className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={skipExisting} onChange={(event) => setSkipExisting(event.target.checked)} />
          跳过已有任务的日期
        </label>
        <button className="btn btn-primary w-full" disabled={loading}><Sparkles size={18} /> {loading ? '生成中' : '生成预览'}</button>
      </form>

      <section className="card p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black">预览</h2>
            <p className="mt-1 text-sm text-slate-500">计划不是用来制造压力的，而是帮你减少焦虑的。</p>
          </div>
          <button className="btn btn-primary" onClick={confirmGenerate} disabled={!preview?.tasks.length || loading}><Check size={18} /> 确认生成</button>
        </div>
        {preview?.existingDates.length ? (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
            检测到已有任务日期：{preview.existingDates.join('、')}。{skipExisting ? `已跳过：${preview.skippedDates.join('、') || '无'}` : '确认后会覆盖这些日期的旧任务。'}
          </p>
        ) : null}
        <div className="space-y-5">
          {Object.entries(groupedByDate).map(([date, tasks]) => (
            <div key={date}>
              <h3 className="mb-3 text-lg font-black">{date}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {tasks.map((task, index) => (
                  <article key={`${task.date}-${task.subject}-${index}`} className="rounded-lg bg-white p-4">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`pill border ${subjectTone[task.subject]}`}>{subjectLabels[task.subject]}</span>
                      <span className="pill bg-slate-100 text-slate-600">{task.estimatedMinutes} 分钟</span>
                      <span className="pill bg-amber-50 text-amber-700">优先级 {priorityLabels[task.priority]}</span>
                    </div>
                    <p className="font-black">{task.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{task.description}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
          {!preview && <p className="rounded-lg bg-white p-5 text-sm text-slate-500">输入学习时长和薄弱程度后，先生成预览，再确认保存到计划。</p>}
          {preview && !preview.tasks.length && <p className="rounded-lg bg-white p-5 text-sm text-slate-500">没有可生成的任务，可能 7 天都已被跳过。</p>}
        </div>
      </section>
    </section>
  );
}

function MessageListPage({ user, messages, onRefresh }: { user: User; messages: StudyMessage[]; onRefresh: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const threads = useMemo(() => groupMessageThreads(messages), [messages]);

  async function markRead(message: StudyMessage) {
    setError('');
    setNotice('');
    try {
      await api(`/messages/${message.id}/read`, { method: 'PUT', headers: authHeaders(user) });
      await onRefresh();
      setNotice('已标记为已读');
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记已读失败');
    }
  }

  useEffect(() => {
    const unreadReceived = messages.filter((message) => message.receiverId === user.id && !message.isRead);
    if (!unreadReceived.length) return;
    Promise.all(unreadReceived.map((message) => api(`/messages/${message.id}/read`, { method: 'PUT', headers: authHeaders(user) })))
      .then(() => onRefresh())
      .catch(() => undefined);
  }, [messages.map((message) => `${message.id}:${message.isRead}`).join(','), user.id]);

  return (
    <section className="card p-5">
      <h2 className="mb-2 text-2xl font-black">留言</h2>
      <p className="mb-5 text-sm text-slate-500">你不是一个人在坚持。</p>
      {error && <ErrorNotice message={error} />}
      {notice && <SuccessNotice message={notice} />}
      <div className="space-y-3">
        {threads.map(({ root, replies }) => (
          <MessageThreadCard
            key={root.id}
            root={root}
            replies={replies}
            replyEndpoint={`/messages/${root.id}/reply`}
            user={user}
            onRefresh={onRefresh}
            onError={setError}
            onNotice={setNotice}
            extraAction={!root.isRead && root.receiverId === user.id ? <button className="btn btn-ghost h-9 min-h-9" onClick={() => markRead(root)}><Check size={16} /> 标记已读</button> : null}
          />
        ))}
        {!threads.length && <p className="rounded-lg bg-white p-5 text-sm text-slate-500">还没有留言。</p>}
      </div>
    </section>
  );
}

function MessageBubble({ message, user, nested = false }: { message: StudyMessage; user: User; nested?: boolean }) {
  const roleLabel = message.senderRole === 'student' ? '学生' : '监督者';
  const isOwnMessage = message.senderId === user.id;
  const readLabel = isOwnMessage ? '已发送' : message.isRead ? '已读' : '未读';
  return (
    <div className={`rounded-lg bg-white p-4 ${nested ? 'ml-4 border-l-4 border-rosepaper' : ''}`}>
      <div className="mb-2 flex flex-wrap gap-2">
        <span className={`pill ${message.senderRole === 'student' ? 'bg-emerald-50 text-emerald-700' : 'bg-rosepaper text-slate-600'}`}>{roleLabel}</span>
        <span className="pill bg-slate-100 text-slate-600">{message.senderName || roleLabel}</span>
        <span className={`pill ${!isOwnMessage && !message.isRead ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{readLabel}</span>
        <span className="pill bg-white text-slate-500">{new Date(message.createdAt).toLocaleString()}</span>
      </div>
      <p className="leading-7 text-slate-700">{message.content}</p>
    </div>
  );
}

function MessageThreadCard({
  root,
  replies,
  replyEndpoint,
  user,
  onRefresh,
  onError,
  onNotice,
  extraAction
}: {
  root: StudyMessage;
  replies: StudyMessage[];
  replyEndpoint: string;
  user: User;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  extraAction?: React.ReactNode;
}) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = reply.trim();
    if (!content) {
      onError('回复内容不能为空');
      return;
    }
    onError('');
    onNotice('');
    setSending(true);
    try {
      await api(replyEndpoint, {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ content })
      });
      setReply('');
      await onRefresh();
      onNotice('回复已发送');
    } catch (err) {
      onError(err instanceof Error ? err.message : '回复失败');
    } finally {
      setSending(false);
    }
  }

  return (
    <article className="rounded-lg bg-white/70 p-3">
      <MessageBubble message={root} user={user} />
      {extraAction && <div className="mt-2">{extraAction}</div>}
      <div className="mt-3 space-y-2">
        {replies.map((message) => <MessageBubble key={message.id} message={message} user={user} nested />)}
      </div>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 md:flex-row">
        <input className="field flex-1" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="写一条回复..." />
        <button className="btn btn-primary md:w-auto" disabled={sending || !reply.trim()}><Mail size={18} /> {sending ? '发送中' : '回复'}</button>
      </form>
    </article>
  );
}

function PlanPage({
  user,
  date,
  setDate,
  tasks,
  onRefresh,
  onTaskStatusChange,
  onStatsRefresh
}: {
  user: User;
  date: string;
  setDate: (date: string) => void;
  tasks: StudyTask[];
  onRefresh: () => Promise<void>;
  onTaskStatusChange: (taskId: number, status: TaskStatus) => void;
  onStatsRefresh: () => Promise<void>;
}) {
  const [subject, setSubject] = useState<'all' | Subject>('all');
  const [editing, setEditing] = useState<StudyTask | null>(null);
  const [actionError, setActionError] = useState('');
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<number>>(() => new Set());
  const taskRequestVersions = useRef<Record<number, number>>({});
  const grouped = useMemo(() => groupTasks(tasks.filter((task) => subject === 'all' || task.subject === subject)), [tasks, subject]);

  async function toggleTask(task: StudyTask) {
    setActionError('');
    const previousStatus = task.status;
    const nextStatus: TaskStatus = task.status === 'completed' ? 'not_started' : 'completed';
    const nextVersion = (taskRequestVersions.current[task.id] || 0) + 1;
    taskRequestVersions.current[task.id] = nextVersion;
    onTaskStatusChange(task.id, nextStatus);
    setUpdatingTaskIds((current) => new Set(current).add(task.id));

    try {
      const updatedTask = await api<StudyTask>(`/tasks/${task.id}`, {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify({ status: nextStatus })
      });
      if (taskRequestVersions.current[task.id] === nextVersion) {
        onTaskStatusChange(task.id, updatedTask.status);
        void onStatsRefresh();
      }
    } catch (err) {
      if (taskRequestVersions.current[task.id] === nextVersion) {
        onTaskStatusChange(task.id, previousStatus);
        setActionError(err instanceof Error ? err.message : '任务状态更新失败，请稍后重试');
      }
    } finally {
      if (taskRequestVersions.current[task.id] === nextVersion) {
        setUpdatingTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
    }
  }

  async function removeTask(task: StudyTask) {
    setActionError('');
    try {
      const response = await fetch(`${API_BASE}/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders(user) });
      if (!response.ok) throw new Error('删除任务失败');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '删除任务失败');
    }
  }

  async function createTemplate() {
    setActionError('');
    try {
      await api('/tasks/default-template', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ date })
      });
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '生成默认任务失败');
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input className="field w-auto" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <select className="field w-auto" value={subject} onChange={(event) => setSubject(event.target.value as Subject | 'all')}>
              <option value="all">全部科目</option>
              {Object.entries(subjectLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={createTemplate}>
            <Sparkles size={18} /> 生成默认任务
          </button>
        </div>
        {actionError && <ErrorNotice message={actionError} />}

        <div className="space-y-4">
          {(Object.keys(grouped) as Subject[]).map((key) => (
            <section key={key}>
              <h3 className="mb-3 text-lg font-black">{subjectLabels[key]}</h3>
              <div className="grid gap-3">
                {grouped[key].map((task) => {
                  const isUpdating = updatingTaskIds.has(task.id);
                  return (
                  <article key={task.id} className={`card p-4 transition ${isUpdating ? 'ring-2 ring-tea/20' : ''}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <button className="flex min-w-0 items-start gap-3 text-left" onClick={() => toggleTask(task)} title="切换完成状态">
                        <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${task.status === 'completed' ? 'border-tea bg-tea text-white' : 'border-slate-300 bg-white'}`}>
                          {task.status === 'completed' && <Check size={16} />}
                        </span>
                        <span>
                          <span className="block font-black">{task.title}</span>
                          <span className="mt-1 block text-sm leading-6 text-slate-500">{task.description || '还没有描述'}</span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <span className={`pill border ${subjectTone[task.subject]}`}>{subjectLabels[task.subject]}</span>
                        <span className="pill bg-slate-100 text-slate-600">{task.estimatedMinutes} 分钟</span>
                        <span className="pill bg-amber-50 text-amber-700">优先级 {priorityLabels[task.priority]}</span>
                        <span className="pill bg-teal-50 text-teal-700">{statusLabels[task.status]}</span>
                        {isUpdating && <span className="pill bg-white text-slate-500">保存中</span>}
                        <button className="btn btn-ghost h-9 min-h-9 px-3" onClick={() => setEditing(task)} title="编辑任务"><Edit3 size={16} /></button>
                        <button className="btn btn-ghost h-9 min-h-9 px-3" onClick={() => removeTask(task)} title="删除任务"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </article>
                );})}
                {!grouped[key].length && <p className="rounded-lg bg-white/70 p-4 text-sm text-slate-500">这个科目今天还没有任务。</p>}
              </div>
            </section>
          ))}
        </div>
      </div>

      <TaskForm user={user} date={date} editing={editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await onRefresh(); }} />
    </section>
  );
}

function TaskForm({
  user,
  date,
  editing,
  onCancel,
  onSaved
}: {
  user: User;
  date: string;
  editing: StudyTask | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    date,
    subject: 'english' as Subject,
    title: '',
    description: '',
    estimatedMinutes: '45',
    priority: 'medium' as Priority,
    status: 'not_started' as TaskStatus
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editing ? {
      date: editing.date,
      subject: editing.subject,
      title: editing.title,
      description: editing.description,
      estimatedMinutes: String(editing.estimatedMinutes),
      priority: editing.priority,
      status: editing.status
    } : {
      date,
      subject: 'english',
      title: '',
      description: '',
      estimatedMinutes: '45',
      priority: 'medium',
      status: 'not_started'
    });
  }, [editing, date]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.date || !form.title.trim()) {
      setError('请填写日期和任务标题');
      return;
    }
    const minutesError = validateIntegerInput(form.estimatedMinutes, '预计学习时长', 0);
    if (minutesError) {
      setError(minutesError);
      return;
    }

    setError('');
    setNotice('');
    setSaving(true);
    const path = editing ? `/tasks/${editing.id}` : '/tasks';
    try {
      await api(path, {
        method: editing ? 'PUT' : 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ ...form, title: form.title.trim(), estimatedMinutes: Number(form.estimatedMinutes) })
      });
      await onSaved();
      setNotice(editing ? '任务已更新' : '任务已添加');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存任务失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card h-fit p-5">
      <h3 className="mb-4 text-xl font-black">{editing ? '编辑任务' : '添加任务'}</h3>
      {error && <ErrorNotice message={error} />}
      {notice && <SuccessNotice message={notice} />}
      <div className="space-y-3">
        <input className="field" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        <select className="field" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value as Subject })}>
          {Object.entries(subjectLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input className="field" placeholder="任务标题" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        <textarea className="field min-h-24" placeholder="任务描述" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <input className="field" type="number" min={5} step={5} value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: event.target.value })} required />
        <div className="grid grid-cols-2 gap-3">
          <select className="field" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
          <select className="field" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}>
            <option value="not_started">未开始</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary flex-1" disabled={saving}><Save size={18} /> {saving ? '保存中' : '保存'}</button>
        {editing && <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}

function CheckinPage({
  user,
  date,
  setDate,
  tasks,
  stats,
  onRefresh
}: {
  user: User;
  date: string;
  setDate: (date: string) => void;
  tasks: StudyTask[];
  stats: StudentStats | null;
  onRefresh: () => Promise<void>;
}) {
  const completed = tasks.filter((task) => task.status === 'completed');
  const [summary, setSummary] = useState('');
  const [note, setNote] = useState('');
  const [moodScore, setMoodScore] = useState(4);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSummary(stats?.checkin?.summary || '');
    setNote(stats?.checkin?.note || '');
    setMoodScore(stats?.checkin?.moodScore || 4);
  }, [stats?.checkin?.id, date]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await api('/checkins', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({
          date,
          completedTaskIds: completed.map((task) => task.id),
          summary,
          note,
          moodScore
        })
      });
      await onRefresh();
      setNotice('今天的努力已经记录下来啦。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交打卡失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="card p-5">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black">{stats?.isCheckedIn ? '今日已打卡' : '每日打卡'}</h2>
            <p className="mt-1 text-sm text-slate-500">打卡会自动读取当天已完成任务和预计学习时长。</p>
          </div>
          <input className="field w-auto" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        {error && <ErrorNotice message={error} />}
        {notice && <SuccessNotice message={notice} />}
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <Metric title="学习时长" value={`${stats?.totalStudyMinutes ?? 0} 分钟`} />
          <Metric title="完成任务" value={`${completed.length} 项`} />
          <Metric title="完成科目" value={`${new Set(completed.map((task) => task.subject)).size} 门`} />
        </div>
        <div className="mb-5">
          <h3 className="mb-3 font-black">今日完成任务</h3>
          <div className="grid gap-2">
            {completed.map((task) => (
              <div key={task.id} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                {subjectLabels[task.subject]} · {task.title} · {task.estimatedMinutes} 分钟
              </div>
            ))}
            {!completed.length && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">还没有完成任务，先回今日计划勾选几项吧。</p>}
          </div>
        </div>
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">今日学习总结</span>
          <textarea className="field min-h-28" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="今天学到了什么？哪里还需要复盘？" />
        </label>
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">今日状态评分：{moodScore}</span>
          <input className="w-full accent-[#5b8c7a]" type="range" min={1} max={5} value={moodScore} onChange={(event) => setMoodScore(Number(event.target.value))} />
        </label>
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">备注</span>
          <textarea className="field min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="可以写一句鼓励自己的话。" />
        </label>
        <button className="btn btn-primary" disabled={!completed.length || saving}>
          <Check size={18} /> {saving ? '保存中' : stats?.isCheckedIn ? '更新打卡' : '提交打卡'}
        </button>
      </form>

      <aside className="card h-fit p-5">
        <h3 className="mb-3 text-xl font-black">今天的小结</h3>
        <p className="leading-7 text-slate-600">今天也在靠近目标。完成率是 {stats?.completionRate ?? 0}%，连续打卡 {stats?.streak ?? 0} 天。</p>
        {stats?.checkin && (
          <div className="mt-4 rounded-lg bg-white p-4 text-sm leading-7 text-slate-600">
            <p className="font-black text-ink">已记录</p>
            <p>{stats.checkin.summary || '暂无总结'}</p>
            <p className="mt-2">状态评分：{stats.checkin.moodScore}/5</p>
          </div>
        )}
      </aside>
    </section>
  );
}

function HistoryPage({ checkins, user }: { checkins: DailyCheckin[]; user: User }) {
  const [selectedDate, setSelectedDate] = useState(checkins[0]?.date || today());
  const [detail, setDetail] = useState<DailyCheckin | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (checkins.length && !checkins.some((item) => item.date === selectedDate)) {
      setSelectedDate(checkins[0].date);
    }
  }, [checkins, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    setError('');
    api<DailyCheckin | null>(`/checkins/${selectedDate}`, { headers: authHeaders(user) })
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : '加载打卡详情失败'));
  }, [selectedDate, user.id]);

  return (
    <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="card p-4">
        <h2 className="mb-3 text-xl font-black">历史打卡</h2>
        <div className="space-y-2">
          {checkins.map((item) => (
            <button key={item.id} className={`w-full rounded-lg px-3 py-3 text-left text-sm font-bold ${selectedDate === item.date ? 'bg-tea text-white' : 'bg-white text-slate-600'}`} onClick={() => setSelectedDate(item.date)}>
              {item.date} · {item.totalStudyMinutes} 分钟
            </button>
          ))}
          {!checkins.length && <p className="text-sm text-slate-500">还没有历史打卡。</p>}
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      <CheckinDetail detail={detail} />
    </section>
  );
}

function SupervisorApp({ user }: { user: User }) {
  const [tab, setTab] = useState<'dashboard' | 'binding' | 'history' | 'stats' | 'messages'>('dashboard');
  const [dashboard, setDashboard] = useState<StudentStats | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [stats, setStats] = useState<SevenDayStats | null>(null);
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [students, setStudents] = useState<BoundStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [dashboardData, checkinData, statsData, messageData, studentData] = await Promise.all([
        api<StudentStats>('/supervisor/dashboard', { headers: authHeaders(user) }),
        api<DailyCheckin[]>('/supervisor/checkins', { headers: authHeaders(user) }),
        api<SevenDayStats>('/supervisor/stats', { headers: authHeaders(user) }),
        api<StudyMessage[]>('/supervisor/messages', { headers: authHeaders(user) }),
        api<BoundStudent[]>('/supervisor/students', { headers: authHeaders(user) })
      ]);
      setDashboard(dashboardData);
      setCheckins(checkinData);
      setStats(statsData);
      setMessages(messageData);
      setStudents(studentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载监督后台失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <TabBar
        items={[
          ['dashboard', '后台首页', LayoutDashboard],
          ['binding', '绑定学生', Heart],
          ['history', '打卡详情', CalendarDays],
          ['stats', '数据统计', BarChart3],
          ['messages', '留言', MessageCircle]
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />
      {loading && <LoadingNotice />}
      {error && <ErrorNotice message={error} />}
      {tab === 'dashboard' && dashboard && <SupervisorDashboard user={user} dashboard={dashboard} onOpenBinding={() => setTab('binding')} />}
      {tab === 'binding' && <SupervisorBindingPage user={user} students={students} onRefresh={async () => { await refresh(); setTab('dashboard'); }} />}
      {tab === 'history' && <SupervisorHistory user={user} checkins={checkins} />}
      {tab === 'stats' && stats && <StatsPage stats={stats} />}
      {tab === 'messages' && <SupervisorMessagesPage user={user} messages={messages} onRefresh={refresh} />}
    </>
  );
}

function SupervisorBindingPage({ user, students, onRefresh }: { user: User; students: BoundStudent[]; onRefresh: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!code.trim()) {
      setError('请输入绑定码');
      return;
    }
    setSaving(true);
    try {
      await api('/supervisor/bind-student', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ code: code.trim() })
      });
      setCode('');
      setNotice('绑定成功，已可以查看她的学习记录。');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <form onSubmit={submit} className="card h-fit p-5">
        <h2 className="mb-3 text-2xl font-black">绑定学生</h2>
        <p className="mb-4 text-sm leading-6 text-slate-600">请输入她在学生端生成的绑定码，绑定后才能查看她的打卡和学习完成情况。</p>
        {error && <ErrorNotice message={error} />}
        {notice && <SuccessNotice message={notice} />}
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">绑定码</span>
          <input className="field text-center text-2xl font-black tracking-[0.2em]" value={code} onChange={(event) => setCode(event.target.value)} maxLength={8} />
        </label>
        <button className="btn btn-primary" disabled={saving}><Check size={18} /> {saving ? '绑定中' : '确认绑定'}</button>
      </form>
      <aside className="card p-5">
        <h3 className="mb-4 text-xl font-black">已绑定学生</h3>
        <div className="space-y-2">
          {students.map((student) => (
            <div key={student.id} className="rounded-lg bg-white p-3 text-sm font-bold text-slate-600">
              {student.nickname || student.username}
              <span className="ml-2 text-xs font-normal text-slate-400">绑定于 {new Date(student.boundAt).toLocaleString()}</span>
            </div>
          ))}
          {!students.length && <p className="text-sm text-slate-500">还没有绑定学生，请输入她给你的绑定码。</p>}
        </div>
      </aside>
    </section>
  );
}

function SupervisorDashboard({ user, dashboard, onOpenBinding }: { user: User; dashboard: StudentStats; onOpenBinding: () => void }) {
  if (dashboard.unbound) {
    return (
      <section className="card p-6">
        <p className="text-sm font-bold text-tea">还没有绑定学生</p>
        <h2 className="mt-2 text-2xl font-black">请输入她给你的绑定码</h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          绑定成功后，你才能看到对应学生的打卡、任务、统计和留言状态。这样她的学习记录只会分享给真正绑定的监督者。
        </p>
        <button className="btn btn-primary mt-5" onClick={onOpenBinding}><Heart size={18} /> 去绑定学生</button>
      </section>
    );
  }

  return (
    <section>
      {dashboard.student && (
        <p className="mb-4 rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-600">
          当前查看：{dashboard.student.nickname || dashboard.student.username}
        </p>
      )}
      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Metric title="今日状态" value={dashboard.isCheckedIn ? '已打卡' : '未打卡'} />
        <Metric title="学习时长" value={`${dashboard.checkin?.totalStudyMinutes ?? dashboard.totalStudyMinutes} 分钟`} />
        <Metric title="完成任务" value={`${dashboard.completedTasks}/${dashboard.totalTasks}`} />
        <Metric title="完成科目" value={`${dashboard.completedSubjects.length} 门`} />
        <Metric title="连续打卡" value={`${dashboard.streak} 天`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {!dashboard.isCheckedIn && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 lg:col-span-2">今天还没有打卡，可以晚点再看看。</p>}
        <section className="card p-5">
          <h2 className="mb-4 text-2xl font-black">今日任务完成情况</h2>
          <div className="space-y-3">
            {dashboard.tasks.map((task) => (
              <div key={task.id} className="flex flex-col gap-2 rounded-lg bg-white p-3 md:flex-row md:items-center md:justify-between">
                <span className="font-bold">{subjectLabels[task.subject]} · {task.title}</span>
                <span className={`pill ${task.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabels[task.status]}</span>
              </div>
            ))}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="card p-5">
            <h3 className="mb-2 text-xl font-black">留言状态</h3>
            <p className="text-sm leading-6 text-slate-600">未读留言 {dashboard.unreadMessages ?? 0} 条。我会在后台看着你的努力，也会一直陪着你。</p>
            <div className="mt-3 space-y-2">
              {(dashboard.recentMessages || []).slice(0, 3).map((message) => {
                const unreadForMe = message.receiverId === user.id && !message.isRead;
                const label = message.senderId === user.id ? '已发送' : unreadForMe ? '未读' : '已读';
                return (
                  <div key={message.id} className="rounded-lg bg-white p-3 text-sm text-slate-600">
                    <span className={`pill mr-2 ${unreadForMe ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{label}</span>
                    {message.content}
                  </div>
                );
              })}
            </div>
          </section>
          <CheckinDetail detail={dashboard.checkin} compact />
        </aside>
      </div>
    </section>
  );
}

function SupervisorMessagesPage({ user, messages, onRefresh }: { user: User; messages: StudyMessage[]; onRefresh: () => Promise<void> }) {
  const [content, setContent] = useState('');
  const [type, setType] = useState<MessageType>('encouragement');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const threads = useMemo(() => groupMessageThreads(messages), [messages]);

  useEffect(() => {
    const unreadReceived = messages.filter((message) => message.receiverId === user.id && !message.isRead);
    if (!unreadReceived.length) return;
    Promise.all(unreadReceived.map((message) => api(`/supervisor/messages/${message.id}/read`, { method: 'PUT', headers: authHeaders(user) })))
      .then(() => onRefresh())
      .catch(() => undefined);
  }, [messages.map((message) => `${message.id}:${message.isRead}`).join(','), user.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) {
      setError('留言内容不能为空');
      return;
    }
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await api('/supervisor/messages', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ content: content.trim(), type })
      });
      setContent('');
      await onRefresh();
      setNotice('留言已发送，她打开 App 就能看到。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送留言失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="card h-fit p-5">
        <h2 className="mb-4 text-2xl font-black">发送留言</h2>
        {error && <ErrorNotice message={error} />}
        {notice && <SuccessNotice message={notice} />}
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">留言类型</span>
          <select className="field" value={type} onChange={(event) => setType(event.target.value as MessageType)}>
            {newMessageTypes.map((key) => <option key={key} value={key}>{messageTypeLabels[key]}</option>)}
          </select>
        </label>
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-600">留言内容</span>
          <textarea className="field min-h-32" value={content} onChange={(event) => setContent(event.target.value)} placeholder="我会在后台看着你的努力，也会一直陪着你。" required />
        </label>
        <button className="btn btn-primary" disabled={saving}><Mail size={18} /> {saving ? '发送中' : '发送留言'}</button>
      </form>
      <section className="card p-5">
        <h2 className="mb-4 text-2xl font-black">历史留言</h2>
        <div className="space-y-3">
          {threads.map(({ root, replies }) => (
            <MessageThreadCard
              key={root.id}
              root={root}
              replies={replies}
              replyEndpoint={`/supervisor/messages/${root.id}/reply`}
              user={user}
              onRefresh={onRefresh}
              onError={setError}
              onNotice={setNotice}
            />
          ))}
          {!threads.length && <p className="rounded-lg bg-white p-5 text-sm text-slate-500">还没有留言。</p>}
        </div>
      </section>
    </section>
  );
}

function SupervisorHistory({ user, checkins }: { user: User; checkins: DailyCheckin[] }) {
  const [date, setDate] = useState(checkins[0]?.date || today());
  const [detail, setDetail] = useState<DailyCheckin | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (checkins.length && !checkins.some((item) => item.date === date)) {
      setDate(checkins[0].date);
    }
  }, [checkins, date]);

  useEffect(() => {
    setError('');
    api<DailyCheckin | null>(`/supervisor/checkins/${date}`, { headers: authHeaders(user) })
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : '加载打卡详情失败'));
  }, [date, user.id]);

  return (
    <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="card p-4">
        <h2 className="mb-3 text-xl font-black">按日期查看</h2>
        <input className="field mb-4" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <div className="space-y-2">
          {checkins.map((item) => (
            <button key={item.id} className="w-full rounded-lg bg-white px-3 py-3 text-left text-sm font-bold text-slate-600" onClick={() => setDate(item.date)}>
              {item.date} · {item.totalStudyMinutes} 分钟
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      <CheckinDetail detail={detail} />
    </section>
  );
}

function StatsPage({ stats }: { stats: SevenDayStats }) {
  return (
    <section className="grid gap-5 lg:grid-cols-3">
      <ChartCard title="最近 7 天学习时长" items={stats.studyMinutes} suffix="分钟" />
      <ChartCard title="最近 7 天任务完成数" items={stats.completedTasks} suffix="项" />
      <section className="card p-5">
        <h2 className="mb-4 text-xl font-black">四科时间占比</h2>
        <div className="space-y-4">
          {stats.subjectMinutes.map((item) => {
            const total = stats.subjectMinutes.reduce((sum, current) => sum + current.value, 0) || 1;
            const percent = Math.round((item.value / total) * 100);
            return (
              <div key={item.subject}>
                <div className="mb-2 flex justify-between text-sm font-bold text-slate-600">
                  <span>{item.label}</span>
                  <span>{percent}% · {item.value} 分钟</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-tea" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function ChartCard({ title, items, suffix }: { title: string; items: Array<{ date: string; value: number }>; suffix: string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      <div className="overflow-x-auto pb-1">
        <div className="flex h-64 min-w-[320px] items-end gap-3">
          {items.map((item) => (
            <div key={item.date} className="flex h-full flex-1 flex-col justify-end gap-2">
              <div className="flex min-h-8 items-end justify-center text-xs font-bold text-slate-500">{item.value}{suffix}</div>
              <div className="rounded-t-lg bg-tea" style={{ height: `${Math.max(8, (item.value / max) * 170)}px` }} />
              <div className="text-center text-xs font-bold text-slate-500">{item.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CheckinDetail({ detail, compact = false }: { detail: DailyCheckin | null; compact?: boolean }) {
  if (!detail) {
    return <section className="card p-5 text-slate-500">这一天还没有打卡记录。</section>;
  }

  return (
    <section className="card p-5">
      <h2 className="mb-4 text-xl font-black">{detail.date} 打卡详情</h2>
      <div className={`mb-4 grid gap-3 ${compact ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
        <Metric title="学习时长" value={`${detail.totalStudyMinutes} 分钟`} />
        <Metric title="状态评分" value={`${detail.moodScore}/5`} />
        <Metric title="完成科目" value={`${detail.completedSubjects.length} 门`} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {detail.completedSubjects.map((subject) => <span key={subject} className={`pill border ${subjectTone[subject]}`}>{subjectLabels[subject]}</span>)}
      </div>
      <div className="mb-4 rounded-lg bg-white p-4">
        <p className="mb-2 font-black">学习总结</p>
        <p className="leading-7 text-slate-600">{detail.summary || '暂无总结'}</p>
      </div>
      <div className="mb-4 rounded-lg bg-white p-4">
        <p className="mb-2 font-black">备注</p>
        <p className="leading-7 text-slate-600">{detail.note || '暂无备注'}</p>
      </div>
      <div>
        <p className="mb-2 font-black">完成任务</p>
        <div className="grid gap-2">
          {(detail.completedTaskItems || []).map((task) => (
            <div key={task.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {subjectLabels[task.subject]} · {task.title} · {task.estimatedMinutes} 分钟
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

function LoadingNotice() {
  return <p className="mb-4 rounded-lg bg-white/80 px-3 py-2 text-sm font-bold text-slate-500">加载中...</p>;
}

function ErrorNotice({ message }: { message: string }) {
  return <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{message}</p>;
}

function SuccessNotice({ message }: { message: string }) {
  return <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p>;
}

function TabBar<T extends string>({
  items,
  value,
  onChange
}: {
  items: Array<[T, string, React.ComponentType<{ size?: string | number }>]>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {items.map(([key, label, Icon]) => (
        <button key={key} className={`btn ${value === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange(key)}>
          <Icon size={18} /> {label}
        </button>
      ))}
    </nav>
  );
}

function groupTasks(tasks: StudyTask[]) {
  return (Object.keys(subjectLabels) as Subject[]).reduce<Record<Subject, StudyTask[]>>((result, subject) => {
    result[subject] = tasks.filter((task) => task.subject === subject);
    return result;
  }, { english: [], politics: [], major1: [], major2: [] });
}

export default App;
