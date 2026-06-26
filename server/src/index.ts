import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'crypto';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Please set it in server/.env or your deployment environment.`);
  }
  return value;
}

const jwtSecret = requireEnv('JWT_SECRET');
const clientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || clientUrls.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

type Subject = 'english' | 'politics' | 'major1' | 'major2';
type Priority = 'high' | 'medium' | 'low';
type Role = 'student' | 'supervisor';
type TaskStatus = 'not_started' | 'in_progress' | 'completed';
type MessageType = 'encouragement' | 'reminder' | 'review';

const subjects: Subject[] = ['english', 'politics', 'major1', 'major2'];
const priorities: Priority[] = ['high', 'medium', 'low'];
const taskStatuses: TaskStatus[] = ['not_started', 'in_progress', 'completed'];
const messageTypes: MessageType[] = ['encouragement', 'reminder', 'review'];

const subjectLabels: Record<Subject, string> = {
  english: '英语',
  politics: '政治',
  major1: '专业课一',
  major2: '专业课二'
};

const defaultTemplates: Record<Subject, Array<{ title: string; description: string; estimatedMinutes: number; priority: Priority }>> = {
  english: [
    { title: '背单词', description: '复习核心词汇并标记生词。', estimatedMinutes: 30, priority: 'high' },
    { title: '阅读理解', description: '完成一篇阅读并整理错因。', estimatedMinutes: 45, priority: 'high' },
    { title: '长难句', description: '拆解 3 个长难句并复述结构。', estimatedMinutes: 25, priority: 'medium' }
  ],
  politics: [
    { title: '听课', description: '完成当天课程并记录重点。', estimatedMinutes: 45, priority: 'medium' },
    { title: '刷选择题', description: '完成一组选择题并订正。', estimatedMinutes: 35, priority: 'high' },
    { title: '整理错题', description: '把高频错题归类到错题本。', estimatedMinutes: 25, priority: 'medium' }
  ],
  major1: [
    { title: '看教材', description: '阅读指定章节并划出关键词。', estimatedMinutes: 50, priority: 'high' },
    { title: '背诵知识点', description: '背诵核心概念并自测。', estimatedMinutes: 45, priority: 'high' },
    { title: '做真题', description: '完成一道真题并整理答题框架。', estimatedMinutes: 40, priority: 'medium' }
  ],
  major2: [
    { title: '看教材', description: '推进指定页码并做边读边记。', estimatedMinutes: 50, priority: 'high' },
    { title: '整理框架', description: '梳理本章结构和关键词。', estimatedMinutes: 35, priority: 'medium' },
    { title: '背诵案例', description: '背诵并复述 2 个典型案例。', estimatedMinutes: 35, priority: 'medium' }
  ]
};

const weekTaskPools: Record<Subject, string[]> = {
  english: ['背单词', '阅读理解训练', '长难句分析', '作文素材积累'],
  politics: ['听课', '刷选择题', '整理错题', '背诵核心知识点'],
  major1: ['教材阅读', '法条背诵', '框架整理', '真题分析', '论述题训练'],
  major2: ['知识点背诵', '案例分析', '框架整理', '真题整理', '模拟题训练']
};

const subjectBaseWeights: Record<Subject, number> = {
  english: 1,
  politics: 1,
  major1: 1.25,
  major2: 1.25
};

const messageTypeLabels: Record<MessageType, string> = {
  encouragement: '鼓励',
  reminder: '提醒',
  review: '复盘'
};

type AuthedRequest = Request & { userId?: number; userRole?: Role };
type AsyncHandler = (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>;
type AuthTokenPayload = { userId: number; role: Role };

function today() {
  return formatLocalDate(new Date());
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseSubjects(value: string) {
  try {
    return JSON.parse(value || '[]') as Subject[];
  } catch {
    return [];
  }
}

function asyncHandler(handler: AsyncHandler) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeDate(value: unknown) {
  return isDateString(value) ? value : today();
}

function isSubject(value: unknown): value is Subject {
  return subjects.includes(value as Subject);
}

function isPriority(value: unknown): value is Priority {
  return priorities.includes(value as Priority);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return taskStatuses.includes(value as TaskStatus);
}

function normalizeMinutes(value: unknown, fallback = 30) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : fallback;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

function tomorrow() {
  return addDays(today(), 1);
}

function isMessageType(value: unknown): value is MessageType {
  return messageTypes.includes(value as MessageType);
}

function normalizeWeakness(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(5, Math.max(1, Math.round(score))) : 3;
}

function getCountdownMeta(examDate?: string | null) {
  if (!examDate) {
    return {
      examDate: null,
      daysLeft: null,
      stage: 'not_set',
      message: '还没有设置考研日期，先设定一个目标吧'
    };
  }

  const [examYear, examMonth, examDay] = examDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today().split('-').map(Number);
  const diff = Math.ceil((new Date(examYear, examMonth - 1, examDay).getTime() - new Date(todayYear, todayMonth - 1, todayDay).getTime()) / 86_400_000);
  if (diff < 0) {
    return {
      examDate,
      daysLeft: diff,
      stage: 'ended',
      message: '考试日期已结束，可以重新设置新的目标'
    };
  }
  if (diff > 180) return { examDate, daysLeft: diff, stage: '基础阶段', message: '现在是打基础的黄金期，慢慢来但不要停。' };
  if (diff >= 90) return { examDate, daysLeft: diff, stage: '强化阶段', message: '进入强化阶段了，开始把知识点串成体系。' };
  if (diff >= 30) return { examDate, daysLeft: diff, stage: '冲刺阶段', message: '冲刺阶段，每一天都很关键。' };
  return { examDate, daysLeft: diff, stage: '临考阶段', message: '稳住节奏，保持状态，比焦虑更重要。' };
}

async function getProfilePayload(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('用户不存在');
  return {
    examDate: user.examDate,
    dailyAvailableMinutes: user.dailyAvailableMinutes,
    countdown: getCountdownMeta(user.examDate)
  };
}

async function getMessagesForStudent(userId: number) {
  const messages = await prisma.message.findMany({
    where: { receiverId: userId },
    include: { sender: { select: { username: true } } },
    orderBy: { createdAt: 'desc' }
  });
  return messages.map((message) => ({
    ...message,
    typeLabel: messageTypeLabels[message.type as MessageType] || message.type,
    senderName: message.sender.username
  }));
}

async function getSupervisorMessages(supervisorId: number, studentId?: number) {
  const student = await getBoundStudentForSupervisor(supervisorId, studentId);
  if (!student) return [];
  const messages = await prisma.message.findMany({
    where: { receiverId: student.id, senderId: supervisorId },
    include: {
      sender: { select: { username: true } },
      receiver: { select: { username: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  return messages.map((message) => ({
    ...message,
    typeLabel: messageTypeLabels[message.type as MessageType] || message.type,
    senderName: message.sender.username,
    receiverName: message.receiver.username
  }));
}

async function buildWeekPlanPreview(
  userId: number,
  options: {
    dailyAvailableMinutes: number;
    weakness: Record<Subject, number>;
    startDate: string;
    skipExisting: boolean;
  }
) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(options.startDate, index));
  const existingTasks = await prisma.studyTask.findMany({
    where: { userId, date: { in: dates } },
    select: { date: true }
  });
  const existingDates = [...new Set(existingTasks.map((task) => task.date))];
  const skippedDates = options.skipExisting ? existingDates : [];
  const subjectWeights = subjects.reduce<Record<Subject, number>>((result, subject) => {
    result[subject] = normalizeWeakness(options.weakness[subject]) * subjectBaseWeights[subject];
    return result;
  }, { english: 1, politics: 1, major1: 1, major2: 1 });

  const generatedTasks = dates.flatMap((date, dayIndex) => {
    if (skippedDates.includes(date)) return [];

    const ranked = [...subjects].sort((a, b) => {
      const rotatedA = subjectWeights[a] + (a === subjects[dayIndex % subjects.length] ? 0.35 : 0);
      const rotatedB = subjectWeights[b] + (b === subjects[dayIndex % subjects.length] ? 0.35 : 0);
      return rotatedB - rotatedA;
    });
    const subjectCount = options.dailyAvailableMinutes >= 360 ? 3 : 2;
    const selected = [...new Set([subjects[dayIndex % subjects.length], ...ranked])].slice(0, subjectCount);
    const selectedWeightTotal = selected.reduce((sum, subject) => sum + subjectWeights[subject], 0);

    return selected.map((subject, taskIndex) => {
      const minutes = Math.max(25, Math.round((options.dailyAvailableMinutes * subjectWeights[subject] / selectedWeightTotal) / 5) * 5);
      const title = weekTaskPools[subject][(dayIndex + taskIndex) % weekTaskPools[subject].length];
      return {
        date,
        subject,
        title,
        description: `围绕${subjectLabels[subject]}进行${title}，结束后记录薄弱点和下一步复盘重点。`,
        estimatedMinutes: minutes,
        priority: taskIndex === 0 ? 'high' : 'medium',
        status: 'not_started'
      };
    });
  });

  return { dates, existingDates, skippedDates, tasks: generatedTasks };
}

async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ message: '请先登录' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as unknown as AuthTokenPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ message: '用户不存在' });
    }

    req.userId = user.id;
    req.userRole = user.role as Role;
    next();
  } catch (error) {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
}

function requireRole(role: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.userRole !== role) {
      return res.status(403).json({ message: '当前账号没有权限访问此功能' });
    }
    next();
  };
}

function isRole(value: unknown): value is Role {
  return value === 'student' || value === 'supervisor';
}

function createAuthResponse(user: { id: number; username: string; nickname: string; role: string }) {
  const token = jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      role: user.role
    }
  };
}

function generateBindCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function getRequestedStudentId(req: AuthedRequest) {
  const value = req.query.studentId ?? req.body?.studentId;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

async function getBoundStudentForSupervisor(supervisorId: number, studentId?: number) {
  const pair = await prisma.studyPair.findFirst({
    where: { supervisorId, ...(studentId ? { studentId } : {}) },
    include: { student: { select: { id: true, username: true, nickname: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  });
  return pair?.student ?? null;
}

function emptySupervisorDashboard(date = today()) {
  return {
    unbound: true,
    message: '还没有绑定学生，请输入她给你的绑定码。',
    date,
    tasks: [],
    totalTasks: 0,
    completedTasks: 0,
    completionRate: 0,
    totalStudyMinutes: 0,
    completedSubjects: [],
    checkin: null,
    isCheckedIn: false,
    streak: 0,
    recentMessages: [],
    unreadMessages: 0
  };
}

async function getCompletionSummary(userId: number, date: string) {
  const tasks = await prisma.studyTask.findMany({ where: { userId, date }, orderBy: [{ subject: 'asc' }, { createdAt: 'asc' }] });
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  return {
    tasks,
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    completionRate: tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
    totalStudyMinutes: completedTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    completedSubjects: [...new Set(completedTasks.map((task) => task.subject))]
  };
}

async function getStreak(userId: number) {
  const checkins = await prisma.dailyCheckin.findMany({
    where: { userId },
    select: { date: true },
    orderBy: { date: 'desc' }
  });
  const dates = new Set(checkins.map((checkin) => checkin.date));
  const [year, month, day] = today().split('-').map(Number);
  let cursor = new Date(year, month - 1, day);
  let streak = 0;

  while (dates.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

async function withCheckinDetails(userId: number, date: string) {
  const [checkin, summary] = await Promise.all([
    prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId, date } },
      include: { checkinTasks: { include: { task: true } } }
    }),
    getCompletionSummary(userId, date)
  ]);

  return checkin
    ? {
        ...checkin,
        completedSubjects: parseSubjects(checkin.completedSubjects),
        completedSubjectLabels: parseSubjects(checkin.completedSubjects).map((subject) => subjectLabels[subject]),
        completedTaskItems: checkin.checkinTasks.map((item) => item.task),
        summaryStats: summary
      }
    : null;
}

async function syncExistingCheckinWithCompletedTasks(userId: number, date: string) {
  const checkin = await prisma.dailyCheckin.findUnique({ where: { userId_date: { userId, date } } });
  if (!checkin) return;

  const completedTasks = await prisma.studyTask.findMany({
    where: { userId, date, status: 'completed' }
  });
  const completedSubjects = [...new Set(completedTasks.map((task) => task.subject))];
  const totalStudyMinutes = completedTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);

  await prisma.dailyCheckin.update({
    where: { id: checkin.id },
    data: {
      totalStudyMinutes,
      completedSubjects: JSON.stringify(completedSubjects)
    }
  });
  await prisma.checkinTask.deleteMany({ where: { checkinId: checkin.id } });
  if (completedTasks.length) {
    await prisma.checkinTask.createMany({
      data: completedTasks.map((task) => ({ checkinId: checkin.id, taskId: task.id }))
    });
  }
}

async function getSevenDayStats(userId: number) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return formatLocalDate(date);
  });

  const checkins = await prisma.dailyCheckin.findMany({
    where: { userId, date: { in: days } },
    include: { checkinTasks: true }
  });
  const tasks = await prisma.studyTask.findMany({
    where: { userId, date: { in: days }, status: 'completed' }
  });

  const studyMinutes = days.map((date) => ({
    date,
    value: checkins.find((item) => item.date === date)?.totalStudyMinutes ?? 0
  }));
  const completedTasks = days.map((date) => ({
    date,
    value: tasks.filter((task) => task.date === date).length
  }));
  const subjectMinutes = (Object.keys(subjectLabels) as Subject[]).map((subject) => ({
    subject,
    label: subjectLabels[subject],
    value: tasks.filter((task) => task.subject === subject).reduce((sum, task) => sum + task.estimatedMinutes, 0)
  }));

  return { studyMinutes, completedTasks, subjectMinutes };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/register', asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const nickname = String(req.body.nickname || '').trim();
  const role = req.body.role;

  if (!username) return res.status(400).json({ message: '用户名不能为空' });
  if (!nickname) return res.status(400).json({ message: '昵称不能为空' });
  if (password.length < 6) return res.status(400).json({ message: '密码至少 6 位' });
  if (password !== confirmPassword) return res.status(400).json({ message: '两次输入的密码不一致' });
  if (!isRole(role)) return res.status(400).json({ message: '请选择正确的账号角色' });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ message: '用户名已存在' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      nickname,
      password: passwordHash,
      role
    }
  });

  res.status(201).json(createAuthResponse(user));
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: '请输入用户名和密码' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const isValidPassword = user ? await bcrypt.compare(password, user.password) : false;
  if (!user || !isValidPassword) {
    return res.status(401).json({ message: '账号或密码错误' });
  }

  res.json(createAuthResponse(user));
}));

app.get('/api/profile', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await getProfilePayload(req.userId!));
}));

app.put('/api/profile', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const examDate = req.body.examDate === '' || req.body.examDate === null ? null : req.body.examDate;
  if (examDate !== null && examDate !== undefined && !isDateString(examDate)) {
    return res.status(400).json({ message: '考试日期格式应为 YYYY-MM-DD' });
  }

  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      examDate,
      dailyAvailableMinutes: req.body.dailyAvailableMinutes === undefined
        ? undefined
        : normalizeMinutes(req.body.dailyAvailableMinutes, 240)
    }
  });
  res.json(await getProfilePayload(req.userId!));
}));

app.post('/api/tasks/generate-week-preview', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const dailyAvailableMinutes = normalizeMinutes(req.body.dailyAvailableMinutes, 360);
  const startDate = isDateString(req.body.startDate) ? req.body.startDate : tomorrow();
  const weakness = {
    english: normalizeWeakness(req.body.weakness?.english),
    politics: normalizeWeakness(req.body.weakness?.politics),
    major1: normalizeWeakness(req.body.weakness?.major1),
    major2: normalizeWeakness(req.body.weakness?.major2)
  };
  const skipExisting = req.body.skipExisting !== false;
  res.json(await buildWeekPlanPreview(req.userId!, { dailyAvailableMinutes, startDate, weakness, skipExisting }));
}));

app.post('/api/tasks/generate-week', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const dailyAvailableMinutes = normalizeMinutes(req.body.dailyAvailableMinutes, 360);
  const startDate = isDateString(req.body.startDate) ? req.body.startDate : tomorrow();
  const weakness = {
    english: normalizeWeakness(req.body.weakness?.english),
    politics: normalizeWeakness(req.body.weakness?.politics),
    major1: normalizeWeakness(req.body.weakness?.major1),
    major2: normalizeWeakness(req.body.weakness?.major2)
  };
  const skipExisting = req.body.skipExisting !== false;
  const preview = await buildWeekPlanPreview(req.userId!, { dailyAvailableMinutes, startDate, weakness, skipExisting });

  if (!skipExisting && preview.existingDates.length) {
    await prisma.studyTask.deleteMany({ where: { userId: req.userId!, date: { in: preview.existingDates } } });
  }
  if (preview.tasks.length) {
    await prisma.studyTask.createMany({
      data: preview.tasks.map((task) => ({ ...task, userId: req.userId! }))
    });
  }
  await prisma.user.update({
    where: { id: req.userId! },
    data: { dailyAvailableMinutes }
  });

  res.status(201).json({ ...preview, createdCount: preview.tasks.length, message: '未来 7 天学习计划已生成' });
}));

app.get('/api/messages', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await getMessagesForStudent(req.userId!));
}));

app.post('/api/bind-code', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const existingPair = await prisma.studyPair.findUnique({
    where: { studentId: req.userId! },
    include: { supervisor: { select: { id: true, username: true, nickname: true } } }
  });
  if (existingPair) {
    return res.status(400).json({
      message: '你已经绑定监督者了',
      bound: true,
      supervisor: existingPair.supervisor
    });
  }

  await prisma.bindCode.updateMany({
    where: { studentId: req.userId!, used: false },
    data: { used: true }
  });

  let code = generateBindCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.bindCode.findUnique({ where: { code } });
    if (!existing) break;
    code = generateBindCode();
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const bindCode = await prisma.bindCode.create({
    data: {
      studentId: req.userId!,
      code,
      expiresAt
    }
  });

  res.status(201).json({ code: bindCode.code, expiresAt: bindCode.expiresAt, used: bindCode.used });
}));

app.get('/api/bind-status', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const pair = await prisma.studyPair.findUnique({
    where: { studentId: req.userId! },
    include: { supervisor: { select: { id: true, username: true, nickname: true } } }
  });
  const latestCode = await prisma.bindCode.findFirst({
    where: { studentId: req.userId!, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    bound: Boolean(pair),
    supervisor: pair?.supervisor ?? null,
    activeCode: latestCode ? { code: latestCode.code, expiresAt: latestCode.expiresAt } : null
  });
}));

app.put('/api/messages/:id/read', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: '留言 ID 不合法' });

  const message = await prisma.message.findFirst({ where: { id, receiverId: req.userId! } });
  if (!message) return res.status(404).json({ message: '留言不存在' });

  const updated = await prisma.message.update({ where: { id }, data: { isRead: true } });
  res.json(updated);
}));

app.get('/api/tasks', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const date = normalizeDate(req.query.date);
  const subject = isSubject(req.query.subject) ? req.query.subject : undefined;
  const tasks = await prisma.studyTask.findMany({
    where: { userId: req.userId, date, ...(subject ? { subject } : {}) },
    orderBy: [{ subject: 'asc' }, { createdAt: 'asc' }]
  });
  res.json(tasks);
}));

app.post('/api/tasks', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  if (!isDateString(req.body.date) || !isSubject(req.body.subject) || !String(req.body.title || '').trim()) {
    return res.status(400).json({ message: '请填写日期、科目和任务标题' });
  }

  const task = await prisma.studyTask.create({
    data: {
      userId: req.userId!,
      date: req.body.date,
      subject: req.body.subject,
      title: String(req.body.title).trim(),
      description: req.body.description || '',
      estimatedMinutes: normalizeMinutes(req.body.estimatedMinutes),
      priority: isPriority(req.body.priority) ? req.body.priority : 'medium',
      status: isTaskStatus(req.body.status) ? req.body.status : 'not_started'
    }
  });
  res.status(201).json(task);
}));

app.put('/api/tasks/:id', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: '任务 ID 不合法' });

  const existing = await prisma.studyTask.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ message: '任务不存在' });

  const nextTitle = req.body.title === undefined ? existing.title : String(req.body.title).trim();
  if (!nextTitle) return res.status(400).json({ message: '任务标题不能为空' });

  const task = await prisma.studyTask.update({
    where: { id },
    data: {
      date: isDateString(req.body.date) ? req.body.date : existing.date,
      subject: isSubject(req.body.subject) ? req.body.subject : existing.subject,
      title: nextTitle,
      description: req.body.description ?? existing.description,
      estimatedMinutes: req.body.estimatedMinutes === undefined ? existing.estimatedMinutes : normalizeMinutes(req.body.estimatedMinutes, existing.estimatedMinutes),
      priority: isPriority(req.body.priority) ? req.body.priority : existing.priority,
      status: isTaskStatus(req.body.status) ? req.body.status : existing.status
    }
  });
  await syncExistingCheckinWithCompletedTasks(req.userId!, existing.date);
  if (task.date !== existing.date) {
    await syncExistingCheckinWithCompletedTasks(req.userId!, task.date);
  }
  res.json(task);
}));

app.delete('/api/tasks/:id', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: '任务 ID 不合法' });

  const existing = await prisma.studyTask.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ message: '任务不存在' });
  await prisma.studyTask.delete({ where: { id } });
  await syncExistingCheckinWithCompletedTasks(req.userId!, existing.date);
  res.status(204).send();
}));

app.post('/api/tasks/default-template', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const date = normalizeDate(req.body.date);
  const existing = await prisma.studyTask.findMany({ where: { userId: req.userId, date } });
  const existingKeys = new Set(existing.map((task) => `${task.subject}:${task.title}`));
  const data = (Object.keys(defaultTemplates) as Subject[]).flatMap((subject) =>
    defaultTemplates[subject]
      .filter((item) => !existingKeys.has(`${subject}:${item.title}`))
      .map((item) => ({ ...item, subject, date, userId: req.userId!, status: 'not_started' }))
  );

  if (data.length) await prisma.studyTask.createMany({ data });
  const tasks = await prisma.studyTask.findMany({ where: { userId: req.userId, date }, orderBy: [{ subject: 'asc' }, { createdAt: 'asc' }] });
  res.status(201).json(tasks);
}));

app.post('/api/checkins', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const date = normalizeDate(req.body.date);
  const completedTaskIds = Array.isArray(req.body.completedTaskIds)
    ? req.body.completedTaskIds.map(Number).filter(Number.isInteger)
    : [];
  const completedTasks = await prisma.studyTask.findMany({
    where: { userId: req.userId, id: { in: completedTaskIds }, date }
  });
  const validCompletedTaskIds = completedTasks.map((task) => task.id);
  const completedSubjects = [...new Set(completedTasks.map((task) => task.subject))];
  const totalStudyMinutes = req.body.totalStudyMinutes === undefined
    ? completedTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
    : normalizeMinutes(req.body.totalStudyMinutes, 0);

  const checkin = await prisma.dailyCheckin.upsert({
    where: { userId_date: { userId: req.userId!, date } },
    create: {
      userId: req.userId!,
      date,
      totalStudyMinutes,
      completedSubjects: JSON.stringify(completedSubjects),
      summary: req.body.summary || '',
      moodScore: Number(req.body.moodScore || 3),
      note: req.body.note || ''
    },
    update: {
      totalStudyMinutes,
      completedSubjects: JSON.stringify(completedSubjects),
      summary: req.body.summary || '',
      moodScore: Number(req.body.moodScore || 3),
      note: req.body.note || ''
    }
  });

  await prisma.checkinTask.deleteMany({ where: { checkinId: checkin.id } });
  if (validCompletedTaskIds.length) {
    await prisma.checkinTask.createMany({
      data: validCompletedTaskIds.map((taskId: number) => ({ checkinId: checkin.id, taskId }))
    });
  }

  res.json(await withCheckinDetails(req.userId!, date));
}));

app.get('/api/checkins', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const checkins = await prisma.dailyCheckin.findMany({ where: { userId: req.userId }, orderBy: { date: 'desc' } });
  res.json(checkins.map((item) => ({ ...item, completedSubjects: parseSubjects(item.completedSubjects) })));
}));

app.get('/api/checkins/:date', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await withCheckinDetails(req.userId!, String(req.params.date)));
}));

app.get('/api/stats/student', requireUser, requireRole('student'), asyncHandler(async (req: AuthedRequest, res) => {
  const date = normalizeDate(req.query.date);
  const summary = await getCompletionSummary(req.userId!, date);
  const checkin = await withCheckinDetails(req.userId!, date);
  const streak = await getStreak(req.userId!);
  res.json({ date, ...summary, checkin, isCheckedIn: Boolean(checkin), streak });
}));

app.get('/api/supervisor/students', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const pairs = await prisma.studyPair.findMany({
    where: { supervisorId: req.userId! },
    include: { student: { select: { id: true, username: true, nickname: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' }
  });
  res.json(pairs.map((pair) => ({ ...pair.student, boundAt: pair.createdAt })));
}));

app.post('/api/supervisor/bind-student', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const code = String(req.body.code || '').trim();
  if (!/^[A-Za-z0-9]{6,8}$/.test(code)) {
    return res.status(400).json({ message: '请输入 6 位数字或 6-8 位字母数字绑定码' });
  }

  const bindCode = await prisma.bindCode.findUnique({
    where: { code },
    include: { student: { select: { id: true, username: true, nickname: true, role: true } } }
  });
  if (!bindCode) return res.status(404).json({ message: '绑定码不存在' });
  if (bindCode.used) return res.status(400).json({ message: '绑定码已经使用过' });
  if (bindCode.expiresAt.getTime() <= Date.now()) return res.status(400).json({ message: '绑定码已过期，请让她重新生成' });
  if (bindCode.student.role !== 'student') return res.status(400).json({ message: '绑定码对应的账号不是学生' });

  const existingPair = await prisma.studyPair.findUnique({
    where: { studentId: bindCode.studentId },
    include: { supervisor: { select: { id: true, username: true, nickname: true } } }
  });
  if (existingPair) {
    return res.status(400).json({ message: '这个学生已经绑定监督者了', supervisor: existingPair.supervisor });
  }

  const pair = await prisma.$transaction(async (tx) => {
    const created = await tx.studyPair.create({
      data: { studentId: bindCode.studentId, supervisorId: req.userId! },
      include: { student: { select: { id: true, username: true, nickname: true } } }
    });
    await tx.bindCode.update({ where: { id: bindCode.id }, data: { used: true } });
    return created;
  });

  res.status(201).json({ message: '绑定成功', student: pair.student });
}));

app.get('/api/supervisor/dashboard', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const student = await getBoundStudentForSupervisor(req.userId!, getRequestedStudentId(req));
  if (!student) return res.json(emptySupervisorDashboard());
  const userId = student.id;
  const date = today();
  const summary = await getCompletionSummary(userId, date);
  const checkin = await withCheckinDetails(userId, date);
  const streak = await getStreak(userId);
  const [recentMessages, unreadMessages] = await Promise.all([
    prisma.message.findMany({ where: { receiverId: userId }, orderBy: { createdAt: 'desc' }, take: 3 }),
    prisma.message.count({ where: { receiverId: userId, isRead: false } })
  ]);
  res.json({ date, student, ...summary, checkin, isCheckedIn: Boolean(checkin), streak, recentMessages, unreadMessages });
}));

app.get('/api/supervisor/checkins', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const student = await getBoundStudentForSupervisor(req.userId!, getRequestedStudentId(req));
  if (!student) return res.json([]);
  const userId = student.id;
  const checkins = await prisma.dailyCheckin.findMany({ where: { userId }, orderBy: { date: 'desc' } });
  res.json(checkins.map((item) => ({ ...item, completedSubjects: parseSubjects(item.completedSubjects) })));
}));

app.get('/api/supervisor/checkins/:date', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const student = await getBoundStudentForSupervisor(req.userId!, getRequestedStudentId(req));
  if (!student) return res.json(null);
  res.json(await withCheckinDetails(student.id, String(req.params.date)));
}));

app.get('/api/supervisor/stats', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const student = await getBoundStudentForSupervisor(req.userId!, getRequestedStudentId(req));
  if (!student) return res.json({ studyMinutes: [], completedTasks: [], subjectMinutes: [] });
  res.json(await getSevenDayStats(student.id));
}));

app.post('/api/supervisor/messages', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ message: '留言内容不能为空' });
  if (!isMessageType(req.body.type)) return res.status(400).json({ message: '留言类型不合法' });

  const student = await getBoundStudentForSupervisor(req.userId!, getRequestedStudentId(req));
  if (!student) return res.status(400).json({ message: '还没有绑定学生，请先输入她给你的绑定码' });
  const message = await prisma.message.create({
    data: {
      senderId: req.userId!,
      receiverId: student.id,
      content,
      type: req.body.type
    }
  });
  res.status(201).json(message);
}));

app.get('/api/supervisor/messages', requireUser, requireRole('supervisor'), asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await getSupervisorMessages(req.userId!, getRequestedStudentId(req)));
}));

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: error.message || '服务器开小差了' });
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
