import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type Subject = 'english' | 'politics' | 'major1' | 'major2';

const subjects: Subject[] = ['english', 'politics', 'major1', 'major2'];
const taskTemplates: Record<Subject, Array<{ title: string; description: string; estimatedMinutes: number; priority: string }>> = {
  english: [
    { title: '单词复习', description: '复习核心词汇，标记反复遗忘的单词。', estimatedMinutes: 30, priority: 'high' },
    { title: '阅读理解训练', description: '完成一篇阅读，整理定位句和错因。', estimatedMinutes: 45, priority: 'high' },
    { title: '长难句分析', description: '拆解 3 个长难句，复述主干和修饰成分。', estimatedMinutes: 30, priority: 'medium' },
    { title: '作文素材积累', description: '积累 2 个表达和 1 个可复用论证素材。', estimatedMinutes: 25, priority: 'medium' }
  ],
  politics: [
    { title: '听课', description: '完成当天课程，记录老师强调的高频考点。', estimatedMinutes: 40, priority: 'medium' },
    { title: '选择题训练', description: '完成一组选择题，订正并标记易混点。', estimatedMinutes: 35, priority: 'high' },
    { title: '错题整理', description: '把错题按知识点归类，写出错误原因。', estimatedMinutes: 25, priority: 'medium' },
    { title: '核心知识点背诵', description: '背诵当天政治核心概念，睡前快速回忆。', estimatedMinutes: 30, priority: 'medium' }
  ],
  major1: [
    { title: '教材阅读', description: '阅读指定章节，整理概念、构成要件和关键词。', estimatedMinutes: 50, priority: 'high' },
    { title: '法条背诵', description: '背诵重点法条，尝试用自己的话复述适用条件。', estimatedMinutes: 40, priority: 'high' },
    { title: '框架整理', description: '梳理本章知识框架，标注易混概念。', estimatedMinutes: 35, priority: 'medium' },
    { title: '真题分析', description: '分析一道真题，整理答题结构和采分点。', estimatedMinutes: 45, priority: 'high' }
  ],
  major2: [
    { title: '知识点背诵', description: '背诵专业课二重点知识点，完成口头自测。', estimatedMinutes: 45, priority: 'high' },
    { title: '案例分析', description: '分析一个典型案例，写出争议焦点和结论。', estimatedMinutes: 40, priority: 'high' },
    { title: '论述题训练', description: '完成一道论述题提纲，强化答题层次。', estimatedMinutes: 45, priority: 'medium' },
    { title: '模拟题整理', description: '整理模拟题中的薄弱点，列入后续复盘清单。', estimatedMinutes: 35, priority: 'medium' }
  ]
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);
  const examDate = new Date();
  examDate.setDate(examDate.getDate() + 168);

  const student = await prisma.user.upsert({
    where: { username: 'student' },
    update: {
      password: passwordHash,
      nickname: '考研学生',
      role: 'student',
      examDate: formatDate(examDate),
      dailyAvailableMinutes: 360
    },
    create: {
      username: 'student',
      nickname: '考研学生',
      password: passwordHash,
      role: 'student',
      examDate: formatDate(examDate),
      dailyAvailableMinutes: 360
    }
  });

  const supervisor = await prisma.user.upsert({
    where: { username: 'supervisor' },
    update: {
      password: passwordHash,
      nickname: '监督者',
      role: 'supervisor'
    },
    create: {
      username: 'supervisor',
      nickname: '监督者',
      password: passwordHash,
      role: 'supervisor'
    }
  });

  await prisma.studyPair.upsert({
    where: { studentId: student.id },
    update: { supervisorId: supervisor.id },
    create: { studentId: student.id, supervisorId: supervisor.id }
  });

  const today = formatDate(new Date());
  for (const subject of subjects) {
    for (const template of taskTemplates[subject]) {
      const existing = await prisma.studyTask.findFirst({
        where: { userId: student.id, date: today, subject, title: template.title }
      });
      if (!existing) {
        await prisma.studyTask.create({
          data: {
            userId: student.id,
            date: today,
            subject,
            title: template.title,
            description: template.description,
            estimatedMinutes: template.estimatedMinutes,
            priority: template.priority,
            status: 'not_started'
          }
        });
      }
    }
  }

  const messageCount = await prisma.message.count({
    where: { senderId: supervisor.id, receiverId: student.id }
  });
  if (messageCount === 0) {
    await prisma.message.createMany({
      data: [
        {
          senderId: supervisor.id,
          receiverId: student.id,
          type: 'encouragement',
          content: '你不是一个人在坚持，我会在后台看着你的努力，也会一直陪着你。',
          isRead: false
        },
        {
          senderId: supervisor.id,
          receiverId: student.id,
          type: 'reminder',
          content: '今天也慢慢来，但不要停。专业课背诵可以放在精力最好的时间段。',
          isRead: false
        }
      ]
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
