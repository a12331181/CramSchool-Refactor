const pages = {
  'school/makeups': { tab: 'makeups', icon: 'calendar', title: '請假與補課' },
  'school/schedule/index': { tab: 'timetable', icon: 'calendar', title: '校務課表' },
  'school/schedule/conflicts': { tab: 'timetable', icon: 'calendar', title: '核對衝堂學生' },
  'school/home': { tab: 'home', icon: 'grid', title: '校務總覽' },
  'courses/index': { tab: 'courses', icon: 'book', title: '課程列表' },
  'courses/calendar': { tab: 'courses', icon: 'book', title: '課程行事曆' },
  'courses/students': { tab: 'courses', icon: 'book', title: '課程學生名單' },
  'students/index': { tab: 'students', icon: 'users', title: '學生名單' },
  'students/detail': { tab: 'students', icon: 'users', title: '學生基本資料' },
  'students/attendance': { tab: 'students', icon: 'users', title: '學生出缺席紀錄' },
  'teachers/index': { tab: 'teachers', icon: 'teacher', title: '教師名單' },
  'account/profile': { tab: 'teachers', icon: 'teacher', title: '教師基本資料' },
  'account/edit-profile': { tab: 'teachers', icon: 'teacher', title: '編輯個人資料' },
  'attendance/index': { tab: 'attendance', icon: 'checklist', title: ctx => ctx.isAdmin ? '課程點名' : '我的授課課程' },
  'attendance/course-sessions': { tab: 'attendance', icon: 'checklist', title: '課堂點名' },
  'attendance/roster': { tab: 'attendance', icon: 'checklist', title: '本堂學生名單' },
  'attendance/history': { tab: 'attendance', icon: 'checklist', title: '點名更正紀錄' },
  'school/diaries/index': { tab: 'diaries', icon: 'journal', title: '教師日誌列表' },
  'school/diaries/course-list': { tab: 'diaries', icon: 'journal', title: '課程教師日誌' },
  'school/diaries/create': { tab: 'diaries', icon: 'journal', title: '建立教師日誌' },
  'school/diaries/detail': { tab: 'diaries', icon: 'journal', title: '教師日誌內容' },
  'school/meetings/index': { tab: 'meetings', icon: 'meeting', title: '會議紀錄' },
  'school/meetings/create': { tab: 'meetings', icon: 'meeting', title: '建立會議紀錄' },
  'school/meetings/detail': { tab: 'meetings', icon: 'meeting', title: '會議內容' },
  'school/introduction': { tab: 'about', icon: 'info', title: '關於系統' },
  'admin/dashboard': { tab: 'admin-home', icon: 'settings', title: '後台總覽' },
  'admin/courses/index': { tab: 'admin-courses', icon: 'book', title: '課程管理' },
  'admin/courses/form': { tab: 'admin-courses', icon: 'book', title: ctx => ctx.course ? '編輯課程' : '建立課程' },
  'admin/calendars/index': { tab: 'admin-courses', icon: 'book', title: '課程行事曆' },
  'admin/calendars/create': { tab: 'admin-courses', icon: 'book', title: '新增課堂' },
  'admin/calendars/create-batch': { tab: 'admin-courses', icon: 'book', title: '批次新增課堂' },
  'admin/calendars/edit': { tab: 'admin-courses', icon: 'book', title: '修改原課堂紀錄' },
  'admin/students/detail': { tab: 'admin-students', icon: 'id', title: '學生基本資料' },
  'admin/students/form': { tab: 'admin-students', icon: 'id', title: ctx => ctx.student ? '編輯學生資料' : '新增學生' },
  'admin/students/enrollment': { tab: 'admin-students', icon: 'id', title: '學生選課' },
  'admin/teachers/index': { tab: 'admin-teachers', icon: 'teacher', title: '教師管理' },
  'admin/teachers/detail': { tab: 'admin-teachers', icon: 'teacher', title: '教師基本資料' },
  'admin/teachers/edit': { tab: 'admin-teachers', icon: 'teacher', title: '編輯教師資料' },
  'admin/users/index': { tab: 'accounts', icon: 'key', title: '帳號管理' },
  'admin/users/invitation': { tab: 'accounts', icon: 'key', title: '教師註冊邀請' },
  'admin/extra-fees/index': { tab: 'extra-fees', icon: 'receipt', title: '額外費用' },
  'admin/extra-fees/form': { tab: 'extra-fees', icon: 'receipt', title: ctx => ctx.extrafee ? '修改額外費用' : '建立新的額外費用' },
  'tuition/course-overview': { tab: 'fees', icon: 'wallet', title: '課程收費列表' },
  'tuition/course-monthly-list': { tab: 'fees', icon: 'wallet', title: '課程學生收費清單' },
  'tuition/course-preview': { tab: 'fees', icon: 'wallet', title: '課程學費預覽' },
  'tuition/student-list': { tab: 'billing', icon: 'receipt', title: '學生學費列表' },
  'tuition/student-preview': { tab: 'billing', icon: 'receipt', title: '學生月學費' },
  'tuition/history': { tab: 'billing', icon: 'receipt', title: '歷期學費列表' },
  'tuition/bill-detail': { tab: 'billing', icon: 'receipt', title: ctx => [ctx.bill?.SupplementCourseId ? '課程補單' : '本期帳單', ctx.documentNo].filter(Boolean).join(' ') },
  'tuition/payment-group-form': { tab: 'billing', icon: 'receipt', title: '合併收款' },
  'tuition/payment-group-detail': { tab: 'billing', icon: 'receipt', title: ctx => '合併收款 #' + ctx.group.id },
  'tuition/cashflow': { tab: 'cashflow', icon: 'flow', title: '收退費對帳' }
}

function getWorkspacePage(view, context) {
  // Express resolves view names with the host platform's path separator.
  const name = String(view).replaceAll('\\', '/')
  const page = pages[name] ?? { tab: '', icon: 'grid', title: '校務工作台' }
  const title = typeof page.title === 'function' ? page.title(context) : page.title
  const courseHistory = name === 'tuition/history' && context.course
  return {
    title: context.workspaceTitle ?? title,
    tab: context.activeNav ?? (courseHistory ? 'fees' : page.tab),
    icon: courseHistory ? 'wallet' : page.icon
  }
}

module.exports = getWorkspacePage
