import { useEffect, useMemo, useState } from 'react';
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
  Trash2
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
type MessageType = 'encouragement' | 'reminder' | 'review';

type User = {
  id: number;
  username: string;
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
  date: string;
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
  typeLabel: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
  receiverName?: string;
};

type WeekPlanPreview = {
  dates: string[];
  existingDates: string[];
  skippedDates: string[];
  tasks: Array<Omit<StudyTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
  createdCount?: number;
  message?: string;
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
  review: '复盘'
};

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

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('kaoyan-user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    return parsed.token ? parsed : null;
  });

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

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <Shell user={user} onLogout={logout}>
      {user.role === 'student' ? <StudentApp user={user} /> : <SupervisorApp user={user} />}
    </Shell>
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

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('student');
  const [password, setPassword] = useState('123456');
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
              <p className="mt-2 text-sm text-slate-500">默认账号：student / supervisor，密码均为 123456。</p>
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
          <span className="pill bg-white text-slate-600 shadow-sm">{user.username} · {user.role === 'student' ? '学生' : '监督'}</span>
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
  const [tab, setTab] = useState<'plan' | 'week' | 'checkin' | 'messages' | 'profile' | 'history'>('plan');
  const [date, setDate] = useState(today());
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError('');
    setLoading(true);
    try {
      const [taskData, statData, checkinData] = await Promise.all([
        api<StudyTask[]>(`/tasks?date=${date}`, { headers: authHeaders(user) }),
        api<StudentStats>(`/stats/student?date=${date}`, { headers: authHeaders(user) }),
        api<DailyCheckin[]>('/checkins', { headers: authHeaders(user) })
      ]);
      const [profileData, messageData] = await Promise.all([
        api<Profile>('/profile', { headers: authHeaders(user) }),
        api<StudyMessage[]>('/messages', { headers: authHeaders(user) })
      ]);
      setTasks(taskData);
      setStats(statData);
      setCheckins(checkinData);
      setProfile(profileData);
      setMessages(messageData);
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
      <StudentDashboard stats={stats} profile={profile} messages={messages} onSetProfile={() => setTab('profile')} onOpenMessages={() => setTab('messages')} />
      <TabBar
        items={[
          ['plan', '今日计划', ClipboardList],
          ['week', '一周计划生成', Sparkles],
          ['checkin', '每日打卡', CalendarDays],
          ['messages', `留言${messages.some((message) => !message.isRead) ? ' · 未读' : ''}`, MessageCircle],
          ['profile', '目标设置', Target],
          ['history', '历史记录', BarChart3]
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{notice}</p>}
      {loading && <LoadingNotice />}
      {tab === 'plan' && <PlanPage user={user} date={date} setDate={setDate} tasks={tasks} onRefresh={refresh} />}
      {tab === 'week' && <WeekPlanPage user={user} profile={profile} onGenerated={async (startDate) => { setDate(startDate); setTab('plan'); setNotice('未来 7 天学习计划已生成'); await refresh(); }} />}
      {tab === 'checkin' && <CheckinPage user={user} date={date} setDate={setDate} tasks={tasks} stats={stats} onRefresh={refresh} />}
      {tab === 'messages' && <MessageListPage user={user} messages={messages} onRefresh={refresh} />}
      {tab === 'profile' && <ProfilePage user={user} profile={profile} onSaved={refresh} />}
      {tab === 'history' && <HistoryPage checkins={checkins} user={user} />}
    </>
  );
}

function StudentDashboard({
  stats,
  profile,
  messages,
  onSetProfile,
  onOpenMessages
}: {
  stats: StudentStats | null;
  profile: Profile | null;
  messages: StudyMessage[];
  onSetProfile: () => void;
  onOpenMessages: () => void;
}) {
  const recentMessages = messages.slice(0, 3);
  const unreadCount = messages.filter((message) => !message.isRead).length;

  return (
    <section className="mb-5 space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="今日完成率" value={`${stats?.completionRate ?? 0}%`} />
        <Metric title="已完成任务" value={`${stats?.completedTasks ?? 0}/${stats?.totalTasks ?? 0}`} />
        <Metric title="预计学习时长" value={`${stats?.totalStudyMinutes ?? 0} 分钟`} />
        <Metric title="连续打卡" value={`${stats?.streak ?? 0} 天`} />
      </div>
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
                <span className={`pill mr-2 ${message.isRead ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{message.typeLabel}</span>
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

function ProfilePage({ user, profile, onSaved }: { user: User; profile: Profile | null; onSaved: () => Promise<void> }) {
  const [examDate, setExamDate] = useState(profile?.examDate || '');
  const [dailyAvailableMinutes, setDailyAvailableMinutes] = useState(profile?.dailyAvailableMinutes || 360);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setExamDate(profile?.examDate || '');
    setDailyAvailableMinutes(profile?.dailyAvailableMinutes || 360);
  }, [profile?.examDate, profile?.dailyAvailableMinutes]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await api('/profile', {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify({ examDate, dailyAvailableMinutes })
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
          <input className="field" type="number" min={60} step={30} value={dailyAvailableMinutes} onChange={(event) => setDailyAvailableMinutes(Number(event.target.value))} />
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
  const [dailyAvailableMinutes, setDailyAvailableMinutes] = useState(profile?.dailyAvailableMinutes || 360);
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
    setLoading(true);
    try {
      const data = await api<WeekPlanPreview>('/tasks/generate-week-preview', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ dailyAvailableMinutes, startDate, weakness, skipExisting })
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
    setLoading(true);
    try {
      await api<WeekPlanPreview>('/tasks/generate-week', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ dailyAvailableMinutes, startDate, weakness, skipExisting })
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
          <input className="field" type="number" min={120} step={30} value={dailyAvailableMinutes} onChange={(event) => setDailyAvailableMinutes(Number(event.target.value))} />
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

  return (
    <section className="card p-5">
      <h2 className="mb-2 text-2xl font-black">留言</h2>
      <p className="mb-5 text-sm text-slate-500">你不是一个人在坚持。</p>
      {error && <ErrorNotice message={error} />}
      {notice && <SuccessNotice message={notice} />}
      <div className="space-y-3">
        {messages.map((message) => (
          <article key={message.id} className="rounded-lg bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <span className={`pill ${message.isRead ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{message.isRead ? '已读' : '未读'}</span>
                <span className="pill bg-rosepaper text-slate-600">{message.typeLabel}</span>
                <span className="pill bg-white text-slate-500">{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              {!message.isRead && <button className="btn btn-ghost h-9 min-h-9" onClick={() => markRead(message)}><Check size={16} /> 标记已读</button>}
            </div>
            <p className="leading-7 text-slate-700">{message.content}</p>
          </article>
        ))}
        {!messages.length && <p className="rounded-lg bg-white p-5 text-sm text-slate-500">还没有留言。</p>}
      </div>
    </section>
  );
}

function PlanPage({
  user,
  date,
  setDate,
  tasks,
  onRefresh
}: {
  user: User;
  date: string;
  setDate: (date: string) => void;
  tasks: StudyTask[];
  onRefresh: () => Promise<void>;
}) {
  const [subject, setSubject] = useState<'all' | Subject>('all');
  const [editing, setEditing] = useState<StudyTask | null>(null);
  const [actionError, setActionError] = useState('');
  const grouped = useMemo(() => groupTasks(tasks.filter((task) => subject === 'all' || task.subject === subject)), [tasks, subject]);

  async function toggleTask(task: StudyTask) {
    setActionError('');
    try {
      await api(`/tasks/${task.id}`, {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify({ status: task.status === 'completed' ? 'in_progress' : 'completed' })
      });
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '修改任务状态失败');
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
                {grouped[key].map((task) => (
                  <article key={task.id} className="card p-4">
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
                        <button className="btn btn-ghost h-9 min-h-9 px-3" onClick={() => setEditing(task)} title="编辑任务"><Edit3 size={16} /></button>
                        <button className="btn btn-ghost h-9 min-h-9 px-3" onClick={() => removeTask(task)} title="删除任务"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </article>
                ))}
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
    estimatedMinutes: 45,
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
      estimatedMinutes: editing.estimatedMinutes,
      priority: editing.priority,
      status: editing.status
    } : {
      date,
      subject: 'english',
      title: '',
      description: '',
      estimatedMinutes: 45,
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

    setError('');
    setNotice('');
    setSaving(true);
    const path = editing ? `/tasks/${editing.id}` : '/tasks';
    try {
      await api(path, {
        method: editing ? 'PUT' : 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ ...form, title: form.title.trim() })
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
        <input className="field" type="number" min={5} step={5} value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: Number(event.target.value) })} required />
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
  const [tab, setTab] = useState<'dashboard' | 'history' | 'stats' | 'messages'>('dashboard');
  const [dashboard, setDashboard] = useState<StudentStats | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [stats, setStats] = useState<SevenDayStats | null>(null);
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [dashboardData, checkinData, statsData, messageData] = await Promise.all([
        api<StudentStats>('/supervisor/dashboard', { headers: authHeaders(user) }),
        api<DailyCheckin[]>('/supervisor/checkins', { headers: authHeaders(user) }),
        api<SevenDayStats>('/supervisor/stats', { headers: authHeaders(user) }),
        api<StudyMessage[]>('/supervisor/messages', { headers: authHeaders(user) })
      ]);
      setDashboard(dashboardData);
      setCheckins(checkinData);
      setStats(statsData);
      setMessages(messageData);
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
          ['history', '打卡详情', CalendarDays],
          ['stats', '数据统计', BarChart3],
          ['messages', '留言', MessageCircle]
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />
      {loading && <LoadingNotice />}
      {error && <ErrorNotice message={error} />}
      {tab === 'dashboard' && dashboard && <SupervisorDashboard dashboard={dashboard} />}
      {tab === 'history' && <SupervisorHistory user={user} checkins={checkins} />}
      {tab === 'stats' && stats && <StatsPage stats={stats} />}
      {tab === 'messages' && <SupervisorMessagesPage user={user} messages={messages} onRefresh={refresh} />}
    </>
  );
}

function SupervisorDashboard({ dashboard }: { dashboard: StudentStats }) {
  return (
    <section>
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
              {(dashboard.recentMessages || []).slice(0, 3).map((message) => (
                <div key={message.id} className="rounded-lg bg-white p-3 text-sm text-slate-600">
                  <span className={`pill mr-2 ${message.isRead ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{message.isRead ? '已读' : '未读'}</span>
                  {message.content}
                </div>
              ))}
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
            {Object.entries(messageTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
          {messages.map((message) => (
            <article key={message.id} className="rounded-lg bg-white p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className={`pill ${message.isRead ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{message.isRead ? '已读' : '未读'}</span>
                <span className="pill bg-rosepaper text-slate-600">{message.typeLabel}</span>
                <span className="pill bg-white text-slate-500">{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <p className="leading-7 text-slate-700">{message.content}</p>
            </article>
          ))}
          {!messages.length && <p className="rounded-lg bg-white p-5 text-sm text-slate-500">还没有留言。</p>}
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
      <div className="flex h-64 items-end gap-3">
        {items.map((item) => (
          <div key={item.date} className="flex h-full flex-1 flex-col justify-end gap-2">
            <div className="flex min-h-8 items-end justify-center text-xs font-bold text-slate-500">{item.value}{suffix}</div>
            <div className="rounded-t-lg bg-tea" style={{ height: `${Math.max(8, (item.value / max) * 170)}px` }} />
            <div className="text-center text-xs font-bold text-slate-500">{item.date.slice(5)}</div>
          </div>
        ))}
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
